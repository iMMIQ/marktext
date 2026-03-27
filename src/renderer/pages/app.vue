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
import { defineAsyncComponent } from 'vue'
import { mapState } from 'pinia'
import { addStyles, addThemeStyle } from '@/util/theme'
import Recent from '@/components/recent'
import EditorWithTabs from '@/components/editorWithTabs'
import TitleBar from '@/components/titleBar'
import SideBar from '@/components/sideBar'
import { loadingPageMixins } from '@/mixins'
import { useAppStore } from '@/stores/app'
import { useEditorStore } from '@/stores/editor'
import { useLayoutStore } from '@/stores/layout'
import { usePreferencesStore } from '@/stores/preferences'
import { useProjectStore } from '@/stores/project'
import { useEventBus } from '@/composables/useEventBus'
import { DEFAULT_STYLE } from '@/config'
import { getInitialState } from '@/services/runtime'

const AboutDialog = defineAsyncComponent(() => import('@/components/about'))
const CommandPalette = defineAsyncComponent(() => import('@/components/commandPalette'))
const ExportSettingDialog = defineAsyncComponent(() => import('@/components/exportSettings'))
const Rename = defineAsyncComponent(() => import('@/components/rename'))
const Tweet = defineAsyncComponent(() => import('@/components/tweet'))
const ImportModal = defineAsyncComponent(() => import('@/components/import'))

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
    const eventBus = useEventBus()
    const initialState = getInitialState()

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
