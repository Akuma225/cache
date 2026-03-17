import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { AKUMA_CACHE_OPTIONS, AkumaCacheOptions } from '../akuma-cache.module';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
    private readonly client: RedisClientType;
    private readonly logger = new Logger(RedisCacheService.name);
    private readonly verbose: boolean;

    constructor(
        @Optional()
        @Inject(AKUMA_CACHE_OPTIONS)
        private readonly options: AkumaCacheOptions = {},
    ) {
        this.verbose = options.verbose || false;
        this.client = createClient(
            options.url
                ? { url: options.url, database: options.db }
                : {
                      socket: {
                          host: options.host || '127.0.0.1',
                          port: options.port || 6379,
                      },
                      password: options.password,
                      database: options.db,
                  },
        );
    }

    async onModuleInit(): Promise<void> {
        if (!this.client.isOpen) {
            await this.client.connect();
            this.debug('Redis connection opened');
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

    private async ensureConnected(): Promise<void> {
        if (!this.client.isOpen) {
            await this.client.connect();
            this.debug('Redis connection reopened');
        }
    }

    private debug(message: string): void {
        if (this.verbose) {
            this.logger.log(message);
        }
    }
}
