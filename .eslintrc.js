module.exports = {
  root: true,
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 'latest',
    ecmaFeatures: {
      impliedStrict: true
    },
    requireConfigFile: false,
    sourceType: 'module'
  },
  env: {
    browser: true,
    es6: true,
    node: true
  },
  extends: [
    'standard',
    'eslint:recommended',
    'plugin:vue/base',
    'plugin:import/errors',
    'plugin:import/warnings'
  ],
  globals: {
    __static: true
  },
  plugins: ['html', 'vue'],
  rules: {
    // Two spaces but disallow semicolons
    indent: ['error', 2, { 'SwitchCase': 1, 'ignoreComments': true }],
    semi: [2, 'never'],
    'no-return-await': 'error',
    'no-return-assign': 'error',
    'no-new': 'error',
    // allow paren-less arrow functions
    'arrow-parens': 'off',
    // allow console
    'no-console': 'off',
    // allow debugger during development
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'require-atomic-updates': 'off',
    // TODO: fix these errors someday
    'prefer-const': 'off',
    'no-mixed-operators': 'off',
    'no-prototype-builtins': 'off',
    'import/no-unresolved': ['error', {
      ignore: ['\\?inline$', '\\?raw$', '^node:']
    }]
  },
  settings: {
    'import/resolver': {
      alias: {
        map: [
          ['common', './src/common'],
          // Normally only valid for renderer/
          ['@', './src/renderer'],
          ['muya', './src/muya']
        ],
        extensions: ['.js', '.vue', '.json', '.css', '.node']
      }
    }
  },
  overrides: [
    {
      files: ['**/*.vue'],
      parser: 'vue-eslint-parser',
      parserOptions: {
        parser: '@babel/eslint-parser',
        ecmaVersion: 'latest',
        requireConfigFile: false,
        sourceType: 'module'
      }
    },
    {
      files: ['src/renderer/**/*.{js,vue}'],
      rules: {
        'no-restricted-imports': ['error', {
          paths: [
            {
              name: 'electron',
              message: 'Use src/renderer/services/nativeApi instead.'
            },
            {
              name: '@electron/remote',
              message: 'Use src/renderer/services/nativeApi instead.'
            },
            {
              name: 'fontmanager-redux',
              message: 'Use src/renderer/services/nativeApi instead.'
            },
            {
              name: 'keytar',
              message: 'Use src/renderer/services/nativeApi instead.'
            },
            {
              name: 'native-keymap',
              message: 'Use src/renderer/services/nativeApi instead.'
            }
          ]
        }],
        'no-restricted-syntax': ['error',
          {
            selector: "CallExpression[callee.name='require'][arguments.length=1][arguments.0.type='Literal'][arguments.0.value='electron']",
            message: 'Use src/renderer/services/nativeApi instead.'
          },
          {
            selector: "CallExpression[callee.name='require'][arguments.length=1][arguments.0.type='Literal'][arguments.0.value='@electron/remote']",
            message: 'Use src/renderer/services/nativeApi instead.'
          },
          {
            selector: "CallExpression[callee.name='require'][arguments.length=1][arguments.0.type='Literal'][arguments.0.value='fontmanager-redux']",
            message: 'Use src/renderer/services/nativeApi instead.'
          },
          {
            selector: "CallExpression[callee.name='require'][arguments.length=1][arguments.0.type='Literal'][arguments.0.value='keytar']",
            message: 'Use src/renderer/services/nativeApi instead.'
          },
          {
            selector: "CallExpression[callee.name='require'][arguments.length=1][arguments.0.type='Literal'][arguments.0.value='native-keymap']",
            message: 'Use src/renderer/services/nativeApi instead.'
          }
        ]
      }
    }
  ],
  ignorePatterns: [
    'node_modules',
    'src/renderer/__tmp-eslint-spec-*',
    'src/muya/dist/**/*',
    'src/muya/webpack.config.js'
  ]
}
