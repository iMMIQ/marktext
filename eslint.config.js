const { FlatCompat } = require('@eslint/eslintrc')
const js = require('@eslint/js')

const legacyConfig = require('./.eslintrc.js')

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

const additionalIgnores = [
  'test/unit/coverage/**',
  'test/unit/*.js',
  'test/e2e/*.js',
  'src/renderer/assets/symbolIcon/index.js',
  'src/muya/lib/assets/libs/*.js'
]

module.exports = [
  {
    ignores: [
      ...(legacyConfig.ignorePatterns || []),
      ...additionalIgnores
    ]
  },
  ...compat.config({
    ...legacyConfig,
    root: undefined,
    ignorePatterns: undefined
  })
]
