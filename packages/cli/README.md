# @javafy/cli

The Javafy command-line interface. Installing this package provides the `javafy` executable.

## Install

```sh
npm install @javafy/cli
```

## Commands

```sh
javafy dev
javafy build
javafy start
javafy --help
javafy --version
```

- `dev` starts the development server with TypeScript/TSX compilation and React Fast Refresh.
- `build` creates production assets, the server manifest, and generated static pages in `dist/`.
- `start` starts the Node.js production server for SSR and API routes. Run `javafy build` first.

## Requirements

Node.js 20 or newer and npm 10 or newer. ESM is required. React 19 is used by Javafy applications.

Full documentation: https://github.com/javaoff364-cloud/javafy
