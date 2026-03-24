import bus from '../bus'
import events from '../services/nativeApi/events'

const state = {}

const getters = {}

const mutations = {}

const actions = {
  LISTEN_FOR_TWEET () {
    events.on('mt::tweet', (e, type) => {
      if (type === 'twitter') {
        bus.$emit('tweetDialog')
      }
    })
  }
}

export default { state, getters, mutations, actions }
