import { defineStore } from 'pinia'
import moduleTweet from './modules/tweet'
import { createLegacyState } from './index'
import { createModuleStoreActions } from './moduleDispatcher'

export const useTweetStore = defineStore('tweet', {
  state: createLegacyState(moduleTweet.state),
  actions: createModuleStoreActions()
})
