# @akuma225/cache

Module NestJS pour la gestion du cache avec Redis, incluant des intercepteurs et des décorateurs pour une utilisation facile.

## Caractéristiques

- Intégration facile avec NestJS
- Basé sur Redis pour des performances optimales
- Décorateurs pour la mise en cache et l'invalidation
- Génération automatique des clés de cache
- Support des TTL personnalisés
- Invalidation par pattern
- Tests unitaires complets

## Installation

Ce package nécessite `@akuma225/redis-adapter` comme dépendance. Installez d'abord le package Redis, puis le package Cache :

```bash
# D'abord installer le package Redis
npm install @akuma225/redis-adapter

# Ensuite installer le package Cache
npm install @akuma225/cache
```

## Configuration

Pour utiliser ce package, vous devez d'abord configurer le module Redis, puis le module Cache :

```typescript
import { Module } from '@nestjs/common';
import { AkumaRedisModule } from '@akuma225/redis-adapter';
import { AkumaCacheModule } from '@akuma225/cache';

@Module({
    imports: [
        // 1. Configurer Redis en premier
        AkumaRedisModule.register({
            host: 'localhost',
            port: 6379,
            password: 'optional',
        }),

        // 2. Ensuite configurer le Cache
        AkumaCacheModule.forRoot({
            defaultTtl: 3600, // TTL par défaut en secondes
        }),
    ],
})
export class AppModule {}
```

### Configuration globale vs locale

Vous pouvez utiliser soit `forRoot()` pour une configuration globale :
```typescript
AkumaCacheModule.forRoot({
    defaultTtl: 3600,
})
```

Soit `register()` pour une configuration locale :
```typescript
AkumaCacheModule.register({
    defaultTtl: 3600,
})
```

```typescript
import { Module } from '@nestjs/common';
import { AkumaCacheModule } from '@akuma225/cache';

@Module({
    imports: [
        AkumaCacheModule.register({
            host: 'localhost',
            port: 6379,
            password: 'optional',
            defaultTtl: 3600, // TTL par défaut en secondes
        }),
    ],
})
export class AppModule {}
```

## Utilisation

### Mise en cache des réponses

```typescript
import { Controller, Get } from '@nestjs/common';
import { Cacheable } from '@akuma225/cache';

@Controller('users')
export class UsersController {
    @Get()
    @Cacheable({ ttl: 3600 }) // TTL optionnel, utilise defaultTtl si non spécifié
    async getUsers() {
        return await this.usersService.findAll();
    }
}
```

### Invalidation du cache

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { InvalidateCache } from '@akuma225/cache';

@Controller('users')
export class UsersController {
    @Post()
    @InvalidateCache(['users*']) // Supporte les patterns Redis
    async createUser(@Body() user: any) {
        return await this.usersService.create(user);
    }

    @Post(':id')
    @InvalidateCache(['users*', `user-*`]) // Plusieurs patterns
    async updateUser(@Body() user: any) {
        return await this.usersService.update(user);
    }
}
```

## Génération des clés de cache

Les clés de cache sont générées automatiquement en utilisant :
- L'environnement (NODE_ENV)
- La méthode HTTP
- L'URL
- Les paramètres de requête (query)
- Les paramètres de route (params)
- Le corps de la requête (body)

Format : `${env}-${method}-${url}-${bodyHash}-${paramsHash}-${queryHash}`

## Options de configuration

| Option | Description | Par défaut |
|--------|-------------|------------|
| host | Hôte Redis | 'localhost' |
| port | Port Redis | 6379 |
| password | Mot de passe Redis | undefined |
| defaultTtl | TTL par défaut (secondes) | 3600 |

## Dépendances requises

Ce package dépend de :
- `@akuma225/redis`: Pour la gestion de la connexion Redis et des opérations de cache
- `@nestjs/common` et `@nestjs/core`: Framework NestJS

Assurez-vous que ces dépendances sont correctement installées et configurées dans votre projet.

## Bonnes pratiques

1. **Installation et configuration**
   - Installez et configurez toujours `@akuma225/redis` avant `@akuma225/cache`
   - Utilisez `forRoot()` pour une configuration globale si vous utilisez le cache dans plusieurs modules
   - Utilisez `register()` pour une configuration locale si vous n'utilisez le cache que dans un seul module

2. **Gestion du TTL**
   - Utilisez des TTL courts pour les données qui changent fréquemment
   - Utilisez des TTL plus longs pour les données statiques
   - Définissez un TTL par défaut raisonnable

2. **Patterns d'invalidation**
   - Utilisez des patterns spécifiques pour éviter d'invalider trop de cache
   - Combinez plusieurs patterns si nécessaire
   - Utilisez des préfixes cohérents

3. **Performance**
   - Mettez en cache les réponses coûteuses
   - Évitez de mettre en cache les données très volatiles
   - Utilisez l'invalidation par pattern avec précaution

## Tests

```bash
# Exécuter les tests
npm test

# Exécuter les tests avec couverture
npm run test:coverage
```

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou à soumettre une pull request.

## Licence

MIT
