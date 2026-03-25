import { defineStore } from 'pinia'
import legacyEditor from '@/store/editor'
import { createLegacyState } from './index'

export const useEditorStore = defineStore('editor', {
  state: createLegacyState(legacyEditor.state)
})
