# Javafy

**Build faster. Run smarter.**

Javafy is a performance-first TypeScript fullstack framework ecosystem for building modern web applications.

> Javafy is in early development. APIs and internal architecture may change before 1.0.

## Goals

- TypeScript-first development.
- Fast compilation and development feedback.
- Frontend and backend features in one framework.
- Efficient production builds and runtime performance.
- Clear, modular architecture.

## Current status

**Version:** 0.2.0 — Development Engine

Available now:
- TypeScript and TSX bundling through esbuild.
- React and React DOM application entry.
- Development server with automatic rebuild.
- Browser live reload after successful rebuilds.
- Production JavaScript bundling and static asset output.

Live reload currently refreshes the page. State-preserving React Fast Refresh and true HMR are planned for a later release.

## Requirements

- Node.js 20+
- npm 10+

## Quick start

```bash
git clone https://github.com/javaoff364-cloud/javafy.git
cd javafy
npm install
npm run build
npm run dev:example
```

Open http://localhost:3000. Edit `examples/hello-world/src/main.tsx` and save to trigger a rebuild and browser reload.

## Production build

```bash
npm run build:example
```

The example production output is written to `examples/hello-world/dist`.

## CLI commands

From a Javafy project directory containing `src/main.tsx` and `index.html`:

```bash
node /path/to/javafy/packages/cli/dist/index.js dev
node /path/to/javafy/packages/cli/dist/index.js build
```

## Roadmap

| Version | Milestone | Focus |
| --- | --- | --- |
| 0.1.0 | Foundation | Monorepo, core, CLI, minimal dev server |
| 0.2.0 | Development Engine | TypeScript/TSX compiler, rebuild, live reload |
| 0.3.0 | Routing | File-based routes, layouts, dynamic routes |
| 0.4.0 | Fullstack | API routes, SSR, SSG |
| 1.0.0 | Production | Optimizer, caching, security, benchmarks |

## Performance

Performance is a core design goal. We will publish reproducible benchmarks for cold start, build time, hot updates, memory use, and server response time before making speed comparisons with other frameworks.

## Contributing

Issues and pull requests are welcome. Include reproduction steps and environment details when reporting bugs.

## License

MIT
