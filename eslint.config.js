// https://eslint.org/docs/latest/extend/shareable-configs

import nextPlugin from '@next/eslint-plugin-next';
import { lintingEslintConfig } from '@ryancwalsh/linting';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...lintingEslintConfig,
  /**
   * The shared config covers React but knows nothing about Next, so the Next
   * rules are added as a plugin rather than via `eslint-config-next`: that
   * preset also defines `import`, which the shared config already defines, and
   * ESLint refuses to let two configs declare the same plugin.
   */
  {
    files: ['**/*.{js,mjs,ts,jsx,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    rules: {
      /**
       * Next routes files by name, and the app is kebab-case throughout.
       */
      'canonical/filename-match-regex': 'off',
      /**
       * A React component is one function returning a whole piece of UI, so a
       * 30-line ceiling would mean splitting components by line count rather
       * than by meaning.
       */
      'max-lines-per-function': 'off',
      /**
       * Handlers are passed inline all over this app. Hoisting each into a
       * `useCallback` to satisfy this would add noise without changing
       * behaviour, since none of these components re-render hot.
       */
      'react/jsx-no-bind': 'off',
    },
  },
  {
    files: ['public/sw.js'],
    rules: {
      /**
       * A service worker's `fetch` handler must hand `respondWith` a promise
       * synchronously, so `then` is the idiom rather than a shortcut.
       */
      'promise/prefer-await-to-then': 'off',
    },
  },
  {
    files: ['scripts/**'],
    rules: {
      /**
       * These are command line tools; printing is how they talk.
       */
      'no-console': 'off',
    },
  },
];
