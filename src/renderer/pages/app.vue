<template>
  <div
    class="editor-container"
  >
    <side-bar v-if="init"></side-bar>
    <div class="editor-middle">
      <title-bar
        :project="projectTree"
        :pathname="pathname"
        :filename="filename"
        :active="windowActive"
        :word-count="wordCount"
        :platform="platform"
        :is-saved="isSaved"
      ></title-bar>
      <div class="editor-placeholder" v-if="!init"></div>
      <recent
        v-if="!hasCurrentFile && init"
      ></recent>
      <editor-with-tabs
        v-if="hasCurrentFile && init"
        :markdown="markdown"
        :cursor="cursor"
        :source-code="sourceCode"
        :show-tab-bar="showTabBar"
        :text-direction="textDirection"
        :platform="platform"
      ></editor-with-tabs>
      <command-palette></command-palette>
      <about-dialog></about-dialog>
      <export-setting-dialog></export-setting-dialog>
      <rename></rename>
      <tweet></tweet>
      <import-modal></import-modal>
    </div>
  </div>
</template>

<script>
import { mapState } from 'pinia'
import { addStyles, addThemeStyle } from '@/util/theme'
import Recent from '@/components/recent'
import EditorWithTabs from '@/components/editorWithTabs'
import TitleBar from '@/components/titleBar'
import SideBar from '@/components/sideBar'
import AboutDialog from '@/components/about'
import CommandPalette from '@/components/commandPalette'
import ExportSettingDialog from '@/components/exportSettings'
import Rename from '@/components/rename'
import Tweet from '@/components/tweet'
import ImportModal from '@/components/import'
import { loadingPageMixins } from '@/mixins'
import { useAppStore } from '@/stores/app'
import { useAutoUpdatesStore } from '@/stores/autoUpdates'
import { useCommandCenterStore } from '@/stores/commandCenter'
import { useEditorStore } from '@/stores/editor'
import { useLayoutStore } from '@/stores/layout'
import { useListenForMainStore } from '@/stores/listenForMain'
import { useNotificationStore } from '@/stores/notification'
import { usePreferencesStore } from '@/stores/preferences'
import { useProjectStore } from '@/stores/project'
import { useTweetStore } from '@/stores/tweet'
import { useEventBus } from '@/composables/useEventBus'
import { DEFAULT_STYLE } from '@/config'
import { getInitialState } from '@/services/runtime'

