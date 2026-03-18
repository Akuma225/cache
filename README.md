# @akuma225/cache

Module NestJS de cache HTTP basé sur Redis.

## Installation

```bash
npm install @akuma225/cache
```

## Prerequis

- Node.js 18+
- NestJS 10+
- Une instance Redis accessible

## Configuration

```ts
import { Module } from '@nestjs/common';
import { AkumaCacheModule } from '@akuma225/cache';

@Module({
  imports: [
    AkumaCacheModule.forRoot({
      // Priorite: url > host/port/password/db
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
    }),
  ],
})
export class AppModule {}
```

### Configuration asynchrone (`forRootAsync`)

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
          throw new Error('Configuration cache manquante');
        }
        return config;
      },
    }),
  ],
})
export class AppModule {}
```

### Recommandation Docker / compose

Utilisez le hostname du service Redis (pas `127.0.0.1`) :

```yaml
services:
  api:
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      - redis

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

Exemple module NestJS cote API:

```ts
AkumaCacheModule.forRoot({
  host: process.env.REDIS_HOST ?? 'redis',
  port: Number(process.env.REDIS_PORT ?? 6379),
  connectTimeoutMs: 5000,
  maxInitRetries: 10,
  retryDelayMs: 300,
  failFastOnInit: false, // ne tue pas l'app si Redis demarre plus tard
});
```

## Utilisation

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

Options disponibles:

- `ttl?: number` - TTL de la cle en secondes
- `cachePrefix?: string` - si renseigne, le prefix est ajoute devant la cle standard
- `scope?: 'tenant' | 'global'` - force le scope de cache pour cette route (sinon suit la config module)
- `tenantResolver?: (request) => string | undefined` - override local pour resoudre le tenant

#### Options detaillees de `@Cacheable(options)`

| Option | Type | Defaut | Effet |
| --- | --- | --- | --- |
| `ttl` | `number` | `defaultTtl` du module | Duree de vie de l'entree cache en secondes. |
| `cachePrefix` | `string` | `undefined` | Prefixe la cle standard generee par le module. |
| `scope` | `'tenant' \| 'global'` | `undefined` | Override du scope par route. Si `undefined`, la route suit `tenantAware` module. |
| `tenantResolver` | `(request) => string \| undefined` | `undefined` | Resolver local prioritaire pour construire une cle tenant-aware. |

Comportement de `cachePrefix`:

- La structure de cle reste identique (env, methode, url, hash body/params/query).
- Seul un prefixe est ajoute devant, ce qui permet de segmenter les cles par domaine/contexte.

Exemple:

```ts
@Get('report')
@Cacheable({ ttl: 120, cachePrefix: 'report-' })
async report() {
  return this.reportService.generate();
}
```

### `@InvalidateCache()`

```ts
import { Body, Controller, Post } from '@nestjs/common';
import { InvalidateCache } from '@akuma225/cache';

@Controller('users')
export class UsersController {
  @Post()
  @InvalidateCache(['users*'])
  async createUser(@Body() payload: any) {
    return this.usersService.create(payload);
  }
}
```

#### Options detaillees de `@InvalidateCache(patterns)`

`patterns` est un tableau de patterns Redis utilises pour supprimer les cles correspondantes.

Important: ce sont des **patterns Redis (glob)**, pas des regex JavaScript.

### Syntaxe des patterns d'invalidation

- `*` : zero ou plusieurs caracteres  
  ex: `users*`, `*users*`
- `?` : exactement un caractere  
  ex: `user-?` matche `user-1` mais pas `user-10`
- `[abc]` : un caractere parmi la liste  
  ex: `status-[ad]*` matche `status-a...` ou `status-d...`
- `[a-z]` : un caractere dans un intervalle  
  ex: `item-[0-9]*`

### Exemples utiles

