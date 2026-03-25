import mitt from 'mitt'

const emitter = mitt()
const listenerMap = new Map()

const getEventListeners = type => {
  if (!listenerMap.has(type)) {
    listenerMap.set(type, new Map())
  }

  return listenerMap.get(type)
}

const eventBus = {
  $on (type, handler) {
    const listeners = getEventListeners(type)
    const wrapped = payload => {
      const args = Array.isArray(payload) ? payload : [payload]
      handler(...args)
    }

    listeners.set(handler, wrapped)
    emitter.on(type, wrapped)
    return () => eventBus.$off(type, handler)
  },
  $off (type, handler) {
    const listeners = listenerMap.get(type)
    if (!listeners) {
      return
    }

    const wrapped = listeners.get(handler)
    if (!wrapped) {
      return
    }

    emitter.off(type, wrapped)
    listeners.delete(handler)

    if (listeners.size === 0) {
      listenerMap.delete(type)
    }
  },
  $emit (type, ...args) {
    emitter.emit(type, args)
  }
}

const useEventBus = () => eventBus

export {
  useEventBus
}

export default eventBus
