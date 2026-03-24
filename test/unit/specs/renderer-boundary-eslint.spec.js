import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

const eslintBin = path.resolve(process.cwd(), 'node_modules/.bin/eslint')

const lintRendererSource = source => {
  const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'src/renderer/__tmp-eslint-spec-'))
  const filePath = path.join(tempDir, 'Example.js')

  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, source)

  try {
    execFileSync(eslintBin, [
      '--no-eslintrc',
      '--config',
      path.resolve(process.cwd(), '.eslintrc.js'),
      '--format',
      'json',
      filePath
    ], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    })

    return []
  } catch (error) {
    return JSON.parse(error.stdout.toString())[0].messages
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('renderer boundary eslint guardrail', () => {
  const getBoundaryMessages = messages => messages.filter(({ ruleId }) => {
    return ruleId === 'no-restricted-imports' || ruleId === 'no-restricted-syntax'
  })

  it('rejects direct electron imports in renderer sources', () => {
    const messages = getBoundaryMessages(lintRendererSource("import 'electron'\n"))

    expect(messages).to.have.length(1)
    expect(messages[0].ruleId).to.equal('no-restricted-imports')
    expect(messages[0].message).to.include('Use src/renderer/services/nativeApi instead.')
  })

  it('rejects direct electron requires in renderer sources', () => {
    const messages = getBoundaryMessages(lintRendererSource("require('electron')\n"))

    expect(messages).to.have.length(1)
    expect(messages[0].ruleId).to.equal('no-restricted-syntax')
    expect(messages[0].message).to.include('Use src/renderer/services/nativeApi instead.')
  })

  it('rejects direct @electron/remote requires in renderer sources', () => {
    const messages = getBoundaryMessages(lintRendererSource("require('@electron/remote')\n"))

    expect(messages).to.have.length(1)
    expect(messages[0].ruleId).to.equal('no-restricted-syntax')
    expect(messages[0].message).to.include('Use src/renderer/services/nativeApi instead.')
  })

  it('allows other renderer requires', () => {
    const messages = getBoundaryMessages(lintRendererSource("require('fontmanager-redux')\n"))

    expect(messages).to.deep.equal([])
  })
})
