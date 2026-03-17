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
import * as crypto from 'crypto';

interface HttpRequestLike {
    method: string;
    url: string;
    query?: unknown;
    params?: unknown;
    body?: unknown;
}

@Injectable()
export class AkumaCacheInterceptor implements NestInterceptor {
    private readonly logger = new Logger(AkumaCacheInterceptor.name);

    constructor(
        private readonly redisService: RedisCacheService,
        private readonly ttl: number = 3600,
        private readonly cachePrefix?: string,
        private readonly verbose: boolean = false,
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest<HttpRequestLike>();
        const key = this.generateKey(request);

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

    private generateKey(request: HttpRequestLike): string {
        const method = request.method;
        const url = request.url;
        const query = request.query || {};
        const params = request.params || {};
        const body = request.body || {};
        const env = process.env.NODE_ENV || 'development';

        const resource = url || 'root';
        const namespace = `${env}-${method.toUpperCase()}-${resource}`;

        const queryHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(query))
            .digest('hex');
        const paramsHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(params))
            .digest('hex');
        const bodyHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(body))
            .digest('hex');

        const baseKey = `${namespace}-${bodyHash}-${paramsHash}-${queryHash}`;
        if (this.cachePrefix) {
            return `${this.cachePrefix}${baseKey}`;
        }

        return baseKey;
    }

    private debug(message: string): void {
        if (this.verbose) {
            this.logger.log(message);
        }
    }
}
