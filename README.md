# @akuma225/cache

Module NestJS de cache HTTP basé sur Redis.

## Installation

```bash
npm install @akuma225/cache redis
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
- `cachePrefix?: string` - si renseigne, la cle est generee au format `cachePrefix + Date.now()`

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

### `AkumaCacheModule.register(options)`

Version non-globale du module (meme options que `forRoot`).

## Scripts

```bash
npm run build
npm test
npm run lint
```

## Publication npm

Le package est publie sur npmjs.org via GitHub Actions.

Important pour eviter l'erreur `E403` avec 2FA:

- Soit configurer le package npm en **trusted publishing** pour GitHub Actions.
- Soit utiliser un token npm **Automation** ou **Granular avec bypass 2FA pour publish** dans le secret `NPM_TOKEN`.

## Licence

MIT
