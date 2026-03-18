import { applyDecorators, Inject, Optional, UseInterceptors } from '@nestjs/common';
import { AKUMA_CACHE_OPTIONS, AkumaCacheOptions, CACHE_VERBOSE, TenantResolver } from '../akuma-cache.module';
import { AkumaCacheInterceptor } from '../interceptors/cache.interceptor';
import { RedisCacheService } from '../services/redis-cache.service';

export interface CacheableOptions {
    ttl?: number;
    cachePrefix?: string;
    scope?: 'tenant' | 'global';
    tenantResolver?: TenantResolver;
}

export function Cacheable(options: CacheableOptions = {}) {
    class CacheInterceptorHost extends AkumaCacheInterceptor {
        constructor(
            @Inject(RedisCacheService) redisService: RedisCacheService,
            @Optional() @Inject('CACHE_DEFAULT_TTL') defaultTtl: number = 3600,
            @Optional() @Inject(CACHE_VERBOSE) verbose: boolean = false,
            @Optional() @Inject(AKUMA_CACHE_OPTIONS) moduleOptions: AkumaCacheOptions = {},
        ) {
            super(
                redisService,
                options.ttl || defaultTtl,
                options.cachePrefix,
                options.scope,
                verbose,
                moduleOptions,
                options.tenantResolver,
            );
        }
    }
    return applyDecorators(
        UseInterceptors(CacheInterceptorHost)
    );
}
