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
      host: '127.0.0.1',
      port: 6379,
      // password: 'secret',
      // db: 0,
      // url: 'redis://localhost:6379',
      defaultTtl: 3600,
      verbose: false,
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

#### Options detaillees de `@Cacheable(options)`

| Option | Type | Defaut | Effet |
| --- | --- | --- | --- |
| `ttl` | `number` | `defaultTtl` du module | Duree de vie de l'entree cache en secondes. |
| `cachePrefix` | `string` | `undefined` | Prefixe la cle standard generee par le module. |

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

### `AkumaCacheModule.register(options)`

Version non-globale du module (meme options que `forRoot`).

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
