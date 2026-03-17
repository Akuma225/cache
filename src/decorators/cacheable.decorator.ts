import { applyDecorators, Inject, Optional, UseInterceptors } from '@nestjs/common';
import { AkumaCacheInterceptor } from '../interceptors/cache.interceptor';
import { RedisCacheService } from '../services/redis-cache.service';

export interface CacheableOptions {
    ttl?: number;
    cachePrefix?: string;
}

export function Cacheable(options: CacheableOptions = {}) {
    class CacheInterceptorHost extends AkumaCacheInterceptor {
        constructor(
            @Inject(RedisCacheService) redisService: RedisCacheService,
            @Optional() @Inject('CACHE_DEFAULT_TTL') defaultTtl: number = 3600,
        ) {
            super(redisService, options.ttl || defaultTtl, options.cachePrefix);
        }
    }
    return applyDecorators(
        UseInterceptors(CacheInterceptorHost)
    );
}
