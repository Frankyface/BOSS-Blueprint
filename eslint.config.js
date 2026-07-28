import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const IGNORED_PATHS = [
  'dist/**',
  'node_modules/**',
  'coverage/**',
  'playwright-report/**',
  'test-results/**',
  'blob-report/**',
  // Design-time assets (specs, fixtures awaiting their stage) — not part of any tsconfig
  // project, so typed linting must not try to place them in one.
  'design-assets/**',
]

/**
 * TypeScript is linted with TYPE INFORMATION (`recommendedTypeChecked`): the rules
 * that actually catch bugs here — floating promises, unsafe `any` flowing out of
 * `JSON.parse`, misused `unknown` — all need the type checker. The three project
 * tsconfigs between them cover every `.ts`/`.tsx` file in the repo (app, build
 * config, E2E), so no file falls outside a program. `eslint.config.js` itself is
 * plain JS and stays on the untyped ruleset.
 */
export default tseslint.config(
  { ignores: IGNORED_PATHS },
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json', './tsconfig.e2e.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
