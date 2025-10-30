import { applyDecorators, Inject, Optional, UseInterceptors } from '@nestjs/common';
import { AkumaCacheInterceptor } from '../interceptors/cache.interceptor';
import { AkumaRedisService } from '@akuma225/redis-adapter';

export interface CacheableOptions {
    ttl?: number;
}

export function Cacheable(options: CacheableOptions = {}) {
    class CacheInterceptorHost extends AkumaCacheInterceptor {
        constructor(
            @Inject(AkumaRedisService) redisService: AkumaRedisService,
            @Optional() @Inject('CACHE_DEFAULT_TTL') defaultTtl: number = 3600
        ) {
            super(redisService, options.ttl || defaultTtl);
        }
    }
    return applyDecorators(
        UseInterceptors(CacheInterceptorHost)
    );
}
