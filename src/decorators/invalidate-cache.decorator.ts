import { applyDecorators, Inject, UseInterceptors } from '@nestjs/common';
import { AkumaCacheInvalidationInterceptor } from '../interceptors/cache-invalidation.interceptor';
import { AkumaRedisService } from '@akuma225/redis-adapter';

export function InvalidateCache(patterns: string[]) {
    class CacheInvalidationInterceptorHost extends AkumaCacheInvalidationInterceptor {
        constructor(
            @Inject(AkumaRedisService) redisService: AkumaRedisService
        ) {
            super(redisService, patterns);
        }
    }
    return applyDecorators(
        UseInterceptors(CacheInvalidationInterceptorHost)
    );
}
