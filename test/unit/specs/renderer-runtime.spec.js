import { afterEach, describe, expect, it } from 'vitest'
import { getPlatform, getRuntime, initializeRuntime, resetRuntime } from '@/services/runtime'

describe('renderer runtime bootstrap', () => {
  const originalNavigatorPlatform = window.navigator.platform

  afterEach(() => {
    resetRuntime()
    delete window.mtNative
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: originalNavigatorPlatform
    })
  })

  it('falls back to browser platform before runtime initialization', () => {
    Object.defineProperty(window.navigator, 'platform', {
      configurable: true,
      value: 'MacIntel'
    })

    expect(getPlatform()).toBe('darwin')
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
          },
          update: {
            canAutoUpdate: true
          }
        })
      }
    }

    await initializeRuntime()

    expect(getRuntime().platform).toBe('linux')
    expect(getRuntime().env.windowId).toBe(7)
    expect(getRuntime().paths.ripgrepBinaryPath).toBe('/usr/bin/rg')
    expect(getRuntime().paths.resourcesPath).toBeUndefined()
    expect(getRuntime().update.canAutoUpdate).toBe(true)
  })
})
