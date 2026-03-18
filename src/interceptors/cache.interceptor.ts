import {
    CallHandler,
    ExecutionContext,
    Logger,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisCacheService } from '../services/redis-cache.service';
import { AkumaCacheOptions, TenantResolver } from '../akuma-cache.module';
import { buildCacheKey, HttpRequestLike } from '../utils/cache-key.util';

@Injectable()
export class AkumaCacheInterceptor implements NestInterceptor {
    private readonly logger = new Logger(AkumaCacheInterceptor.name);

    constructor(
        private readonly redisService: RedisCacheService,
        private readonly ttl: number = 3600,
        private readonly cachePrefix?: string,
        private readonly verbose: boolean = false,
        private readonly moduleOptions: AkumaCacheOptions = {},
        private readonly tenantResolver?: TenantResolver,
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest<HttpRequestLike>();
        const key = this.generateKey(request);
        if (!key) {
            this.debug('Cache skipped: tenant resolution failed with reject fallback');
            return next.handle();
        }

        try {
            const cachedResponse = await this.redisService.get(key);
            if (cachedResponse) {
                this.debug(`Cache hit for key: ${key}`);
                return of(JSON.parse(cachedResponse));
            }
            this.debug(`Cache miss for key: ${key}`);
        } catch {
            this.debug(`Cache read failed for key: ${key}`);
            // Fail-open: continue request flow if cache read fails.
        }

        return next.handle().pipe(
            tap((response) => {
                try {
                    const payload = JSON.stringify(response);
                    void this.redisService
                        .set(key, payload, this.ttl)
                        .then(() => {
                            this.debug(`Cache set for key: ${key} (ttl: ${this.ttl}s)`);
                        })
                        .catch(() => {
                            this.debug(`Cache set failed for key: ${key}`);
                        });
                } catch {
                    this.debug(`Response serialization failed for key: ${key}`);
                    // Ignore non-serializable responses for cache storage.
                }
            }),
        );
    }

    private generateKey(request: HttpRequestLike): string | null {
        return buildCacheKey(request, {
            cachePrefix: this.cachePrefix,
            moduleOptions: this.moduleOptions,
            tenantResolver: this.tenantResolver,
        });
    }

    private debug(message: string): void {
        if (this.verbose) {
            this.logger.log(message);
        }
    }
}
