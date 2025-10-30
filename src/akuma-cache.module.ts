import { DynamicModule, Module } from '@nestjs/common';
import { AkumaRedisModule, AkumaRedisService } from '@akuma225/redis-adapter';
import { AkumaCacheInterceptor } from './interceptors/cache.interceptor';
import { AkumaCacheInvalidationInterceptor } from './interceptors/cache-invalidation.interceptor';

export interface AkumaCacheOptions {
    host?: string;
    port?: number;
    password?: string;
    defaultTtl?: number;
}

@Module({})
export class AkumaCacheModule {
    static register(options: AkumaCacheOptions = {}): DynamicModule {
        const { defaultTtl } = options;

        return {
            module: AkumaCacheModule,
            imports: [AkumaRedisModule],
            providers: [
                {
                    provide: 'CACHE_DEFAULT_TTL',
                    useValue: defaultTtl || 3600,
                },
            ],
            exports: [AkumaRedisModule],
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
