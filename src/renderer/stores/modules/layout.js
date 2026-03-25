import bus from '../../bus'
import app from '../../services/nativeApi/app'
import events from '../../services/nativeApi/events'
import { getRuntime } from '../../services/runtime'

const width = localStorage.getItem('side-bar-width')
const sideBarWidth = typeof +width === 'number' ? Math.max(+width, 220) : 280

// messages from main process, and do not change the state
const state = {
  rightColumn: 'files',
  showSideBar: false,
  showTabBar: false,
  sideBarWidth
}

const getters = {}

const mutations = {
  SET_LAYOUT (state, layout) {
    if (layout.showSideBar !== undefined) {
      const { windowId } = getRuntime().env
      app.send('mt::update-sidebar-menu', windowId, !!layout.showSideBar)
    }
    Object.assign(state, layout)
  },
  TOGGLE_LAYOUT_ENTRY (state, entryName) {
    state[entryName] = !state[entryName]
  },
  SET_SIDE_BAR_WIDTH (state, width) {
    // TODO: Add side bar to session (GH#732).
    localStorage.setItem('side-bar-width', Math.max(+width, 220))
    state.sideBarWidth = width
  }
}

const actions = {
  LISTEN_FOR_LAYOUT ({ state, commit, dispatch }) {
    events.on('mt::set-view-layout', (e, layout) => {
      if (layout.rightColumn) {
        commit('SET_LAYOUT', {
          ...layout,
          rightColumn: layout.rightColumn === state.rightColumn ? '' : layout.rightColumn,
          showSideBar: true
        })
      } else {
        commit('SET_LAYOUT', layout)
      }
      dispatch('DISPATCH_LAYOUT_MENU_ITEMS')
    })

    events.on('mt::toggle-view-layout-entry', (event, entryName) => {
      commit('TOGGLE_LAYOUT_ENTRY', entryName)
      dispatch('DISPATCH_LAYOUT_MENU_ITEMS')
    })

    bus.$on('view:toggle-layout-entry', entryName => {
      commit('TOGGLE_LAYOUT_ENTRY', entryName)
      const { windowId } = getRuntime().env
      app.send('mt::view-layout-changed', windowId, { [entryName]: state[entryName] })
    })
  },

  DISPATCH_LAYOUT_MENU_ITEMS ({ state }) {
    const { windowId } = getRuntime().env
    const { showTabBar, showSideBar } = state
    app.send('mt::view-layout-changed', windowId, { showTabBar, showSideBar })
  },

  CHANGE_SIDE_BAR_WIDTH ({ commit }, width) {
    commit('SET_SIDE_BAR_WIDTH', width)
  }
}

export default { state, getters, mutations, actions }
