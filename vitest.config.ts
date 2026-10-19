import { defineConfig } from 'vitest/config';

// One Vitest run at the root; each workspace package is its own project.
export default defineConfig({
  test: {
    projects: [
      'apps/*',
      'packages/*',
      'tools/*',
      { test: { name: 'architecture', include: ['test/**/*.test.ts'] } },
    ],
    // `pnpm test:coverage`: the money rules must stay thoroughly tested (docs/ARCHITECTURE.md §7).
    coverage: {
      provider: 'v8',
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/testing/**'],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
