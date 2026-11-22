// Root ESLint flat config shared by every workspace package.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const webFiles = ['apps/web/**/*.{ts,tsx}'];

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/build/',
    '**/.next/',
    '**/coverage/',
    '**/next-env.d.ts',
    '**/prisma/migrations/',
    '**/src/generated/',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  // apps/web: the Next.js and React Hooks rules. eslint-config-next is not used because it bundles
  // eslint-plugin-react, -import and -jsx-a11y, whose peer ranges stop at ESLint 9.
  {
    files: webFiles,
    extends: [nextPlugin.configs['core-web-vitals'], reactHooks.configs.flat['recommended-latest']],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Pages Router only, and it resolves `pages/` from the cwd, so it misfires when linting from
      // apps/web. The app uses the App Router exclusively.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  // Keep last: turns off rules that conflict with Prettier.
  prettier,
]);
