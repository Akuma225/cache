# Contributing Guide

Thank you for helping improve `@akuma225/cache`.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies:

```bash
pnpm install
```

3. Run quality checks before opening a PR:

```bash
pnpm run lint
pnpm test
pnpm run build
```

## Commit Convention (Required)

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and `semantic-release`.
Commit messages directly control release versions:

- `fix:` -> patch release (`1.2.3` -> `1.2.4`)
- `feat:` -> minor release (`1.2.3` -> `1.3.0`)
- `!` or `BREAKING CHANGE:` -> major release (`1.2.3` -> `2.0.0`)

### Commit Message Format

```text
<type>(optional-scope): short summary

optional body

optional footer(s)
```

### Valid Examples

- `fix(interceptor): avoid caching when response is undefined`
- `feat(module): support async tenant resolver`
- `docs(readme): add migration guide for v2`
- `feat!: remove legacy cache key option`

Breaking change via footer:

```text
feat(cache): redesign key generator

BREAKING CHANGE: cacheKeyPrefix option was removed in favor of keyFactory.
```

## Pull Request Checklist

- Keep PRs focused and small when possible.
- Include or update tests when behavior changes.
- Update docs when API or usage changes.
- Ensure CI passes before requesting review.

## Reporting Issues

When opening an issue, include:

- expected behavior,
- actual behavior,
- minimal reproduction,
- package version and runtime details.
