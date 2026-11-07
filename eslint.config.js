import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'verdio_full_code.txt'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // A blank cell read with Number() is 0, which turns a gap into a sale. Read measure cells with parseAmount.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/calculateMetrics.ts', 'src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "CallExpression[callee.name='Number'] > MemberExpression.arguments[computed=true][object.name=/^(row|r)$/]",
        message: 'Do not read a row cell with Number(): a blank becomes 0. Use parseAmount (src/lib/dataPipeline/profileDataset.ts), which gives null for a blank.',
      }],
    },
  },
  {
    files: ['api/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
