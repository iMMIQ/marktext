import { describe, expect, it } from 'vitest'
import nativeApi from '../../../src/renderer/services/nativeApi'

describe('phase 4 async bridge contract', () => {
  it('does not expose a generic sync IPC escape hatch', () => {
    expect(nativeApi.app.sendSync).toBeUndefined()
  })
})
