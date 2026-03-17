import { applyDecorators, Inject, Optional, UseInterceptors } from '@nestjs/common';
import { CACHE_VERBOSE } from '../akuma-cache.module';
import { AkumaCacheInvalidationInterceptor } from '../interceptors/cache-invalidation.interceptor';
import { RedisCacheService } from '../services/redis-cache.service';

export function InvalidateCache(patterns: string[]) {
    class CacheInvalidationInterceptorHost extends AkumaCacheInvalidationInterceptor {
        constructor(
            @Inject(RedisCacheService) redisService: RedisCacheService,
            @Optional() @Inject(CACHE_VERBOSE) verbose: boolean = false,
        ) {
            super(redisService, patterns, verbose);
        }
    }
    return applyDecorators(
        UseInterceptors(CacheInvalidationInterceptorHost)
    );
}
