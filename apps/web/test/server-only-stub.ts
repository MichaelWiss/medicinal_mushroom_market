// Vitest stand-in for Next.js' `server-only` package.
//
// At runtime, importing `server-only` is a build-time guard that throws
// inside a client bundle. In tests we run modules under Node directly,
// so the guard is irrelevant; this file is aliased into the import
// resolution graph by `vitest.config.ts`.
export {};
