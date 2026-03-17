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

@Injectable()
export class AkumaCacheInvalidationInterceptor implements NestInterceptor {
    private readonly logger = new Logger(AkumaCacheInvalidationInterceptor.name);

    constructor(
        private readonly redisService: RedisCacheService,
        private readonly patterns: string[],
        private readonly verbose: boolean = false,
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
                const deletedCount = await this.redisService.delByPattern(pattern);
                this.debug(`Pattern "${pattern}" invalidated ${deletedCount} key(s)`);
            } catch {
                this.debug(`Cache invalidation failed for pattern: ${pattern}`);
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
