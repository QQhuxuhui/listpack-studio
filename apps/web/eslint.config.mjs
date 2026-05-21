/**
 * ESLint flat config — D58.3.
 *
 * `next lint` was deprecated in Next 15 canary (and broken in our
 * version, see the review finding). We replace it with the eslint CLI
 * + eslint-config-next preset, which gives us the same rules without
 * the dropped wrapper.
 *
 * The FlatCompat bridge lets us pull the legacy `eslint-config-next`
 * shareable config into the flat-config world ESLint 9 requires.
 */

import { FlatCompat } from '@eslint/eslintrc';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      '.next/**',
      '.turbo/**',
      'node_modules/**',
      'lib/db/migrations/**',
    ],
  },
  {
    rules: {
      // Apostrophes / quotes inside JSX text don't need to be escaped
      // to be safe — React's reconciler already handles entity output.
      // The rule flags them mainly for readability, which doesn't earn
      // its keep across our copy + email templates.
      'react/no-unescaped-entities': 'off',
      // Allow `catch (err)` even when err goes unread — log/ignore is
      // a common deliberate pattern in our network code.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(err|error|_)$',
        },
      ],
    },
  },
];

export default config;
