import { defineStore } from 'pinia'
import legacyTweet from '@/store/tweet'
import { createLegacyState } from './index'

export const useTweetStore = defineStore('tweet', {
  state: createLegacyState(legacyTweet.state)
})
