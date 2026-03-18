import { RedisClientType, createClient } from 'redis';
import { RedisCacheService } from './redis-cache.service';

jest.mock('redis', () => ({
    createClient: jest.fn(),
}));

type RedisErrorHandler = (error: unknown) => void;

interface MockRedisClient {
    isOpen: boolean;
    connect: jest.Mock<Promise<void>>;
    quit: jest.Mock<Promise<void>>;
    get: jest.Mock<Promise<string | null>>;
    set: jest.Mock<Promise<void>>;
    setEx: jest.Mock<Promise<void>>;
    del: jest.Mock<Promise<number>>;
    scanIterator: jest.Mock<AsyncIterable<string | string[]>>;
    on: jest.Mock<MockRedisClient>;
}

function createMockRedisClient(overrides?: Partial<MockRedisClient>): {
    client: RedisClientType;
    handlers: Record<string, RedisErrorHandler[]>;
    mock: MockRedisClient;
} {
    const handlers: Record<string, RedisErrorHandler[]> = {};

    const mock: MockRedisClient = {
        isOpen: false,
        connect: jest.fn(async () => {
            mock.isOpen = true;
        }),
        quit: jest.fn(async () => {
            mock.isOpen = false;
        }),
        get: jest.fn(async () => null),
        set: jest.fn(async () => undefined),
        setEx: jest.fn(async () => undefined),
        del: jest.fn(async () => 0),
        scanIterator: jest.fn(async function* () {
            yield [];
        }),
        on: jest.fn((event: string, handler: RedisErrorHandler) => {
            handlers[event] = handlers[event] ?? [];
            handlers[event].push(handler);
            return mock;
        }),
        ...overrides,
    };

    return {
        client: mock as unknown as RedisClientType,
        handlers,
        mock,
    };
}

describe('RedisCacheService', () => {
    const createClientMock = createClient as unknown as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('configure le client avec url en priorite', () => {
        const { client } = createMockRedisClient();
        createClientMock.mockReturnValue(client);

        const service = new RedisCacheService({
            url: 'redis://:secret@redis-cache:6379/0',
            host: 'ignored-host',
            port: 6380,
            connectTimeoutMs: 1200,
        });

        expect(service).toBeDefined();
        expect(createClientMock).toHaveBeenCalledWith({
            url: 'redis://:secret@redis-cache:6379/0',
            database: undefined,
            socket: {
                connectTimeout: 1200,
            },
        });
    });

    it('utilise host/port fournis sans fallback localhost', () => {
        const { client } = createMockRedisClient();
        createClientMock.mockReturnValue(client);

        const service = new RedisCacheService({
            host: 'redis',
            port: 6379,
        });

        expect(service).toBeDefined();
        expect(createClientMock).toHaveBeenCalledWith({
            socket: {
                host: 'redis',
                port: 6379,
                connectTimeout: 5000,
            },
            password: undefined,
            database: undefined,
        });
    });

    it('retry au boot quand Redis est indisponible puis disponible', async () => {
        const { client, mock } = createMockRedisClient();
        createClientMock.mockReturnValue(client);

        let attempt = 0;
        mock.connect.mockImplementation(async () => {
            attempt += 1;
            if (attempt < 3) {
                throw new Error('ECONNREFUSED redis:6379');
            }
            mock.isOpen = true;
        });

        const service = new RedisCacheService({
            host: 'redis',
            port: 6379,
            maxInitRetries: 4,
            retryDelayMs: 1,
            failFastOnInit: true,
        });

        await expect(service.onModuleInit()).resolves.toBeUndefined();
        expect(mock.connect).toHaveBeenCalledTimes(3);
    });

    it("n'echoue pas au boot si failFastOnInit=false", async () => {
        const { client, mock } = createMockRedisClient();
        createClientMock.mockReturnValue(client);
        mock.connect.mockRejectedValue(new Error('ECONNREFUSED redis:6379'));

        const service = new RedisCacheService({
            host: 'redis',
            port: 6379,
            maxInitRetries: 2,
            retryDelayMs: 1,
            failFastOnInit: false,
        });

        await expect(service.onModuleInit()).resolves.toBeUndefined();
        expect(mock.connect).toHaveBeenCalledTimes(2);
    });

    it("enregistre un handler 'error' des la creation du client", () => {
        const { client, handlers } = createMockRedisClient();
        createClientMock.mockReturnValue(client);

        const service = new RedisCacheService({
            host: 'redis',
            port: 6379,
        });

        expect(service).toBeDefined();
        expect(handlers.error).toBeDefined();
        expect(handlers.error).toHaveLength(1);
        expect(() => handlers.error[0](new Error('ECONNREFUSED redis:6379'))).not.toThrow();
    });

    it('partage la meme promesse de connexion en concurrence', async () => {
        const { client, mock } = createMockRedisClient();
        createClientMock.mockReturnValue(client);

        let resolver: (() => void) | undefined;
        mock.connect.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolver = () => {
                        mock.isOpen = true;
                        resolve();
                    };
                }),
        );
        mock.get.mockResolvedValue('cached-value');

        const service = new RedisCacheService({
            host: 'redis',
            port: 6379,
        });

        const getPromise = service.get('k1');
        const setPromise = service.set('k2', 'v2');
        expect(mock.connect).toHaveBeenCalledTimes(1);

        resolver?.();

        await expect(Promise.all([getPromise, setPromise])).resolves.toEqual(['cached-value', undefined]);
        expect(mock.connect).toHaveBeenCalledTimes(1);
    });

    it('cache serialise les objets et set en redis', async () => {
        const { client, mock } = createMockRedisClient({
            isOpen: true,
        });
        createClientMock.mockReturnValue(client);

        const service = new RedisCacheService({
            host: 'redis',
            port: 6379,
        });

        await expect(service.cache('user:1', { id: 1, role: 'admin' }, 60)).resolves.toBeUndefined();
        expect(mock.setEx).toHaveBeenCalledWith('user:1', 60, JSON.stringify({ id: 1, role: 'admin' }));
    });

    it('invalidate accepte un pattern unique', async () => {
        const { client, mock } = createMockRedisClient({
            isOpen: true,
        });
        createClientMock.mockReturnValue(client);
        mock.scanIterator.mockImplementation(async function* () {
            yield ['k1', 'k2'];
        });
        mock.del.mockResolvedValue(2);

        const service = new RedisCacheService({
            host: 'redis',
            port: 6379,
        });

        await expect(service.invalidate('users*')).resolves.toBe(2);
        expect(mock.del).toHaveBeenCalledWith(['k1', 'k2']);
    });

    it('invalidate accepte plusieurs patterns et cumule le resultat', async () => {
        const { client, mock } = createMockRedisClient({
            isOpen: true,
        });
        createClientMock.mockReturnValue(client);

        let callIndex = 0;
        mock.scanIterator.mockImplementation(async function* () {
            callIndex += 1;
            if (callIndex === 1) {
                yield ['users:1'];
                return;
            }
            yield ['users:2', 'users:3'];
        });

        mock.del.mockResolvedValue(1).mockResolvedValueOnce(1).mockResolvedValueOnce(2);

        const service = new RedisCacheService({
            host: 'redis',
            port: 6379,
        });

        await expect(service.invalidate(['users:1*', 'users:2*'])).resolves.toBe(3);
        expect(mock.del).toHaveBeenCalledTimes(2);
    });
});
