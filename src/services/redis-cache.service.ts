import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { AKUMA_CACHE_OPTIONS, AkumaCacheOptions } from '../akuma-cache.module';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
    private readonly client: RedisClientType;

    constructor(
        @Optional()
        @Inject(AKUMA_CACHE_OPTIONS)
        private readonly options: AkumaCacheOptions = {},
    ) {
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
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.client.isOpen) {
            await this.client.quit();
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

    async delByPattern(pattern: string): Promise<void> {
        await this.ensureConnected();
        const keysToDelete: string[] = [];

        for await (const key of this.client.scanIterator({
            MATCH: pattern,
            COUNT: 100,
        })) {
            if (typeof key === 'string') {
                keysToDelete.push(key);
            }
        }

        if (keysToDelete.length > 0) {
            await this.client.del(keysToDelete);
        }
    }

    private async ensureConnected(): Promise<void> {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }
}
