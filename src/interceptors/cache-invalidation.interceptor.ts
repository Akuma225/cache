import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisCacheService } from '../services/redis-cache.service';

@Injectable()
export class AkumaCacheInvalidationInterceptor implements NestInterceptor {
    constructor(
        private readonly redisService: RedisCacheService,
        private readonly patterns: string[],
    ) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            tap(() => {
                void this.invalidatePatterns();
            }),
        );
    }

    private async invalidatePatterns(): Promise<void> {
        for (const pattern of this.patterns) {
            try {
                await this.redisService.delByPattern(pattern);
            } catch {
                // Fail-open: do not break endpoint response on invalidation failure.
            }
        }
    }
}
