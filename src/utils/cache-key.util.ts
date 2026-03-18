import * as crypto from 'crypto';
import { AkumaCacheOptions, TenantResolver } from '../akuma-cache.module';

export interface HttpRequestLike {
    method: string;
    url: string;
    query?: unknown;
    params?: unknown;
    body?: unknown;
    headers?: Record<string, unknown>;
    user?: unknown;
}

interface BuildCacheKeyOptions {
    cachePrefix?: string;
    moduleOptions?: AkumaCacheOptions;
    tenantResolver?: TenantResolver;
}

interface ScopeInvalidationPatternOptions {
    scope?: 'tenant' | 'global';
    moduleOptions?: AkumaCacheOptions;
    tenantResolver?: TenantResolver;
}

export function buildCacheKey(request: HttpRequestLike, options: BuildCacheKeyOptions = {}): string | null {
    const moduleOptions = options.moduleOptions ?? {};
    const baseKey = buildBaseCacheKey(request);
    const scopedBaseKey = options.cachePrefix ? `${options.cachePrefix}${baseKey}` : baseKey;
    const shouldScopeByTenant = shouldUseTenantScope(moduleOptions, options.tenantResolver);

    if (!shouldScopeByTenant) {
        return scopedBaseKey;
    }

    const tenantId = resolveTenantId(request, moduleOptions, options.tenantResolver);
    if (tenantId) {
        return `tenant:${tenantId}:${scopedBaseKey}`;
    }

    if ((moduleOptions.tenantFallback ?? 'global') === 'reject') {
        return null;
    }

    return `tenant:global:${scopedBaseKey}`;
}

export function scopeInvalidationPattern(
    pattern: string,
    request: HttpRequestLike,
    options: ScopeInvalidationPatternOptions = {},
): string | null {
    if (pattern.startsWith('tenant:')) {
        return pattern;
    }

    if (options.scope === undefined || options.scope === 'global') {
        return pattern;
    }

    const moduleOptions = options.moduleOptions ?? {};
    const shouldScopeByTenant = shouldUseTenantScope(moduleOptions, options.tenantResolver);
    if (!shouldScopeByTenant) {
        return pattern;
    }

    const tenantId = resolveTenantId(request, moduleOptions, options.tenantResolver);
    if (tenantId) {
        return `tenant:${tenantId}:${pattern}`;
    }

    if ((moduleOptions.tenantFallback ?? 'global') === 'reject') {
        return null;
    }

    return `tenant:global:${pattern}`;
}

export function buildBaseCacheKey(request: HttpRequestLike): string {
    const method = request.method;
    const url = request.url;
    const query = request.query || {};
    const params = request.params || {};
    const body = request.body || {};
    const env = process.env.NODE_ENV || 'development';

    const resource = url || 'root';
    const namespace = `${env}-${method.toUpperCase()}-${resource}`;

    const queryHash = crypto.createHash('sha256').update(JSON.stringify(query)).digest('hex');
    const paramsHash = crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex');
    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');

    return `${namespace}-${bodyHash}-${paramsHash}-${queryHash}`;
}

export function resolveTenantId(
    request: HttpRequestLike,
    moduleOptions: AkumaCacheOptions = {},
    tenantResolver?: TenantResolver,
): string | undefined {
    const fromDecorator = normalizeTenantId(tenantResolver?.(request));
    if (fromDecorator) {
        return fromDecorator;
    }

    const fromModuleResolver = normalizeTenantId(moduleOptions.tenantResolver?.(request));
    if (fromModuleResolver) {
        return fromModuleResolver;
    }

    const headerName = moduleOptions.tenantHeaderName ?? 'x-tenant-id';
    const fromHeader = normalizeTenantId(readHeader(request.headers, headerName));
    if (fromHeader) {
        return fromHeader;
    }

    const claimPath = moduleOptions.tenantClaimPath ?? 'tenantId';
    const fromClaim = normalizeTenantId(readPath(request.user, claimPath));
    if (fromClaim) {
        return fromClaim;
    }

    return undefined;
}

function shouldUseTenantScope(moduleOptions: AkumaCacheOptions, tenantResolver?: TenantResolver): boolean {
    return Boolean(moduleOptions.tenantAware || moduleOptions.tenantResolver || tenantResolver);
}

function normalizeTenantId(rawValue: unknown): string | undefined {
    if (typeof rawValue !== 'string') {
        return undefined;
    }

    const normalized = rawValue.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-');
    if (!normalized) {
        return undefined;
    }

    return normalized;
}

function readHeader(headers: Record<string, unknown> | undefined, key: string): string | undefined {
    if (!headers) {
        return undefined;
    }

    const targetKey = key.toLowerCase();
    for (const [headerKey, headerValue] of Object.entries(headers)) {
        if (headerKey.toLowerCase() !== targetKey) {
            continue;
        }

        if (typeof headerValue === 'string') {
            return headerValue;
        }

        if (Array.isArray(headerValue) && headerValue.length > 0 && typeof headerValue[0] === 'string') {
            return headerValue[0];
        }
    }

    return undefined;
}

function readPath(source: unknown, path: string): unknown {
    if (!source || !path) {
        return undefined;
    }

    const parts = path.split('.');
    let cursor: unknown = source;
    for (const part of parts) {
        if (!cursor || typeof cursor !== 'object' || !(part in cursor)) {
            return undefined;
        }

        cursor = (cursor as Record<string, unknown>)[part];
    }

    return cursor;
}
