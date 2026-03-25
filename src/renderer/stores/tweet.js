import { defineStore } from 'pinia'
import legacyTweet from '@/store/tweet'
import { createLegacyState } from './index'
import { createLegacyStoreActions } from './legacyActions'

export const useTweetStore = defineStore('tweet', {
  state: createLegacyState(legacyTweet.state),
  actions: createLegacyStoreActions()
})
