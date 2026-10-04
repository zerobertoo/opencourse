import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';

// classes Tailwind físicas que quebram o suporte futuro a RTL
const PHYSICAL_CLASS_PATTERN =
  '(^|\s)-?(m|p)[lr]-|(^|\s)-?(left|right)-|(^|\s)text-(left|right)(\s|$)|(^|\s)(border|rounded)-[lr](-|\s|$)|(^|\s)(rounded)-(t|b)[lr](-|\s|$)';

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
            'Use propriedades lógicas (ms-, me-, ps-, pe-, start-, end-, text-start, text-end) para suportar RTL.',
        },
        {
          selector: 'JSXText[value=/[A-Za-z0-9À-ÿ]/]',
          message: 'Nenhuma string fixa na interface: use react-i18next.',
        },
        {
          selector:
            'JSXAttribute[name.name=/^(aria-label|aria-description|title|placeholder|alt)$/] > Literal',
          message: 'Nenhuma string fixa na interface: use react-i18next.',
        },
      ],
    },
  },
  {
    // testes e arquivos de configuração podem usar strings literais
    files: ['**/*.test.{ts,tsx}', 'apps/web/src/test/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
