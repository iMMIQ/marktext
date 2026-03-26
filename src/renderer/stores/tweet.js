import { defineStore } from 'pinia'
import bus from '@/bus'
import events from '@/services/nativeApi/events'

let isTweetListenerBound = false

export const useTweetStore = defineStore('tweet', {
  state: () => ({}),
  actions: {
    bindTweetEvents () {
      if (isTweetListenerBound) {
        return
      }

      events.on('mt::tweet', (event, type) => {
        if (type === 'twitter') {
          bus.$emit('tweetDialog')
        }
      })

      isTweetListenerBound = true
    }
  }
})
