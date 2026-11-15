# Changelog

## 0.2.0 — Development Engine

- Added esbuild-based TypeScript and TSX bundling.
- Added React and React DOM runtime dependencies.
- Added development server compilation for `src/main.tsx`.
- Added server-sent-event live reload after successful rebuilds.
- Added production bundling to `dist/assets/app.js`.
- Added a React TSX hello-world example.

Note: 0.2.0 live reload refreshes the page after rebuilds. State-preserving React Fast Refresh / true HMR is not included yet.
