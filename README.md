# @akuma225/cache

NestJS Redis-based HTTP caching module with cache invalidation and tenant-aware key isolation.

![npm version](https://img.shields.io/npm/v/%40akuma225%2Fcache)
![npm downloads](https://img.shields.io/npm/dw/%40akuma225%2Fcache)
![release workflow](https://img.shields.io/github/actions/workflow/status/akuma225/cache/publish.yml?branch=master&label=release)
![license](https://img.shields.io/npm/l/%40akuma225%2Fcache)

## Table of Contents

- [Overview](#overview)
- [Quick Start (60 seconds)](#quick-start-60-seconds)
- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Usage](#usage)
- [API](#api)
- [Release Process](#release-process)
- [Commit Convention](#commit-convention)
- [Scripts](#scripts)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

## Overview

`@akuma225/cache` helps you:

- cache HTTP responses with `@Cacheable()`,
- invalidate cache key groups with `@InvalidateCache()`,
- isolate cache keys per tenant for multi-tenant APIs,
- integrate Redis in a NestJS module with minimal setup.

## Quick Start (60 seconds)

1. Install the package:

```bash
npm install @akuma225/cache
```

2. Register the module in your `AppModule`:

```ts
AkumaCacheModule.forRoot({
  host: '127.0.0.1',
  port: 6379,
  defaultTtl: 3600,
  // Enable these options only for multi-tenant APIs:
  // tenantAware: true,
  // tenantHeaderName: 'x-tenant-id',
  // tenantClaimPath: 'tenantId',
  // tenantFallback: 'global', // or 'reject'
});
```

3. Cache an endpoint:

```ts
@Get()
@Cacheable({ ttl: 300 })
async listUsers() {
  return this.usersService.findAll();
}
```

## Installation

```bash
npm install @akuma225/cache
```

## Prerequisites

- Node.js 18+
- NestJS 10+
- Reachable Redis instance

## Configuration

```ts
import { Module } from '@nestjs/common';
import { AkumaCacheModule } from '@akuma225/cache';

@Module({
  imports: [
    AkumaCacheModule.forRoot({
      // Priority: url > host/port/password/db
      host: '127.0.0.1',
      port: 6379,
      // password: 'secret',
      // db: 0,
      // url: 'redis://localhost:6379',
      defaultTtl: 3600,
      verbose: false,
      connectTimeoutMs: 5000,
      maxInitRetries: 5,
      retryDelayMs: 250,
      failFastOnInit: false,
      // Enable tenant options only for multi-tenant APIs
      tenantAware: false,
      tenantHeaderName: 'x-tenant-id',
      tenantClaimPath: 'tenantId',
      tenantFallback: 'global',
    }),
  ],
})
export class AppModule {}
```

### Async Configuration (`forRootAsync`)

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AkumaCacheModule, AkumaCacheOptions } from '@akuma225/cache';

@Module({
  imports: [
    ConfigModule.forRoot(),
    AkumaCacheModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): AkumaCacheOptions => {
        const config = configService.get<AkumaCacheOptions>('cache');
        if (!config) {
          throw new Error('Missing cache configuration');
        }
        return config;
      },
    }),
  ],
})
export class AppModule {}
```

## Usage

### When to enable tenant-aware mode

Use `tenantAware: true` when multiple organizations share one API and cache data must be strictly isolated across tenants.

Typical use cases:

- B2B SaaS applications with one tenant per customer,
- shared API runtime with logical tenant data separation,
- risk of cache key collisions across customers on the same routes.

Do not use tenant mode when:

- the API is single-tenant,
- the API is public and has no tenant concept,
- you intentionally need one shared global cache.

### `@Cacheable()`

```ts
import { Controller, Get } from '@nestjs/common';
import { Cacheable } from '@akuma225/cache';

@Controller('users')
export class UsersController {
  @Get()
  @Cacheable({ ttl: 300 })
  async listUsers() {
    return this.usersService.findAll();
  }
}
```

Available options:

- `ttl?: number` - key TTL in seconds
- `cachePrefix?: string` - optional prefix added before the generated key
- `scope?: 'tenant' | 'global'` - route-level scope override
- `tenantResolver?: (request) => string | undefined` - route-level tenant resolver

### `@InvalidateCache()`

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { InvalidateCache } from '@akuma225/cache';

@Controller('users')
export class UsersController {
  @Post()
  @InvalidateCache(['users*'])
  async createUser(@Body() payload: unknown) {
    return this.usersService.create(payload);
  }
}
```

`patterns` are Redis glob patterns (not JavaScript regexes).

Useful examples:

- `users*` - keys starting with `users`
- `*users*` - keys containing `users`
- `production-GET-/reference-data/sectors*` - API namespace invalidation
- `report-*-2026*` - prefixed/versioned key family

### Direct service usage

```ts
import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '@akuma225/cache';

@Injectable()
export class ReferenceDataService {
  constructor(private readonly cacheService: RedisCacheService) {}

  async warmupSectors(): Promise<void> {
    await this.cacheService.cache('reference:sectors', { items: [] }, 300);
  }

  async refreshReferenceData(): Promise<void> {
    await this.cacheService.invalidate(['reference:*', 'public-reference:*']);
  }
}
```

## API

### `AkumaCacheModule.forRoot(options)`

| Option | Type | Default |
| --- | --- | --- |
| `host` | `string` | `127.0.0.1` |
| `port` | `number` | `6379` |
| `password` | `string` | `undefined` |
| `db` | `number` | `undefined` |
| `url` | `string` | `undefined` |
| `defaultTtl` | `number` | `3600` |
| `verbose` | `boolean` | `false` |
| `connectTimeoutMs` | `number` | `5000` |
| `maxInitRetries` | `number` | `5` |
| `retryDelayMs` | `number` | `250` |
| `failFastOnInit` | `boolean` | `false` |
| `tenantAware` | `boolean` | `false` |
| `tenantResolver` | `(request) => string \| undefined` | `undefined` |
| `tenantHeaderName` | `string` | `'x-tenant-id'` |
| `tenantClaimPath` | `string` | `'tenantId'` |
| `tenantFallback` | `'global' \| 'reject'` | `'global'` |

### `AkumaCacheModule.register(options)`

Non-global module registration (same options as `forRoot`).

### Redis resilience

| Option | Purpose | When to tune |
| --- | --- | --- |
| `connectTimeoutMs` | Max time to establish Redis connection. | Increase for slower network paths (cloud, VPN, remote container). |
| `maxInitRetries` | Max retries during startup connection. | Increase when Redis starts later than API. |
| `retryDelayMs` | Base delay between retries (exponential backoff). | Increase to reduce pressure during outages. |
| `failFastOnInit` | If `true`, app fails when Redis is unavailable on boot. | Set `true` when cache is critical; keep `false` to maximize API availability. |

## Release Process

Releases are fully automated with `semantic-release` on pushes to `master`.

For each release run:

1. Commit history is analyzed using Conventional Commits.
2. Next version is calculated with Semantic Versioning:
   - `fix:` -> patch
   - `feat:` -> minor
   - `feat!:` or `BREAKING CHANGE:` -> major
3. `CHANGELOG.md` is updated automatically.
4. A GitHub Release is created with generated notes.
5. The package is published to npm.

## Commit Convention

Use Conventional Commits so release automation can infer the correct version bump.

Examples:

- `fix(cache): handle redis timeout fallback`
- `feat(module): add per-route tenant resolver`
- `feat!: remove deprecated options shape`
- `refactor(interceptor): simplify cache key composition`
- `docs(readme): clarify tenant-aware use cases`

## Scripts

```bash
npm run build
npm test
npm run test:coverage
npm run lint
npm run release:dry
```

## Contributing

Contributions are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for:

- development setup,
- commit format and examples,
- pull request checklist.

## Changelog

See [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT
