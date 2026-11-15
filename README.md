# Javafy

**Build faster. Run smarter.**

Javafy is a performance-first TypeScript framework ecosystem for building modern web applications. It is being developed as an integrated platform for frontend rendering, backend routes, development tooling, and production builds.

> Javafy is in early development. APIs and internal architecture may change before 1.0.

## Goals

- Fast startup and development feedback.
- A cohesive TypeScript-first developer experience.
- Frontend and backend features in one framework.
- Efficient production builds and runtime performance.
- Clear, modular architecture.

## Current status

**Version:** 0.1.0 — Foundation

The first milestone establishes the monorepo, core package, CLI, and a minimal static-file development server. Routing, HMR, SSR, SSG, and the production bundler are planned milestones, not implemented features yet.

## Requirements

- Node.js 20+
- npm 10+

## Development

```bash
git clone https://github.com/javaoff364-cloud/javafy.git
cd javafy
npm install
npm run build
```

Run the CLI from the monorepo:

```bash
node packages/cli/dist/index.js --help
```

## Example

```bash
cd examples/hello-world
node ../../packages/cli/dist/index.js dev
```

Open http://localhost:3000.

## Roadmap

| Version | Milestone | Focus |
| --- | --- | --- |
| 0.1.0 | Foundation | Monorepo, core, CLI, minimal dev server |
| 0.2.0 | Development Engine | Compiler integration and HMR |
| 0.3.0 | Routing | File-based routes, layouts, dynamic routes |
| 0.4.0 | Fullstack | API routes, SSR, SSG |
| 1.0.0 | Production | Optimizer, caching, security, benchmarks |

## Performance

Performance is a core design goal. We will publish reproducible benchmarks for cold start, build time, hot updates, memory use, and server response time before making speed comparisons with other frameworks.

## Contributing

Issues and pull requests are welcome. Please include reproduction steps and benchmark details when reporting performance problems.

## License

MIT
