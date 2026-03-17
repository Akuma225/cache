import { DynamicModule, Module } from '@nestjs/common';
import { RedisCacheService } from './services/redis-cache.service';

export interface AkumaCacheOptions {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    url?: string;
    defaultTtl?: number;
}

export const AKUMA_CACHE_OPTIONS = 'AKUMA_CACHE_OPTIONS';

@Module({})
export class AkumaCacheModule {
    static register(options: AkumaCacheOptions = {}): DynamicModule {
        const { defaultTtl } = options;

        return {
            module: AkumaCacheModule,
            providers: [
                {
                    provide: AKUMA_CACHE_OPTIONS,
                    useValue: options,
                },
                RedisCacheService,
                {
                    provide: 'CACHE_DEFAULT_TTL',
                    useValue: defaultTtl || 3600,
                },
            ],
            exports: [RedisCacheService, 'CACHE_DEFAULT_TTL'],
        };
    }

    static forRoot(options: AkumaCacheOptions = {}): DynamicModule {
        const moduleRef = this.register(options);
        return {
            ...moduleRef,
            global: true,
        };
    }
}
