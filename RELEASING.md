# Releasing Javafy 1.0.0

This repository is an npm workspace monorepo. The root package is intentionally
private and must not be published. Publish only these four public packages:

1. `@javafy/core`
2. `@javafy/router`
3. `@javafy/server`
4. `@javafy/cli`

All four packages must have the same version. Publish in the order above so
internal dependencies are available before dependent packages.

## 1. Verify the checkout

Use Node.js 20 or newer and npm 10 or newer.

```sh
git checkout main
git pull origin main
npm install
npm run build
npm test
npm run test:packages
npm run test:production
npm run audit
npm run benchmark
```

Do not publish if any command fails. Review the packed files from
`npm run test:packages`; each package must include its compiled `dist/`
output and its own README, and must exclude tests, source maps, and build
metadata.

## 2. Verify npm access

The publisher must be signed in to npm and have publish permission for the
`@javafy` scope (an npm organization or account scope they control).

```sh
npm login
npm whoami
npm access list packages @javafy
```

Never share an npm password, access token, or one-time code in chat or commit
credentials to this repository.

## 3. Publish the workspaces

Run these commands one at a time and confirm each succeeds before continuing:

```sh
npm publish --workspace=packages/core --access public
npm publish --workspace=packages/router --access public
npm publish --workspace=packages/server --access public
npm publish --workspace=packages/cli --access public
```

The packages declare public access in `publishConfig`; the explicit
`--access public` also makes the intended visibility clear for first publish.

## 4. Verify the registry

```sh
npm view @javafy/core version
npm view @javafy/router version
npm view @javafy/server version
npm view @javafy/cli version
```

Each command must report `1.0.0`. Then install the CLI in a clean test
directory and verify `javafy --version` reports `1.0.0`.

## 5. Create the public release

After all four npm packages are verified, create the Git tag `v1.0.0` on
`main` and publish the GitHub Release using the 1.0.0 changelog notes.

Do not publish the private root workspace. Do not publish a package twice if
the registry already contains the same immutable version; inspect the registry
first and use a new version only through a separately reviewed release plan.