export default {
  name: 'marktext',
  components: {
    Recent,
    EditorWithTabs,
    TitleBar,
    SideBar,
    AboutDialog,
    ExportSettingDialog,
    Rename,
    Tweet,
    ImportModal,
    CommandPalette
  },
  mixins: [loadingPageMixins],
  data () {
    return {
    }
  },
  computed: {
    ...mapState(useLayoutStore, ['showTabBar']),
    ...mapState(usePreferencesStore, ['sourceCode', 'theme', 'textDirection', 'zoom']),
    ...mapState(useProjectStore, ['projectTree']),
    ...mapState(useEditorStore, {
      pathname: state => state.currentFile.pathname,
      filename: state => state.currentFile.filename,
      isSaved: state => state.currentFile.isSaved,
      markdown: state => state.currentFile.markdown,
      cursor: state => state.currentFile.cursor,
      wordCount: state => state.currentFile.wordCount
    }),
    ...mapState(useAppStore, ['windowActive', 'platform', 'init']),
    hasCurrentFile () {
      return this.markdown !== undefined
    }
  },
  watch: {
    theme: function (value, oldValue) {
      if (value !== oldValue) {
        addThemeStyle(value)
      }
    },
    zoom: function (zoom) {
      this.$nativeApi.events.emit('mt::window-zoom', null, zoom)
    }
  },
  created () {
    const appStore = useAppStore()
    const autoUpdatesStore = useAutoUpdatesStore()
    const commandCenterStore = useCommandCenterStore()
    const editorStore = useEditorStore()
    const layoutStore = useLayoutStore()
    const listenForMainStore = useListenForMainStore()
    const notificationStore = useNotificationStore()
    const preferencesStore = usePreferencesStore()
    const projectStore = useProjectStore()
    const tweetStore = useTweetStore()
    const eventBus = useEventBus()
    const initialState = getInitialState()

    // Apply initial state (theme and titleBarStyle) and delay load other values.
    if (initialState) {
      preferencesStore.commit('SET_USER_PREFERENCE', initialState)
    }

    // store/index.js
    appStore.dispatch('LINTEN_WIN_STATUS')
    commandCenterStore.dispatch('LISTEN_COMMAND_CENTER_BUS')
    tweetStore.dispatch('LISTEN_FOR_TWEET')
    layoutStore.dispatch('LISTEN_FOR_LAYOUT')
    listenForMainStore.dispatch('LISTEN_FOR_EDIT')
    preferencesStore.dispatch('LISTEN_FOR_VIEW')
    listenForMainStore.dispatch('LISTEN_FOR_SHOW_DIALOG')
    listenForMainStore.dispatch('LISTEN_FOR_PARAGRAPH_INLINE_STYLE')
    projectStore.dispatch('LISTEN_FOR_UPDATE_PROJECT')
    projectStore.dispatch('LISTEN_FOR_LOAD_PROJECT')
    projectStore.dispatch('LISTEN_FOR_SIDEBAR_CONTEXT_MENU')
    autoUpdatesStore.dispatch('LISTEN_FOR_UPDATE')
    editorStore.dispatch('LISTEN_SCREEN_SHOT')
    preferencesStore.askForUserPreference()
    preferencesStore.dispatch('LISTEN_TOGGLE_VIEW')
    editorStore.dispatch('LISTEN_FOR_CLOSE')
    editorStore.dispatch('LISTEN_FOR_SAVE_AS')
    editorStore.dispatch('LISTEN_FOR_MOVE_TO')
    editorStore.dispatch('LISTEN_FOR_SAVE')
    editorStore.dispatch('LISTEN_FOR_SET_PATHNAME')
    editorStore.dispatch('LISTEN_FOR_BOOTSTRAP_WINDOW')
    editorStore.dispatch('LISTEN_FOR_SAVE_CLOSE')
    editorStore.dispatch('LISTEN_FOR_RENAME')
    editorStore.dispatch('LINTEN_FOR_SET_LINE_ENDING')
    editorStore.dispatch('LINTEN_FOR_SET_ENCODING')
    editorStore.dispatch('LINTEN_FOR_SET_FINAL_NEWLINE')
    editorStore.dispatch('LISTEN_FOR_NEW_TAB')
    editorStore.dispatch('LISTEN_FOR_CLOSE_TAB')
    editorStore.dispatch('LISTEN_FOR_TAB_CYCLE')
    editorStore.dispatch('LISTEN_FOR_SWITCH_TABS')
    editorStore.dispatch('LINTEN_FOR_PRINT_SERVICE_CLEARUP')
    editorStore.dispatch('LINTEN_FOR_EXPORT_SUCCESS')
    editorStore.dispatch('LISTEN_FOR_FILE_CHANGE')
    editorStore.dispatch('LISTEN_WINDOW_ZOOM')
    editorStore.dispatch('LISTEN_FOR_RELOAD_IMAGES')
    editorStore.dispatch('LISTEN_FOR_CONTEXT_MENU')
    notificationStore.dispatch('LISTEN_FOR_NOTIFICATION')

    // prevent Chromium's default behavior and try to open the first file
    window.addEventListener('dragover', e => {
      // Cancel to allow tab drag&drop.
      if (!e.dataTransfer.types.length) return

      if (e.dataTransfer.types.indexOf('Files') >= 0) {
        if (e.dataTransfer.items.length === 1 && e.dataTransfer.items[0].type.indexOf('image') > -1) {
          // Do nothing, because we already drag/drop image in muya.
        } else {
          e.preventDefault()
          if (this.timer) {
            clearTimeout(this.timer)
          }
          this.timer = setTimeout(() => {
            eventBus.$emit('importDialog', false)
          }, 300)
          eventBus.$emit('importDialog', true)
        }

        e.dataTransfer.dropEffect = 'copy'
      } else {
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'none'
      }
    }, false)

    this.$nextTick(() => {
      const style = initialState || DEFAULT_STYLE
      addStyles(style)
      this.hideLoadingPage()
    })
  }
}
</script>

<style scoped>
  .editor-placeholder,
  .editor-container {
    display: flex;
    flex-direction: row;
    position: absolute;
    width: 100vw;
    height: 100vh;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }
  .editor-container .hide {
    z-index: -1;
    opacity: 0;
    position: absolute;
    left: -10000px;
  }
  .editor-placeholder {
    background: var(--editorBgColor);
  }
  .editor-middle {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 100vh;
    position: relative;
    & > .editor {
      flex: 1;
    }
  }
</style>
