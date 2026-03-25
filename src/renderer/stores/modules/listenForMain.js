import bus from '../../bus'
import events from '../../services/nativeApi/events'

const state = {}

const getters = {}

const mutations = {}

const actions = {
  LISTEN_FOR_EDIT ({ commit }) {
    events.on('mt::editor-edit-action', (e, type) => {
      if (type === 'findInFolder') {
        commit('SET_LAYOUT', {
          rightColumn: 'search',
          showSideBar: true
        })
      }
      bus.$emit(type, type)
    })
  },

  LISTEN_FOR_SHOW_DIALOG ({ commit }) {
    events.on('mt::about-dialog', e => {
      bus.$emit('aboutDialog')
    })
    events.on('mt::show-export-dialog', (e, type) => {
      bus.$emit('showExportDialog', type)
    })
  },

  LISTEN_FOR_PARAGRAPH_INLINE_STYLE () {
    events.on('mt::editor-paragraph-action', (e, { type }) => {
      bus.$emit('paragraph', type)
    })
    events.on('mt::editor-format-action', (e, { type }) => {
      bus.$emit('format', type)
    })
  }
}

const listenForMain = { state, getters, mutations, actions }

export default listenForMain
