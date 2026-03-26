import fs from 'fs'
import path from 'path'
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
      'preferences',
      'project',
      'runtime',
      'search',
      'shell',
      'spellchecker',
      'window'
    ])
  })

  it('exposes the typed app, preferences, project, spellchecker, and events bridge contract', () => {
    expect(typeof nativeApi.app.openSettingsWindow).toBe('function')
    expect(typeof nativeApi.app.openFile).toBe('function')
    expect(typeof nativeApi.app.openFilePath).toBe('function')
    expect(typeof nativeApi.app.openFileByWindowId).toBe('function')
    expect(typeof nativeApi.app.dropFiles).toBe('function')
    expect(typeof nativeApi.app.requestKeybindings).toBe('function')
    expect(typeof nativeApi.app.getPreferenceKeybindings).toBe('function')
    expect(typeof nativeApi.app.saveUserKeybindings).toBe('function')
    expect(typeof nativeApi.app.respondFileSave).toBe('function')
    expect(typeof nativeApi.app.notifyRendererReady).toBe('function')
    expect(nativeApi.app.send).toBeUndefined()
    expect(nativeApi.app.sendSync).toBeUndefined()
    expect(nativeApi.app.invoke).toBeUndefined()

    expect(typeof nativeApi.preferences.requestUserPreference).toBe('function')
    expect(typeof nativeApi.project.openInSidebar).toBe('function')
    expect(typeof nativeApi.spellchecker.getAvailableDictionaries).toBe('function')
    expect(typeof nativeApi.spellchecker.getCustomDictionaryWords).toBe('function')

    expect(typeof nativeApi.events.on).toBe('function')
    expect(typeof nativeApi.events.once).toBe('function')
    expect(typeof nativeApi.events.off).toBe('function')
    expect(typeof nativeApi.events.emit).toBe('function')

    expect(typeof nativeApi.filesystem.trashItem).toBe('function')
    expect(typeof nativeApi.fonts.listFamilies).toBe('function')

    expect(typeof nativeApi.keyboard.getInfo).toBe('function')
    expect(typeof nativeApi.keyboard.dumpInfo).toBe('function')
  })

  it('declares typed bridge modules on the preload bridge contract', () => {
    expect(preloadSource).toContain('app:')
    expect(preloadSource).toContain('openFile:')
    expect(preloadSource).toContain('openFilePath:')
    expect(preloadSource).toContain('openFileByWindowId:')
    expect(preloadSource).toContain('dropFiles:')
    expect(preloadSource).toContain('requestKeybindings:')
    expect(preloadSource).toContain('getPreferenceKeybindings:')
    expect(preloadSource).toContain('saveUserKeybindings:')
    expect(preloadSource).toContain('respondFileSave:')
    expect(preloadSource).toContain('notifyRendererReady:')
    expect(preloadSource).toContain('preferences:')
    expect(preloadSource).toContain('requestUserPreference:')
    expect(preloadSource).toContain('project:')
    expect(preloadSource).toContain('openInSidebar:')
    expect(preloadSource).toContain('spellchecker:')
    expect(preloadSource).toContain('getAvailableDictionaries:')
    expect(preloadSource).toContain('getCustomDictionaryWords:')
    expect(preloadSource).not.toContain('send: (channel')
    expect(preloadSource).not.toContain('invoke: (channel')

    expect(preloadSource).toContain('fonts:')
    expect(preloadSource).toContain('mt::fonts-list-families')
    expect(preloadSource).toContain('keyboard:')
    expect(preloadSource).toContain('mt::keyboard-get-info')
    expect(preloadSource).toContain('mt::keyboard-dump-info')
  })

  it('routes typed app, preferences, project, spellchecker, and event operations through the bridge contract', async () => {
    const eventCalls = []
    const unsubscribe = () => {}
    const preferenceKeybindings = Promise.resolve({ defaultKeybindings: [], userKeybindings: [] })
    const saveResult = Promise.resolve(true)
    const dictionariesResult = Promise.resolve(['en-US'])
    const customWordsResult = Promise.resolve(['teh'])
    const handler = () => {}

    window.mtNative = {
      app: {
        openSettingsWindow: () => eventCalls.push(['openSettingsWindow']),
        openFile: () => eventCalls.push(['openFile']),
        openFilePath: (pathname, options) => eventCalls.push(['openFilePath', pathname, options]),
        openFileByWindowId: (windowId, pathname) => eventCalls.push(['openFileByWindowId', windowId, pathname]),
        dropFiles: files => eventCalls.push(['dropFiles', files]),
        requestKeybindings: () => eventCalls.push(['requestKeybindings']),
        getPreferenceKeybindings: () => {
          eventCalls.push(['getPreferenceKeybindings'])
          return preferenceKeybindings
        },
        saveUserKeybindings: keybindings => {
          eventCalls.push(['saveUserKeybindings', keybindings])
          return saveResult
        },
        respondFileSave: payload => eventCalls.push(['respondFileSave', payload]),
        notifyRendererReady: () => eventCalls.push(['notifyRendererReady'])
      },
      preferences: {
        requestUserPreference: () => eventCalls.push(['requestUserPreference'])
      },
      project: {
        openInSidebar: () => eventCalls.push(['openInSidebar'])
      },
      spellchecker: {
        getAvailableDictionaries: () => {
          eventCalls.push(['getAvailableDictionaries'])
          return dictionariesResult
        },
        getCustomDictionaryWords: () => {
          eventCalls.push(['getCustomDictionaryWords'])
          return customWordsResult
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
    nativeApi.app.openFile()
    nativeApi.app.openFilePath('/tmp/demo.md', { autoFocus: true })
    nativeApi.app.openFileByWindowId(7, '/tmp/by-window.md')
    nativeApi.app.dropFiles(['/tmp/a.md', '/tmp/b.md'])
    nativeApi.app.requestKeybindings()
    const keybindings = nativeApi.app.getPreferenceKeybindings()
    const save = nativeApi.app.saveUserKeybindings(new Map([['file.save', 'Ctrl+S']]))
    nativeApi.app.respondFileSave({ id: 'tab-1' })
    nativeApi.app.notifyRendererReady()
    nativeApi.preferences.requestUserPreference()
    nativeApi.project.openInSidebar()
    const dictionaries = nativeApi.spellchecker.getAvailableDictionaries()
    const customWords = nativeApi.spellchecker.getCustomDictionaryWords()
    const stopListening = nativeApi.events.on('mt::event-channel', handler)
    nativeApi.events.once('mt::event-once', handler)
    nativeApi.events.off('mt::event-off', handler)
    nativeApi.events.emit('mt::event-emit', 'payload')

    expect(keybindings).toBe(preferenceKeybindings)
    expect(await keybindings).toEqual({ defaultKeybindings: [], userKeybindings: [] })
    expect(save).toBe(saveResult)
    expect(await save).toBe(true)
    expect(dictionaries).toBe(dictionariesResult)
    expect(await dictionaries).toEqual(['en-US'])
    expect(customWords).toBe(customWordsResult)
    expect(await customWords).toEqual(['teh'])
    expect(stopListening).toBe(unsubscribe)
    expect(eventCalls).toEqual([
      ['openSettingsWindow'],
      ['openFile'],
      ['openFilePath', '/tmp/demo.md', { autoFocus: true }],
      ['openFileByWindowId', 7, '/tmp/by-window.md'],
      ['dropFiles', ['/tmp/a.md', '/tmp/b.md']],
      ['requestKeybindings'],
      ['getPreferenceKeybindings'],
      ['saveUserKeybindings', new Map([['file.save', 'Ctrl+S']])],
      ['respondFileSave', { id: 'tab-1' }],
      ['notifyRendererReady'],
      ['requestUserPreference'],
      ['openInSidebar'],
      ['getAvailableDictionaries'],
      ['getCustomDictionaryWords'],
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
    const trashItem = pathname => {
      calls.push(['trashItem', pathname])
      return Promise.resolve(true)
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
        create,
        trashItem
      },
      search: {
        cancel,
        searchText
      }
    }

    await nativeApi.filesystem.create('/tmp/demo', 'directory')
    const trashed = await nativeApi.filesystem.trashItem('/tmp/demo.md')
    const result = await nativeApi.search.searchText(['/tmp'], 'demo', { isRegexp: false })
    const canceled = await nativeApi.search.cancel('search:1')

    expect(result).toHaveLength(1)
    expect(trashed).toBe(true)
    expect(canceled).toBe(true)
    expect(calls).toEqual([
      ['create', '/tmp/demo', 'directory'],
      ['trashItem', '/tmp/demo.md'],
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
