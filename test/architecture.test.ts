import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Dependency direction from docs/ARCHITECTURE.md §3. Lint checks imports; this checks package.json.
const allowed: Record<string, string[]> = {
  '@finapp/domain': [],
  '@finapp/contracts': ['@finapp/domain'],
  '@finapp/db': ['@finapp/domain'],
  '@finapp/api': ['@finapp/contracts', '@finapp/db', '@finapp/domain'],
  '@finapp/web': ['@finapp/contracts'],
  '@finapp/import-legacy': ['@finapp/db', '@finapp/domain'],
};

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const root = join(import.meta.dirname, '..');
const packages: PackageJson[] = ['apps', 'packages', 'tools'].flatMap((dir) =>
  readdirSync(join(root, dir)).map(
    (name) =>
      JSON.parse(readFileSync(join(root, dir, name, 'package.json'), 'utf8')) as PackageJson,
  ),
);

describe('workspace dependency direction', () => {
  it('has a rule for every package', () => {
    expect(packages.map((p) => p.name).sort()).toEqual(Object.keys(allowed).sort());
  });

  it.each(packages)('$name depends only on allowed workspace packages', (pkg) => {
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const workspaceDeps = deps.filter((d) => d.startsWith('@finapp/'));
    expect(workspaceDeps.filter((d) => !allowed[pkg.name]?.includes(d))).toEqual([]);
  });

  it('keeps @finapp/domain free of runtime dependencies', () => {
    expect(packages.find((p) => p.name === '@finapp/domain')?.dependencies ?? {}).toEqual({});
  });
});
