import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

// physical Tailwind classes that would break future RTL support
// (String.raw keeps the `\s` escapes: in a plain string they would silently become "s")
const PHYSICAL_CLASS_PATTERN = String.raw`(^|\s)-?(m|p)[lr]-|(^|\s)-?(left|right)-|(^|\s)text-(left|right)(\s|$)|(^|\s)(border|rounded)-[lr](-|\s|$)|(^|\s)(rounded)-(t|b)[lr](-|\s|$)`;

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/api/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${PHYSICAL_CLASS_PATTERN}/]`,
          message:
            'Use logical properties (ms-, me-, ps-, pe-, start-, end-, text-start, text-end) to support RTL.',
        },
        {
          selector: 'JSXText[value=/[A-Za-z0-9À-ÿ]/]',
          message: 'No hard-coded UI strings: use react-i18next.',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|aria-description|title|placeholder|alt)$/] > Literal',
          message: 'No hard-coded UI strings: use react-i18next.',
        },
      ],
    },
  },
  {
    // components only know the `@/services` interfaces, never the mock implementation
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/services/**', 'apps/web/src/test/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '(^|/)services/mock(/|$)',
              message:
                'Access data only through "@/services"; the mock implementation is an internal detail.',
            },
          ],
        },
      ],
    },
  },
  {
    // tests and config files may use literal strings
    files: ['**/*.test.{ts,tsx}', 'apps/web/src/test/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
