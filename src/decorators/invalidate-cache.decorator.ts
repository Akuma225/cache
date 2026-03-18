import { applyDecorators, Inject, Optional, UseInterceptors } from '@nestjs/common';
import {
    AKUMA_CACHE_OPTIONS,
    AkumaCacheOptions,
    CACHE_VERBOSE,
    TenantResolver,
} from '../akuma-cache.module';
import {
    AkumaCacheInvalidationInterceptor,
    InvalidateCacheRuntimeOptions,
} from '../interceptors/cache-invalidation.interceptor';
import { RedisCacheService } from '../services/redis-cache.service';

export interface InvalidateCacheOptions {
    scope?: 'tenant' | 'global';
    tenantResolver?: TenantResolver;
}

export function InvalidateCache(patterns: string[], options: InvalidateCacheOptions = {}) {
    class CacheInvalidationInterceptorHost extends AkumaCacheInvalidationInterceptor {
        constructor(
            @Inject(RedisCacheService) redisService: RedisCacheService,
            @Optional() @Inject(CACHE_VERBOSE) verbose: boolean = false,
            @Optional() @Inject(AKUMA_CACHE_OPTIONS) moduleOptions: AkumaCacheOptions = {},
        ) {
            const runtimeOptions: InvalidateCacheRuntimeOptions = {
                scope: options.scope ?? 'tenant',
                tenantResolver: options.tenantResolver,
            };
            super(redisService, patterns, verbose, moduleOptions, runtimeOptions);
        }
    }
    return applyDecorators(
        UseInterceptors(CacheInvalidationInterceptorHost)
    );
}
