# @akuma225/cache

Module NestJS de cache HTTP basé sur Redis.

## Sommaire

- [En bref](#en-bref)
- [Démarrage rapide (60 secondes)](#démarrage-rapide-60-secondes)
- [Installation](#installation)
- [Prérequis](#prérequis)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [API](#api)
- [Scripts](#scripts)
- [Contribuer](#contribuer)
- [Licence](#licence)

## En bref

`@akuma225/cache` permet de:

- mettre en cache les réponses HTTP avec `@Cacheable()`,
- invalider facilement des groupes de clés avec `@InvalidateCache()`,
- isoler les clés par tenant pour les applications multi-tenant (SaaS, B2B),
- intégrer Redis simplement dans un module NestJS.

## Démarrage rapide (60 secondes)

1. Installez le package:

```bash
npm install @akuma225/cache
```

2. Ajoutez le module dans votre `AppModule`:

```ts
AkumaCacheModule.forRoot({
  host: '127.0.0.1',
  port: 6379,
  defaultTtl: 3600,
  // Activez ces options uniquement si votre API est multi-tenant:
  // tenantAware: true,
  // tenantHeaderName: 'x-tenant-id',
  // tenantClaimPath: 'tenantId',
  // tenantFallback: 'global', // ou 'reject'
});
```

3. Cachez une route avec `@Cacheable()`:

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

## Prérequis

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
      // Priorité: url > host/port/password/db
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
      // Activez la partie tenant uniquement pour une API multi-tenant:
      tenantAware: false,
      tenantHeaderName: 'x-tenant-id',
      tenantClaimPath: 'tenantId',
      tenantFallback: 'global',
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

## Utilisation

### Quand utiliser le mode multi-tenant (`tenant-aware`)

Utilisez `tenantAware: true` si plusieurs organisations (tenants) partagent la meme API et que vous devez isoler strictement les données de cache entre elles.

Cas d'usage typiques:

- application SaaS B2B avec un tenant par client,
- API mutualisée avec séparation logique des données,
- risque de collisions de cache entre clients sur les memes routes.

Quand ne pas l'utiliser:

- API mono-tenant,
- API publique sans notion de tenant,
- besoin explicite d'un cache global partagé entre tous les utilisateurs.

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

- `ttl?: number` - TTL de la clé en secondes
- `cachePrefix?: string` - si renseigné, le préfixe est ajouté devant la clé standard
- `scope?: 'tenant' | 'global'` - force la portée du cache pour cette route (sinon, suit la configuration du module)
- `tenantResolver?: (request) => string | undefined` - fonction locale pour résoudre le tenant

#### Options détaillées de `@Cacheable(options)`

| Option | Type | Défaut | Effet |
| --- | --- | --- | --- |
| `ttl` | `number` | `defaultTtl` du module | Durée de vie de l'entrée cache en secondes. |
| `cachePrefix` | `string` | `undefined` | Préfixe la clé standard générée par le module. |
| `scope` | `'tenant' \| 'global'` | `undefined` | Surcharge la portée par route. Si `undefined`, la route suit le mode module (`tenantAware`). |
| `tenantResolver` | `(request) => string \| undefined` | `undefined` | Fonction locale prioritaire pour construire une clé multi-tenant. |

Comportement de `cachePrefix`:

- La structure de clé reste identique (env, méthode, URL, hash body/params/query).
- Seul un préfixe est ajouté devant, ce qui permet de segmenter les clés par domaine/contexte.

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

#### Options détaillées de `@InvalidateCache(patterns)`

`patterns` est un tableau de patterns Redis utilisés pour supprimer les clés correspondantes.

Important: ce sont des **patterns Redis (glob)**, pas des regex JavaScript.

### Syntaxe des patterns d'invalidation

- `*` : zéro ou plusieurs caractères  
  ex: `users*`, `*users*`
- `?` : exactement un caractère  
  ex: `user-?` matche `user-1` mais pas `user-10`
- `[abc]` : un caractère parmi la liste  
  ex: `status-[ad]*` matche `status-a...` ou `status-d...`
- `[a-z]` : un caractère dans un intervalle  
  ex: `item-[0-9]*`

### Exemples utiles

- `users*` : invalide toutes les clés qui commencent par `users`
- `*users*` : invalide toutes les clés qui contiennent `users` (n'importe où)
- `production-GET-/reference-data/sectors*` : invalide un namespace API précis
- `report-*-2026*` : invalide une famille de clés versionnées/préfixées

### Bonnes pratiques

- Utiliser des préfixes cohérents dans `cachePrefix` pour cibler facilement (`public-`, `admin-`, etc.).
- Préférer des patterns spécifiques pour éviter des suppressions trop larges.
- Si vous utilisez `@Cacheable({ cachePrefix: 'public-' })`, invalidez avec des patterns qui incluent ce préfixe, par exemple `public-*`.
- Pour invalider une ressource "partout dans la clé", utiliser `*terme*` (ex: `*sectors*`).

Exemple avec plusieurs patterns:

```ts
@Post(':id')
@InvalidateCache(['users*', 'profile-*'])
async updateUser() {
  return this.usersService.update();
}
```

Options de `@InvalidateCache(patterns, options)`:

- `scope?: 'tenant' | 'global'` (défaut: `global`)
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

En plus des décorateurs, vous pouvez injecter `RedisCacheService` et utiliser des méthodes directes:

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

Méthodes disponibles:

- `get(key)` / `set(key, value, ttl?)` (bas niveau)
- `cache(key, value, ttl?)` (serialise automatiquement les objets)
- `delByPattern(pattern)` / `invalidate(pattern | pattern[])`

## API

### `AkumaCacheModule.forRoot(options)`

| Option | Type | Défaut |
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

Version non-globale du module (même options que `forRoot`).

### Résilience Redis (démarrage et réseau)

Ces options servent a garder votre API stable quand Redis est lent, temporairement indisponible, ou indisponible au démarrage.

| Option | Rôle | Quand l'ajuster |
| --- | --- | --- |
| `connectTimeoutMs` | Temps max d'attente pour établir une connexion Redis. | Augmenter si votre réseau est lent (cloud, VPN, container distant). |
| `maxInitRetries` | Nombre maximal de tentatives de connexion au démarrage. | Augmenter si Redis démarre après l'API (orchestration, cold start). |
| `retryDelayMs` | Délai de base entre deux tentatives (backoff exponentiel). | Augmenter pour réduire la pression réseau en cas de panne Redis. |
| `failFastOnInit` | Si `true`, stoppe l'app si Redis est indisponible au boot. Si `false`, l'app démarre sans cache. | `true` pour un cache critique; `false` pour privilégier la disponibilité de l'API. |

Comportement de configuration:

- Priorité de connexion: `url`, puis `host/port/password/db`.
- Si `host/port` ne sont pas fournis, le module tente `REDIS_HOST` / `REDIS_PORT`, puis repli local.
- Les options passées via `forRoot` / `forRootAsync` sont utilisées explicitement pour éviter une initialisation avec des valeurs inattendues.

### Cache multi-tenant (`tenant-aware`)

Le mode multi-tenant évite qu'un tenant A lise une entrée de cache générée pour un tenant B.

Format des clés:

- Format: `tenant:<tenantId>:<baseKey>`

Résolution du tenant (ordre de priorité):

1. `tenantResolver` passé à `@Cacheable(...)`
2. `tenantResolver` configuré au module
3. en-tête HTTP (`tenantHeaderName`, défaut `x-tenant-id`)
4. claim JWT utilisateur (`tenantClaimPath`, défaut `tenantId`)

Comportement si tenant introuvable (`tenantFallback`):

- `'global'` (défaut): bascule sur un cache global,
- `'reject'`: refuse le cache multi-tenant pour la requête courante.

Configuration module:

```ts
AkumaCacheModule.forRoot({
  tenantAware: true,
  tenantHeaderName: 'x-tenant-id',
  tenantClaimPath: 'tenantId',
  tenantFallback: 'global', // ou 'reject'
});
```

Exemple avec fonction locale de résolution sur un endpoint:

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

Exemple pour forcer un cache global sur une route même si `tenantAware` est activé au module:

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

Invalidation multi-tenant:

- Par défaut, `@InvalidateCache(...)` invalide globalement.
- Avec `@InvalidateCache(..., { scope: 'tenant' })`, l'invalidation est limitée au tenant courant.
- Pour invalider tous les tenants, utiliser `scope: 'global'`.

### Logs verbose

Quand `verbose: true`, le module affiche des logs NestJS pour:

- connexions Redis (ou reconnexions),
- `cache hit` / `cache miss` (succès/échec de lecture),
- écritures cache (`set`) et erreurs de lecture/écriture,
- invalidation par pattern avec le nombre de clés supprimées.

## Scripts

```bash
npm run build
npm test
npm run lint
```

## Contribuer

Les contributions sont les bienvenues.

Si vous voulez proposer une amélioration:

1. Ouvrez une issue pour discuter du besoin (bug, idée, doc, ergonomie).
2. Créez une branche dédiée et ajoutez des tests si le comportement change.
3. Soumettez une Pull Request claire, avec contexte et impact.

Types de contributions utiles:

- amélioration de la documentation et des exemples,
- corrections de bugs,
- optimisation de performance,
- évolution de l'API et de l'expérience développeur.

## Licence

MIT
