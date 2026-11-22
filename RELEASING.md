# Releasing Javafy

Javafy is released as one public npm package: `javafy`. The workspace packages under `packages/` are internal build units and must not be published separately.

## Pre-release verification

Use Node.js 20+ and npm 10+.

```sh
git checkout main
git pull origin main
npm install
npm run build
npm run typecheck:example
npm test
npm run test:packages
npm run test:production
npm run audit
npm run benchmark
```

Do not publish if any check fails. The package smoke test packs the root package, installs that tarball into a clean fixture, checks every public export, and runs the bundled CLI.

## Publish

First verify the package name and publisher permissions on npm. Sign in locally; never put credentials or tokens in source control or chat.

```sh
npm login
npm whoami
npm view javafy version
npm pack --dry-run
npm publish --access public
```

If `javafy` is already owned by another publisher, stop and resolve the name/ownership issue rather than silently switching to scoped package names. Never attempt to overwrite an immutable published version. Increment the version in the root `package.json` for every subsequent release.

## Verify registry and CLI

```sh
npm view javafy version
npm install -g javafy
javafy --version
```

Only after registry verification should the matching Git tag and GitHub Release be created.
