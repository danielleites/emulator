import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'www-src/vendor/**',
      'www-src/cordova.js',
      'www-src/emulator/js/jquery-*.js',
      'www-src/symbols/**',
      '**/*.min.js',
    ],
  },
  js.configs.recommended,
  {
    files: ['www-src/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        FileReader: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        HTMLElement: 'readonly',
        Element: 'readonly',
        Node: 'readonly',
        crypto: 'readonly',
        cordova: 'readonly',
        $: 'readonly',
        jQuery: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-cond-assign': ['error', 'except-parens'],
      // ── Security (stage 1) ─────────────────────────────────────────────
      // eval() is forbidden in new code. Existing eval sites are tagged
      // with `// eslint-disable-next-line no-eval` and tracked in
      // README.md → "Security migration plan".
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      // Direct innerHTML / outerHTML assignment is discouraged. Use
      // SafeDOM.setSafeHTML() from js/security/safe-dom.js instead.
      // Currently a warning only — flipped to `error` after stage 2.
      'no-restricted-properties': [
        'warn',
        {
          property: 'innerHTML',
          message:
            'Use SafeDOM.setSafeHTML(el, html) from js/security/safe-dom.js — direct innerHTML assignment is unsafe.',
        },
        {
          property: 'outerHTML',
          message:
            'Use SafeDOM helpers from js/security/safe-dom.js — direct outerHTML assignment is unsafe.',
        },
      ],
    },
  },
  {
    // Legacy emulator devtools REPL legitimately needs eval()
    files: [
      'www-src/emulator/js/emu-devtools.js',
      'www-src/emulator/emulator/js/emu-devtools.js',
      'www-src/emulator/js/emu-shims.js',
      'www-src/emulator/emulator/js/emu-shims.js',
      'www-src/cordova.js',
    ],
    rules: {
      'no-eval': 'off',
      'no-new-func': 'off',
      'no-implied-eval': 'off',
    },
  },
  {
    // Symbols and worker scripts use innerHTML extensively for sandboxed
    // chart rendering — they will be migrated in stage 2.
    files: ['www-src/symbols/**/*.js', 'www-src/js/qa-worker.js'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
  {
    files: ['www-src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
    },
  },
];
