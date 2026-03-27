// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const eslintBin = process.execPath
const eslintCliPath = path.resolve(process.cwd(), 'node_modules/eslint/bin/eslint.js')
const eslintConfigPath = path.resolve(process.cwd(), 'eslint.config.js')

const parseEslintMessages = error => {
  const stdout = error.stdout?.toString().trim()

  if (stdout) {
    return JSON.parse(stdout)[0].messages
  }

  const stderr = error.stderr?.toString().trim()
  throw new Error(stderr || error.message)
}

const lintRendererSource = source => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'src/renderer/__tmp-eslint-spec-'))
  const filePath = path.join(tempDir, 'Example.js')

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, source)

  try {
    execFileSync(eslintBin, [
      eslintCliPath,
      '--no-ignore',
      '--no-config-lookup',
      '--config',
      eslintConfigPath,
      '--format',
      'json',
      filePath
    ], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    })

    return []
  } catch (error) {
    return parseEslintMessages(error)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

const SPEC_TIMEOUT = 10000

describe('renderer boundary eslint guardrail', () => {
  const getBoundaryMessages = messages => messages.filter(({ ruleId }) => {
    return ruleId === 'no-restricted-imports' || ruleId === 'no-restricted-syntax'
  })

  it('rejects direct electron imports in renderer sources', () => {
    const messages = getBoundaryMessages(lintRendererSource("import 'electron'\n"))

    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe('no-restricted-imports')
    expect(messages[0].message).toContain('Use src/renderer/services/nativeApi instead.')
  }, SPEC_TIMEOUT)

  it('rejects direct electron requires in renderer sources', () => {
    const messages = getBoundaryMessages(lintRendererSource("require('electron')\n"))

    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe('no-restricted-syntax')
    expect(messages[0].message).toContain('Use src/renderer/services/nativeApi instead.')
  }, SPEC_TIMEOUT)

  it('rejects direct @electron/remote requires in renderer sources', () => {
    const messages = getBoundaryMessages(lintRendererSource("require('@electron/remote')\n"))

    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe('no-restricted-syntax')
    expect(messages[0].message).toContain('Use src/renderer/services/nativeApi instead.')
  }, SPEC_TIMEOUT)

  it('rejects direct fontmanager requires in renderer sources', () => {
    const messages = getBoundaryMessages(lintRendererSource("require('fontmanager-redux')\n"))

    expect(messages).toHaveLength(1)
    expect(messages[0].ruleId).toBe('no-restricted-syntax')
    expect(messages[0].message).toContain('Use src/renderer/services/nativeApi instead.')
  }, SPEC_TIMEOUT)

  it('rejects direct native module requires in renderer sources', () => {
    const keytarMessages = getBoundaryMessages(lintRendererSource("require('keytar')\n"))
    const nativeKeymapMessages = getBoundaryMessages(lintRendererSource("require('native-keymap')\n"))

    expect(keytarMessages).toHaveLength(1)
    expect(keytarMessages[0].ruleId).toBe('no-restricted-syntax')
    expect(keytarMessages[0].message).toContain('Use src/renderer/services/nativeApi instead.')

    expect(nativeKeymapMessages).toHaveLength(1)
    expect(nativeKeymapMessages[0].ruleId).toBe('no-restricted-syntax')
    expect(nativeKeymapMessages[0].message).toContain('Use src/renderer/services/nativeApi instead.')
  }, SPEC_TIMEOUT)
})
