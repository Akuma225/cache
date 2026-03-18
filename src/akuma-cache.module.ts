import { DynamicModule, Module, ModuleMetadata, Provider } from '@nestjs/common';
import { RedisCacheService } from './services/redis-cache.service';

export interface AkumaCacheOptions {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    url?: string;
    defaultTtl?: number;
    verbose?: boolean;
    connectTimeoutMs?: number;
    maxInitRetries?: number;
    retryDelayMs?: number;
    failFastOnInit?: boolean;
}

export interface AkumaCacheAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    inject?: any[];
    useFactory: (...args: any[]) => Promise<AkumaCacheOptions> | AkumaCacheOptions;
}

export const AKUMA_CACHE_OPTIONS = 'AKUMA_CACHE_OPTIONS';
export const CACHE_VERBOSE = 'CACHE_VERBOSE';

@Module({})
export class AkumaCacheModule {
    static register(options: AkumaCacheOptions = {}): DynamicModule {
        return {
            module: AkumaCacheModule,
            providers: this.createProviders({
                provide: AKUMA_CACHE_OPTIONS,
                useValue: options,
            }),
            exports: [RedisCacheService, 'CACHE_DEFAULT_TTL', CACHE_VERBOSE],
        };
    }

    static forRoot(options: AkumaCacheOptions = {}): DynamicModule {
        const moduleRef = this.register(options);
        return {
            ...moduleRef,
            global: true,
        };
    }

    static forRootAsync(options: AkumaCacheAsyncOptions): DynamicModule {
        return {
            module: AkumaCacheModule,
            imports: options.imports || [],
            providers: this.createProviders({
                provide: AKUMA_CACHE_OPTIONS,
                useFactory: options.useFactory,
                inject: options.inject || [],
            }),
            exports: [RedisCacheService, 'CACHE_DEFAULT_TTL', CACHE_VERBOSE],
            global: true,
        };
    }

    private static createProviders(optionsProvider: Provider): Provider[] {
        return [
            optionsProvider,
            RedisCacheService,
            {
                provide: 'CACHE_DEFAULT_TTL',
                useFactory: (options: AkumaCacheOptions) => options.defaultTtl || 3600,
                inject: [AKUMA_CACHE_OPTIONS],
            },
            {
                provide: CACHE_VERBOSE,
                useFactory: (options: AkumaCacheOptions) => options.verbose || false,
                inject: [AKUMA_CACHE_OPTIONS],
            },
        ];
    }
}
