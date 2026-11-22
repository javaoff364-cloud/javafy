# @javafy/cli

The Javafy command-line interface for creating and running Javafy applications.

## Install

```sh
npm install -g @javafy/cli
```

## Create an application

```sh
javafy create my-app
cd my-app
npm install
npm run dev
```

The scaffold includes a React 19 application, TypeScript configuration, a root layout, a home page, an HTML shell, and Javafy configuration. The command refuses to overwrite a non-empty directory.

## Commands

```sh
javafy create <project-name>
javafy dev
javafy build
javafy start
javafy --help
javafy --version
```

- `create` creates a new Javafy application in the requested directory.
- `dev` starts the development server with TypeScript/TSX compilation and React Fast Refresh.
- `build` creates production assets, the server manifest, and generated static pages in `dist/`.
- `start` starts the Node.js production server for SSR and API routes. Run `javafy build` first.

## Requirements

Node.js 20 or newer and npm 10 or newer. ESM is required. React 19 is used by Javafy applications.

Full documentation: https://github.com/javaoff364-cloud/javafy
