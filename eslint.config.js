// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Architecture boundaries from docs/ARCHITECTURE.md §3.
 * Each entry: files it applies to -> @finapp packages they may import.
 */
const boundaries = [
  { files: ['packages/domain/**'], allowed: [] },
  { files: ['packages/contracts/**', 'packages/db/**'], allowed: ['domain'] },
  { files: ['apps/api/**'], allowed: ['domain', 'contracts', 'db'] },
  { files: ['apps/web/**'], allowed: ['contracts'] },
  { files: ['tools/import-legacy/**'], allowed: ['domain', 'db'] },
];

/** @param {string[]} allowed */
const finappImportPattern = (allowed) => ({
  regex: allowed.length ? `^@finapp/(?!(${allowed.join('|')})$)` : '^@finapp/',
  message: 'Import breaks the dependency direction in docs/ARCHITECTURE.md §3.',
});

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Claude Code hooks run directly under Node.
    files: ['.claude/hooks/**'],
    languageOptions: { globals: { process: 'readonly' } },
  },

  ...boundaries.map(({ files, allowed }) => ({
    files,
    rules: {
      'no-restricted-imports': ['error', { patterns: [finappImportPattern(allowed)] }],
    },
  })),

  // Domain is pure: no I/O, no third-party code, no ambient clock.
  {
    files: ['packages/domain/src/**'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\.)',
              message: 'packages/domain is pure: only relative imports are allowed.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Inject a clock instead.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject a clock instead.',
        },
      ],
    },
  },

  prettier,
);
