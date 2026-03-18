import { AkumaCacheOptions } from '../akuma-cache.module';
import { buildBaseCacheKey, buildCacheKey, HttpRequestLike, scopeInvalidationPattern } from './cache-key.util';

describe('cache-key util', () => {
    const baseRequest: HttpRequestLike = {
        method: 'GET',
        url: '/users',
        query: { page: 1 },
        params: { id: '10' },
        body: {},
    };

    it("garde la cle legacy quand tenantAware est desactive", () => {
        const baseKey = buildBaseCacheKey(baseRequest);
        const key = buildCacheKey(baseRequest, {
            cachePrefix: 'api-',
            moduleOptions: {
                tenantAware: false,
            },
        });

        expect(key).toBe(`api-${baseKey}`);
    });

    it('genere des cles differentes pour des tenants differents', () => {
        const requestTenantA: HttpRequestLike = {
            ...baseRequest,
            headers: { 'x-tenant-id': 'UserA' },
        };
        const requestTenantB: HttpRequestLike = {
            ...baseRequest,
            headers: { 'x-tenant-id': 'UserB' },
        };
        const moduleOptions: AkumaCacheOptions = {
            tenantAware: true,
        };

        const keyA = buildCacheKey(requestTenantA, { moduleOptions });
        const keyB = buildCacheKey(requestTenantB, { moduleOptions });

        expect(keyA).toContain('tenant:usera:');
        expect(keyB).toContain('tenant:userb:');
        expect(keyA).not.toBe(keyB);
    });

    it('priorise tenantResolver du decorateur sur module/header/claim', () => {
        const request: HttpRequestLike = {
            ...baseRequest,
            headers: { 'x-tenant-id': 'from-header' },
            user: { tenantId: 'from-claim' },
        };
        const moduleOptions: AkumaCacheOptions = {
            tenantAware: true,
            tenantResolver: () => 'from-module',
        };

        const key = buildCacheKey(request, {
            moduleOptions,
            tenantResolver: () => 'from-decorator',
        });

        expect(key).toContain('tenant:from-decorator:');
    });

    it('utilise le fallback global si tenant absent', () => {
        const key = buildCacheKey(baseRequest, {
            moduleOptions: {
                tenantAware: true,
                tenantFallback: 'global',
            },
        });

        expect(key).toContain('tenant:global:');
    });

    it("retourne null si tenantFallback=reject et tenant absent", () => {
        const key = buildCacheKey(baseRequest, {
            moduleOptions: {
                tenantAware: true,
                tenantFallback: 'reject',
            },
        });

        expect(key).toBeNull();
    });

    it("scope l'invalidation sur le tenant courant en mode tenant", () => {
        const request: HttpRequestLike = {
            ...baseRequest,
            headers: { 'x-tenant-id': 'user1' },
        };

        const pattern = scopeInvalidationPattern('baseKey*', request, {
            scope: 'tenant',
            moduleOptions: {
                tenantAware: true,
            },
        });

        expect(pattern).toBe('tenant:user1:baseKey*');
    });

    it("laisse le pattern intact en mode global", () => {
        const request: HttpRequestLike = {
            ...baseRequest,
            headers: { 'x-tenant-id': 'user1' },
        };

        const pattern = scopeInvalidationPattern('baseKey*', request, {
            scope: 'global',
            moduleOptions: {
                tenantAware: true,
            },
        });

        expect(pattern).toBe('baseKey*');
    });

    it('respecte un pattern deja scope tenant', () => {
        const request: HttpRequestLike = {
            ...baseRequest,
            headers: { 'x-tenant-id': 'user1' },
        };

        const pattern = scopeInvalidationPattern('tenant:user9:baseKey*', request, {
            scope: 'tenant',
            moduleOptions: {
                tenantAware: true,
            },
        });

        expect(pattern).toBe('tenant:user9:baseKey*');
    });
});
