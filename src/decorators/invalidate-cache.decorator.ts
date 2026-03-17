import { applyDecorators, Inject, UseInterceptors } from '@nestjs/common';
import { AkumaCacheInvalidationInterceptor } from '../interceptors/cache-invalidation.interceptor';
import { RedisCacheService } from '../services/redis-cache.service';

export function InvalidateCache(patterns: string[]) {
    class CacheInvalidationInterceptorHost extends AkumaCacheInvalidationInterceptor {
        constructor(
            @Inject(RedisCacheService) redisService: RedisCacheService,
        ) {
            super(redisService, patterns);
        }
    }
    return applyDecorators(
        UseInterceptors(CacheInvalidationInterceptorHost)
    );
}