- `users*` : invalide toutes les cles qui commencent par `users`
- `*users*` : invalide toutes les cles qui contiennent `users` (n'importe ou)
- `production-GET-/reference-data/sectors*` : invalide un namespace API precis
- `report-*-2026*` : invalide une famille de cles versionnees/prefixees

### Bonnes pratiques

- Utiliser des prefixes coherents dans `cachePrefix` pour cibler facilement (`public-`, `admin-`, etc.).
- Preferer des patterns specifiques pour eviter des suppressions trop larges.
- Si vous utilisez `@Cacheable({ cachePrefix: 'public-' })`, invalidez avec des patterns qui incluent ce prefixe, par exemple `public-*`.
- Pour invalider une ressource "partout dans la cle", utiliser `*terme*` (ex: `*sectors*`).

Exemple avec plusieurs patterns:

```ts
@Post(':id')
@InvalidateCache(['users*', 'profile-*'])
async updateUser() {
  return this.usersService.update();
}
```

Options de `@InvalidateCache(patterns, options)`:

- `scope?: 'tenant' | 'global'` (defaut: `global`)
- `tenantResolver?: (request) => string | undefined`

Exemple invalidation globale explicite:

```ts
@Post('admin/rebuild-cache')
@InvalidateCache(['users*'], { scope: 'global' })
async rebuildAllUsersCache() {
  return { ok: true };
}
```

### Utilisation directe dans un service NestJS

En plus des decorateurs, vous pouvez injecter `RedisCacheService` et utiliser des methodes directes:

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

Methodes disponibles:

- `get(key)` / `set(key, value, ttl?)` (bas niveau)
- `cache(key, value, ttl?)` (serialise automatiquement les objets)
- `delByPattern(pattern)` / `invalidate(pattern | pattern[])`

## API

### `AkumaCacheModule.forRoot(options)`

| Option | Type | Defaut |
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

Version non-globale du module (meme options que `forRoot`).

### Resilience Redis (demarrage et reseau)

- Priorite de configuration: `url` puis `host/port/password/db`.
- Si vous fournissez `url` ou `host`, le module ne force pas de fallback implicite vers `127.0.0.1`.
- En cas de Redis indisponible au boot, le module applique des retries avec backoff exponentiel:
  - tentative `1..maxInitRetries`,
  - delai de base `retryDelayMs`,
  - timeout socket `connectTimeoutMs`.
- Avec `failFastOnInit: false` (defaut), l'application NestJS continue de demarrer meme si Redis est temporairement indisponible.
- Si `host/port` ne sont pas fournis dans les options (ou vides), le module tente `REDIS_HOST` / `REDIS_PORT` depuis l'environnement avant le fallback final local.
- L'initialisation de `RedisCacheService` est liee explicitement au provider d'options du module (`forRoot` / `forRootAsync`) pour eviter l'utilisation involontaire des valeurs par defaut quand une config est bien fournie.

### Cache tenant-aware

La cle peut etre scopee par tenant avec un prefixe strict:

- Format: `tenant:<tenantId>:<baseKey>`
- Priorite de resolution du tenant:
  1. `tenantResolver` passe a `@Cacheable(...)`
  2. `tenantResolver` configure au module
  3. header (`tenantHeaderName`, defaut `x-tenant-id`)
  4. claim utilisateur (`tenantClaimPath`, defaut `tenantId`)

Configuration module:

```ts
AkumaCacheModule.forRoot({
  tenantAware: true,
  tenantHeaderName: 'x-tenant-id',
  tenantClaimPath: 'tenantId',
  tenantFallback: 'global', // ou 'reject'
});
```

Exemple avec resolver local sur un endpoint:

```ts
@Get('profile')
@Cacheable({
  ttl: 120,
  scope: 'tenant',
  tenantResolver: (request: any) => request.user?.tenantId,
})
async getProfile() {
  return this.profileService.get();
}
```

Exemple pour forcer un cache global sur une route meme si `tenantAware` est active au module:

```ts
@Get('public-catalog')
@Cacheable({
  ttl: 300,
  scope: 'global',
})
async getPublicCatalog() {
  return this.catalogService.list();
}
```

Invalidation tenant-aware:

- Par defaut, `@InvalidateCache(...)` invalide globalement.
- Avec `@InvalidateCache(..., { scope: 'tenant' })`, l'invalidation est limitee au tenant courant.
- Pour invalider tous les tenants, utiliser `scope: 'global'`.

### Logs verbose

Quand `verbose: true`, le module affiche des logs NestJS pour:

- connexions Redis (ou reconnexions),
- `cache hit` / `cache miss`,
- ecritures cache (`set`) et erreurs de lecture/ecriture,
- invalidation par pattern avec le nombre de cles supprimees.

## Scripts

```bash
npm run build
npm test
npm run lint
```

## Licence

MIT
