import {
    CallHandler,
    ExecutionContext,
    Inject,
    Injectable,
    NestInterceptor,
    Optional,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest } from 'fastify';
import { AkumaRedisService } from '@akuma225/redis-adapter';
import * as crypto from 'crypto';

@Injectable()
export class AkumaCacheInterceptor implements NestInterceptor {
    constructor(
        @Inject(AkumaRedisService) private readonly redisService: AkumaRedisService,
        @Optional() @Inject('CACHE_DEFAULT_TTL') private readonly ttl: number = 3600
    ) {}

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const request = context.switchToHttp().getRequest<FastifyRequest>();
        const key = this.generateKey(request);

        console.log(`Cache interceptor: ${key}`);

        const cachedResponse = await this.redisService.get(key);
        if (cachedResponse) {
            console.log(`Cache hit: ${key}`);
            return of(JSON.parse(cachedResponse));
        }

        return next.handle().pipe(
            tap(async (response) => {
                await this.redisService.set(key, JSON.stringify(response), this.ttl);
            }),
        );
    }

    private generateKey(request: FastifyRequest): string {
        const method = request.method;
        const url = request.url;
        const query = request.query || {};
        const params = request.params || {};
        const body = request.body || {};
        const env = process.env.NODE_ENV || 'development';

        const resource = url || 'root';
        const namespace = `${env}-${method.toUpperCase()}-${resource}`;

        const queryHash = crypto
            .createHash('md5')
            .update(JSON.stringify(query))
            .digest('hex');
        const paramsHash = crypto
            .createHash('md5')
            .update(JSON.stringify(params))
            .digest('hex');
        const bodyHash = crypto
            .createHash('md5')
            .update(JSON.stringify(body))
            .digest('hex');

        return `${namespace}-${bodyHash}-${paramsHash}-${queryHash}`;
    }
}
