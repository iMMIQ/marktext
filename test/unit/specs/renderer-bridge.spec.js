import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import nativeApi from '../../../src/renderer/services/nativeApi'

const root = path.resolve(__dirname, '../../..')
const preloadSource = fs.readFileSync(path.join(root, 'src/main/preload/index.js'), 'utf8')

describe('renderer native API facade', () => {
  afterEach(() => {
    delete window.mtNative
  })

  it('exposes the expected top-level modules', () => {
    expect(Object.keys(nativeApi).sort()).toEqual([
      'app',
      'clipboard',
      'events',
      'filesystem',
      'fonts',
      'keyboard',
      'menu',
      'runtime',
      'search',
      'shell',
      'window'
    ])
  })

  it('exposes the app and events bridge contract', () => {
    expect(typeof nativeApi.app.openSettingsWindow).toBe('function')
    expect(typeof nativeApi.app.send).toBe('function')
    expect(nativeApi.app.sendSync).toBeUndefined()
    expect(typeof nativeApi.app.invoke).toBe('function')

    expect(typeof nativeApi.events.on).toBe('function')
    expect(typeof nativeApi.events.once).toBe('function')
    expect(typeof nativeApi.events.off).toBe('function')
    expect(typeof nativeApi.events.emit).toBe('function')

    expect(typeof nativeApi.fonts.listFamilies).toBe('function')

    expect(typeof nativeApi.keyboard.getInfo).toBe('function')
    expect(typeof nativeApi.keyboard.dumpInfo).toBe('function')
  })

  it('declares fonts and keyboard on the preload bridge contract', () => {
    expect(preloadSource).toContain('fonts:')
    expect(preloadSource).toContain("mt::fonts-list-families")
    expect(preloadSource).toContain('keyboard:')
    expect(preloadSource).toContain("mt::keyboard-get-info")
    expect(preloadSource).toContain("mt::keyboard-dump-info")
  })

  it('routes app and event operations through the bridge contract', async () => {
    const eventCalls = []
    const unsubscribe = () => {}
    const invokeResult = Promise.resolve({ ok: true })
    const handler = () => {}

    window.mtNative = {
      app: {
        openSettingsWindow: () => eventCalls.push(['openSettingsWindow']),
        send: (channel, ...args) => eventCalls.push(['send', channel, ...args]),
        invoke: (channel, ...args) => {
          eventCalls.push(['invoke', channel, ...args])
          return invokeResult
        }
      },
      events: {
        on: (channel, cb) => {
          eventCalls.push(['on', channel, cb])
          return unsubscribe
        },
        once: (channel, cb) => eventCalls.push(['once', channel, cb]),
        off: (channel, cb) => eventCalls.push(['off', channel, cb]),
        emit: (channel, ...args) => eventCalls.push(['emit', channel, ...args])
      }
    }

    nativeApi.app.openSettingsWindow()
    nativeApi.app.send('mt::channel', 1, 2)
    const result = nativeApi.app.invoke('mt::invoke-channel', 3)
    const stopListening = nativeApi.events.on('mt::event-channel', handler)
    nativeApi.events.once('mt::event-once', handler)
    nativeApi.events.off('mt::event-off', handler)
    nativeApi.events.emit('mt::event-emit', 'payload')

    expect(result).toBe(invokeResult)
    expect(await result).toEqual({ ok: true })
    expect(stopListening).toBe(unsubscribe)
    expect(eventCalls).toEqual([
      ['openSettingsWindow'],
      ['send', 'mt::channel', 1, 2],
      ['invoke', 'mt::invoke-channel', 3],
      ['on', 'mt::event-channel', handler],
      ['once', 'mt::event-once', handler],
      ['off', 'mt::event-off', handler],
      ['emit', 'mt::event-emit', 'payload']
    ])
  })

  it('routes tabs context menu requests through the bridge payload contract', () => {
    const calls = []
    window.mtNative = {
      menu: {
        popupApplicationMenu: payload => calls.push(payload)
      }
    }

    nativeApi.menu.popupTabsMenu({
      position: { x: 12, y: 34 },
      tabId: 'tab-1',
      hasPath: true
    })

    expect(calls).toEqual([{
      scope: 'tabs',
      position: { x: 12, y: 34 },
      tabId: 'tab-1',
      hasPath: true
    }])
  })

  it('routes sidebar context menu requests through the bridge payload contract', () => {
    const calls = []
    window.mtNative = {
      menu: {
        popupApplicationMenu: payload => calls.push(payload)
      }
    }

    nativeApi.menu.popupSideBarMenu({
      position: { x: 56, y: 78 },
      hasPathCache: false
    })

    expect(calls).toEqual([{
      scope: 'sidebar',
      position: { x: 56, y: 78 },
      hasPathCache: false
    }])
  })

  it('routes clipboard access through the bridge contract', async () => {
    const clipboardWrites = []
    window.mtNative = {
      clipboard: {
        readFilePath: () => Promise.resolve('/tmp/example.png'),
        readFilePathSync: () => '/tmp/example.png',
        writeText: value => clipboardWrites.push(value)
      }
    }

    const filePath = await nativeApi.clipboard.readFilePath()
    const syncFilePath = nativeApi.clipboard.readFilePathSync()
    nativeApi.clipboard.writeText('copied-value')

    expect(filePath).toBe('/tmp/example.png')
    expect(syncFilePath).toBe('/tmp/example.png')
    expect(clipboardWrites).toEqual(['copied-value'])
  })

  it('routes runtime access through the bridge contract', async () => {
    const runtimeInfo = {
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
        ripgrepBinaryPath: '/usr/bin/rg'
      },
      update: {
        canAutoUpdate: true
      }
    }

    window.mtNative = {
      runtime: {
        getInfo: () => Promise.resolve(runtimeInfo)
      }
    }

    const result = await nativeApi.runtime.getInfo()

    expect(result).toBe(runtimeInfo)
    expect(result.update.canAutoUpdate).toBe(true)
  })

  it('routes fonts and keyboard access through the bridge contract', async () => {
    const calls = []
    const keyboardInfo = {
      layout: 'com.example.layout',
      keymap: {
        KeyA: 'a'
      }
    }

    window.mtNative = {
      fonts: {
        listFamilies: options => {
          calls.push(['listFamilies', options])
          return Promise.resolve(['JetBrains Mono'])
        }
      },
      keyboard: {
        getInfo: () => {
          calls.push(['getInfo'])
          return Promise.resolve(keyboardInfo)
        },
        dumpInfo: () => calls.push(['dumpInfo'])
      }
    }

    const fonts = await nativeApi.fonts.listFamilies({ onlyMonospace: true })
    const result = await nativeApi.keyboard.getInfo()
    nativeApi.keyboard.dumpInfo()

    expect(fonts).toEqual(['JetBrains Mono'])
    expect(result).toBe(keyboardInfo)
    expect(calls).toEqual([
      ['listFamilies', { onlyMonospace: true }],
      ['getInfo'],
      ['dumpInfo']
    ])
  })

  it('routes filesystem and search access through the bridge contract', async () => {
    const calls = []
    const create = (pathname, type) => {
      calls.push(['create', pathname, type])
      return Promise.resolve()
    }
    const searchText = (directories, pattern, options) => {
      calls.push(['searchText', directories, pattern, options])
      return Promise.resolve([{ filePath: '/tmp/demo.md', matches: [] }])
    }
    const cancel = requestId => {
      calls.push(['cancel', requestId])
      return Promise.resolve(true)
    }

    window.mtNative = {
      filesystem: {
        create
      },
      search: {
        cancel,
        searchText
      }
    }

    await nativeApi.filesystem.create('/tmp/demo', 'directory')
    const result = await nativeApi.search.searchText(['/tmp'], 'demo', { isRegexp: false })
    const canceled = await nativeApi.search.cancel('search:1')

    expect(result).toHaveLength(1)
    expect(canceled).toBe(true)
    expect(calls).toEqual([
      ['create', '/tmp/demo', 'directory'],
      ['searchText', ['/tmp'], 'demo', { isRegexp: false }],
      ['cancel', 'search:1']
    ])
  })

  it('routes window controls through the bridge contract', async () => {
    const calls = []
    window.mtNative = {
      window: {
        minimize: () => calls.push(['minimize']),
        maximizeOrRestore: () => calls.push(['maximizeOrRestore']),
        toggleFullScreen: () => calls.push(['toggleFullScreen']),
        close: () => calls.push(['close']),
        setZoomFactor: value => calls.push(['setZoomFactor', value]),
        getState: () => Promise.resolve({
          isFullScreen: true,
          isMaximized: false
        })
      }
    }

    nativeApi.window.minimize()
    nativeApi.window.maximizeOrRestore()
    nativeApi.window.toggleFullScreen()
    nativeApi.window.close()
    nativeApi.window.setZoomFactor(1.25)
    const state = await nativeApi.window.getState()

    expect(state).toEqual({
      isFullScreen: true,
      isMaximized: false
    })
    expect(calls).toEqual([
      ['minimize'],
      ['maximizeOrRestore'],
      ['toggleFullScreen'],
      ['close'],
      ['setZoomFactor', 1.25]
    ])
  })
})
