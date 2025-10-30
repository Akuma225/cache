import {
    CallHandler,
    ExecutionContext,
    Inject,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AkumaRedisService } from '@akuma225/redis-adapter';

@Injectable()
export class AkumaCacheInvalidationInterceptor implements NestInterceptor {
    constructor(
        @Inject(AkumaRedisService) private readonly redisService: AkumaRedisService,
        private readonly patterns: string[]
    ) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        return next.handle().pipe(
            tap(async () => {
                for (const pattern of this.patterns) {
                    console.log(`Invalidating cache for pattern: ${pattern}`);
                    await this.redisService.delByPattern(pattern);
                }
            }),
        );
    }
}
