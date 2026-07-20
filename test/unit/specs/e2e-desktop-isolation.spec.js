import fs from 'fs'
import { describe, expect, it } from 'vitest'

const read = file => fs.readFileSync(file, 'utf8')

describe('E2E desktop isolation contract', () => {
  it('does not allow CI to bypass the Linux namespace sandbox', () => {
    const runner = read('tools/test/runE2E.mjs')
    const helpers = read('test/e2e/helpers.js')

    expect(runner).not.toMatch(/MARKTEXT_E2E_SANDBOXED[^\n]+process\.env\.CI/)
    expect(helpers).not.toContain('!process.env.CI')
    expect(runner).toContain("'--unshare-net'")
    expect(runner).toContain("'--tmpfs', runtimeDir")
    expect(runner).toContain("'MARKTEXT_E2E_HOST_PID_NS'")
    expect(runner).toContain("'MARKTEXT_E2E_HOST_IPC_NS'")
    expect(helpers).toContain("for (const name of ['net', 'pid', 'ipc'])")
    expect(helpers).toContain('Linux E2E private X11 display is missing.')
  })

  it('blocks native dialogs before loading the application main process', () => {
    const helpers = read('test/e2e/helpers.js')
    const bootstrap = read('test/e2e/electron-main.cjs')
    const blockIndex = bootstrap.indexOf('dialog.showSaveDialog =')
    const appIndex = bootstrap.indexOf("require(path.resolve(__dirname, '../../dist/electron/main.js'))")

    expect(helpers).toContain("const mainEntrypoint = 'test/e2e/electron-main.cjs'")
    expect(blockIndex).toBeGreaterThanOrEqual(0)
    expect(appIndex).toBeGreaterThan(blockIndex)
    expect(bootstrap).toContain('dialog.showOpenDialogSync =')
    expect(bootstrap).toContain('dialog.showMessageBoxSync =')
    expect(bootstrap).toContain('contents.print =')
  })
})
