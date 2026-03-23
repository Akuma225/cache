import {
    CallHandler,
    ExecutionContext,
    Logger,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisCacheService } from '../services/redis-cache.service';
import { AkumaCacheOptions, TenantResolver } from '../akuma-cache.module';
import { HttpRequestLike, scopeInvalidationPattern } from '../utils/cache-key.util';

export interface InvalidateCacheRuntimeOptions {
    scope?: 'tenant' | 'global';
    tenantResolver?: TenantResolver;
}

@Injectable()
export class AkumaCacheInvalidationInterceptor implements NestInterceptor<unknown, unknown> {
    private readonly logger = new Logger(AkumaCacheInvalidationInterceptor.name);

    constructor(
        private readonly redisService: RedisCacheService,
        private readonly patterns: string[],
        private readonly verbose: boolean = false,
        private readonly moduleOptions: AkumaCacheOptions = {},
        private readonly options: InvalidateCacheRuntimeOptions = {},
    ) {}

    intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
        const request = context.switchToHttp().getRequest<HttpRequestLike>();
        return next.handle().pipe(
            tap(() => {
                void this.invalidatePatterns(request);
            }),
        );
    }

    private async invalidatePatterns(request: HttpRequestLike): Promise<void> {
        for (const pattern of this.patterns) {
            const scopedPattern = scopeInvalidationPattern(pattern, request, {
                scope: this.options.scope ?? 'global',
                moduleOptions: this.moduleOptions,
                tenantResolver: this.options.tenantResolver,
            });

            if (!scopedPattern) {
                this.debug(`Pattern "${pattern}" skipped: tenant resolution failed with reject fallback`);
                continue;
            }

            try {
                const deletedCount = await this.redisService.delByPattern(scopedPattern);
                this.debug(`Pattern "${scopedPattern}" invalidated ${deletedCount} key(s)`);
            } catch {
                this.debug(`Cache invalidation failed for pattern: ${scopedPattern}`);
                // Fail-open: do not break endpoint response on invalidation failure.
            }
        }
    }

    private debug(message: string): void {
        if (this.verbose) {
            this.logger.log(message);
        }
    }
}
