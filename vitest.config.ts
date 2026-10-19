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
  },
});
