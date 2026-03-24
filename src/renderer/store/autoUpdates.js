import notice from '../services/notification'
import app from '../services/nativeApi/app'
import events from '../services/nativeApi/events'

const state = {}

const getters = {}

const mutations = {}

// mt::UPDATE_DOWNLOADED
const actions = {
  LISTEN_FOR_UPDATE ({ commit }) {
    events.on('mt::UPDATE_ERROR', (e, message) => {
      notice.notify({
        title: 'Update',
        type: 'error',
        time: 10000,
        message
      })
    })
    events.on('mt::UPDATE_NOT_AVAILABLE', (e, message) => {
      notice.notify({
        title: 'Update not Available',
        type: 'primary',
        message
      })
    })
    events.on('mt::UPDATE_DOWNLOADED', (e, message) => {
      notice.notify({
        title: 'Update Downloaded',
        type: 'info',
        message
      })
    })
    events.on('mt::UPDATE_AVAILABLE', (e, message) => {
      notice.notify({
        title: 'Update Available',
        type: 'primary',
        message,
        showConfirm: true
      })
        .then(() => {
          const needUpdate = true
          app.send('mt::NEED_UPDATE', { needUpdate })
        })
        .catch(() => {
          const needUpdate = false
          app.send('mt::NEED_UPDATE', { needUpdate })
        })
    })
  }
}

export default { state, getters, mutations, actions }
