import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createClient } from 'redis';
import { AKUMA_CACHE_OPTIONS, AkumaCacheOptions } from '../akuma-cache.module';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
    private readonly client: ReturnType<typeof createClient>;
    private readonly logger = new Logger(RedisCacheService.name);
    private readonly verbose: boolean;
    private readonly connectTimeoutMs: number;
    private readonly maxInitRetries: number;
    private readonly retryDelayMs: number;
    private readonly failFastOnInit: boolean;
    private connectPromise: Promise<void> | null = null;

    constructor(
        @Optional()
        @Inject(AKUMA_CACHE_OPTIONS)
        private readonly options: AkumaCacheOptions = {},
    ) {
        this.verbose = options.verbose ?? false;
        this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
        this.maxInitRetries = options.maxInitRetries ?? 5;
        this.retryDelayMs = options.retryDelayMs ?? 250;
        this.failFastOnInit = options.failFastOnInit ?? false;

        this.client = createClient(this.buildClientConfig());
        this.client.on('error', (error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Redis error (${this.getConnectionLabel()}): ${message}`);
        });
    }

    async onModuleInit(): Promise<void> {
        try {
            await this.ensureConnected();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Unable to connect to Redis on module init (${this.getConnectionLabel()}): ${message}`);
            if (this.failFastOnInit) {
                throw error;
            }
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.client.isOpen) {
            await this.client.quit();
            this.debug('Redis connection closed');
        }
    }

    async get(key: string): Promise<string | null> {
        await this.ensureConnected();
        return this.client.get(key);
    }

    async set(key: string, value: string, ttl?: number): Promise<void> {
        await this.ensureConnected();
        if (ttl && ttl > 0) {
            await this.client.setEx(key, ttl, value);
            return;
        }
        await this.client.set(key, value);
    }

    async cache(key: string, value: unknown, ttl?: number): Promise<void> {
        if (typeof value === 'string') {
            await this.set(key, value, ttl);
            return;
        }

        await this.set(key, JSON.stringify(value), ttl);
    }

    async delByPattern(pattern: string): Promise<number> {
        await this.ensureConnected();
        const keysToDelete: string[] = [];

        for await (const scanResult of this.client.scanIterator({
            MATCH: pattern,
            COUNT: 100,
        })) {
            if (Array.isArray(scanResult)) {
                keysToDelete.push(...scanResult);
                continue;
            }

            if (typeof scanResult === 'string') {
                keysToDelete.push(scanResult);
            }
        }

        if (keysToDelete.length > 0) {
            await this.client.del(keysToDelete);
        }

        this.debug(`Invalidation pattern "${pattern}" deleted ${keysToDelete.length} key(s)`);
        return keysToDelete.length;
    }

    async invalidate(patterns: string | string[]): Promise<number> {
        const list = Array.isArray(patterns) ? patterns : [patterns];
        let totalDeleted = 0;

        for (const pattern of list) {
            totalDeleted += await this.delByPattern(pattern);
        }

        return totalDeleted;
    }

    private async ensureConnected(): Promise<void> {
        if (this.client.isOpen) {
            return;
        }

        if (this.connectPromise) {
            await this.connectPromise;
            return;
        }

        this.connectPromise = this.connectWithRetries();
        try {
            await this.connectPromise;
        } finally {
            this.connectPromise = null;
        }
    }

    private buildClientConfig(): Parameters<typeof createClient>[0] {
        if (this.options.url) {
            return {
                url: this.options.url,
                database: this.options.db,
                socket: {
                    connectTimeout: this.connectTimeoutMs,
                },
            };
        }

        const hasSocketConfig =
            this.options.host !== undefined ||
            this.options.port !== undefined ||
            this.options.password !== undefined ||
            this.options.db !== undefined;

        if (hasSocketConfig) {
            const socket: { host?: string; port?: number; connectTimeout: number } = {
                connectTimeout: this.connectTimeoutMs,
            };
            if (this.options.host !== undefined) {
                socket.host = this.options.host;
            }
            if (this.options.port !== undefined) {
                socket.port = this.options.port;
            }

            return {
                socket,
                password: this.options.password,
                database: this.options.db,
            };
        }

        return {
            socket: {
                host: '127.0.0.1',
                port: 6379,
                connectTimeout: this.connectTimeoutMs,
            },
            database: this.options.db,
        };
    }

    private async connectWithRetries(): Promise<void> {
        const attempts = Math.max(1, this.maxInitRetries);

        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                await this.client.connect();
                this.debug(`Redis connected (${this.getConnectionLabel()})`);
                return;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const isLastAttempt = attempt >= attempts;

                if (isLastAttempt) {
                    this.logger.warn(
                        `Redis connection failed after ${attempt}/${attempt} attempt(s) (${this.getConnectionLabel()}): ${message}`,
                    );
                    throw error;
                }

                const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
                this.logger.warn(
                    `Redis connection attempt ${attempt}/${attempts} failed (${this.getConnectionLabel()}). Retry in ${delay}ms`,
                );
                await this.sleep(delay);
            }
        }
    }

    private getConnectionLabel(): string {
        if (this.options.url) {
            return this.maskRedisUrl(this.options.url);
        }

        const hasSocketConfig = this.options.host !== undefined || this.options.port !== undefined;
        if (hasSocketConfig) {
            const host = this.options.host ?? '<default>';
            const port = this.options.port ?? 6379;
            return `${host}:${port}`;
        }

        return '127.0.0.1:6379';
    }

    private maskRedisUrl(rawUrl: string): string {
        try {
            const parsedUrl = new URL(rawUrl);
            const authMask = parsedUrl.username || parsedUrl.password ? '***@' : '';
            const host = parsedUrl.host || '<unknown-host>';
            const dbPath = parsedUrl.pathname || '';
            return `${parsedUrl.protocol}//${authMask}${host}${dbPath}`;
        } catch {
            return '<invalid-redis-url>';
        }
    }

    private sleep(delayMs: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, delayMs);
        });
    }

    private debug(message: string): void {
        if (this.verbose) {
            this.logger.log(message);
        }
    }
}
