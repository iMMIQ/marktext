import { afterEach, describe, expect, it } from 'vitest'
import { getRuntime, initializeRuntime, resetRuntime } from '@/services/runtime'

describe('renderer runtime bootstrap', () => {
  afterEach(() => {
    resetRuntime()
    delete window.mtNative
  })

  it('hydrates runtime info from preload', async () => {
    window.mtNative = {
      runtime: {
        getInfo: () => Promise.resolve({
          platform: 'linux',
          appVersion: 'v0.17.1',
          env: {
            debug: true,
            windowId: 7,
            type: 'editor'
          },
          paths: {
            userDataPath: '/tmp/marktext-user-data',
            logPath: '/tmp/marktext-user-data/logs',
            ripgrepBinaryPath: '/usr/bin/rg',
            resourcesPath: '/tmp/marktext-resources'
          }
        })
      }
    }

    await initializeRuntime()

    expect(getRuntime().platform).toBe('linux')
    expect(getRuntime().env.windowId).toBe(7)
    expect(getRuntime().paths.ripgrepBinaryPath).toBe('/usr/bin/rg')
    expect(getRuntime().paths.resourcesPath).toBeUndefined()
  })
})
