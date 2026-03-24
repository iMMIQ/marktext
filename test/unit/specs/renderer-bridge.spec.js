import nativeApi from '../../../src/renderer/services/nativeApi'

describe('renderer native API facade', () => {
  afterEach(() => {
    delete window.mtNative
  })

  it('exposes the expected top-level modules', () => {
    expect(Object.keys(nativeApi).sort()).to.deep.equal([
      'app',
      'clipboard',
      'events',
      'menu',
      'shell',
      'window'
    ])
  })

  it('exposes the app and events bridge contract', () => {
    expect(nativeApi.app.openSettingsWindow).to.be.a('function')
    expect(nativeApi.app.send).to.be.a('function')
    expect(nativeApi.app.invoke).to.be.a('function')

    expect(nativeApi.events.on).to.be.a('function')
    expect(nativeApi.events.once).to.be.a('function')
    expect(nativeApi.events.off).to.be.a('function')
    expect(nativeApi.events.emit).to.be.a('function')
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

    expect(result).to.equal(invokeResult)
    expect(await result).to.deep.equal({ ok: true })
    expect(stopListening).to.equal(unsubscribe)
    expect(eventCalls).to.deep.equal([
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

    expect(calls).to.deep.equal([{
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

    expect(calls).to.deep.equal([{
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

    expect(filePath).to.equal('/tmp/example.png')
    expect(syncFilePath).to.equal('/tmp/example.png')
    expect(clipboardWrites).to.deep.equal(['copied-value'])
  })
})
