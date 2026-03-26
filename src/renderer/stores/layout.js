import { defineStore } from 'pinia'
import bus from '@/bus'
import app from '@/services/nativeApi/app'
import events from '@/services/nativeApi/events'
import { getRuntime } from '@/services/runtime'

let isLayoutListenerBound = false

const getPersistedSideBarWidth = () => {
  const width = globalThis.localStorage?.getItem?.('side-bar-width')
  const parsed = Number(width)
  return Number.isFinite(parsed) ? Math.max(parsed, 220) : 280
}

const getWindowId = () => {
  try {
    return getRuntime().env.windowId
  } catch (_) {
    return null
  }
}

const createLayoutState = () => ({
  rightColumn: 'files',
  showSideBar: false,
  showTabBar: false,
  sideBarWidth: getPersistedSideBarWidth()
})

export const useLayoutStore = defineStore('layout', {
  state: createLayoutState,
  actions: {
    applyLayout (layout) {
      if (layout.showSideBar !== undefined) {
        const windowId = getWindowId()
        if (windowId !== null) {
          app.send('mt::update-sidebar-menu', windowId, !!layout.showSideBar)
        }
      }

      Object.assign(this, layout)
    },
    toggleLayoutEntry (entryName) {
      this[entryName] = !this[entryName]
    },
    setSideBarWidth (width) {
      const normalizedWidth = Math.max(Number(width), 220)
      globalThis.localStorage?.setItem?.('side-bar-width', normalizedWidth)
      this.sideBarWidth = normalizedWidth
    },
    bindLayoutEvents () {
      if (isLayoutListenerBound) {
        return
      }

      events.on('mt::set-view-layout', (event, layout) => {
        if (layout.rightColumn) {
          this.applyLayout({
            ...layout,
            rightColumn: layout.rightColumn === this.rightColumn ? '' : layout.rightColumn,
            showSideBar: true
          })
        } else {
          this.applyLayout(layout)
        }
        this.dispatchLayoutMenuItems()
      })

      events.on('mt::toggle-view-layout-entry', (event, entryName) => {
        this.toggleLayoutEntry(entryName)
        this.dispatchLayoutMenuItems()
      })

      bus.$on('view:toggle-layout-entry', entryName => {
        this.toggleLayoutEntry(entryName)
        const windowId = getWindowId()
        if (windowId !== null) {
          app.send('mt::view-layout-changed', windowId, { [entryName]: this[entryName] })
        }
      })

      isLayoutListenerBound = true
    },
    dispatchLayoutMenuItems () {
      const windowId = getWindowId()
      if (windowId === null) {
        return
      }

      app.send('mt::view-layout-changed', windowId, {
        showTabBar: this.showTabBar,
        showSideBar: this.showSideBar
      })
    },
    changeSideBarWidth (width) {
      this.setSideBarWidth(width)
    },
    dispatch (type, payload) {
      switch (type) {
        case 'CHANGE_SIDE_BAR_WIDTH':
          return this.changeSideBarWidth(payload)
        default:
          throw new Error(`Unknown layout action: ${type}`)
      }
    },
    commit (type, payload) {
      switch (type) {
        case 'SET_LAYOUT':
          return this.applyLayout(payload)
        default:
          throw new Error(`Unknown layout mutation: ${type}`)
      }
    }
  }
})
