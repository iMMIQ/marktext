<template>
  <div class="editor-tabs">
    <div
      class="scrollable-tabs"
      ref="tabContainer"
    >
      <ul
        ref="tabDropContainer"
        class="tabs-container"
      >
        <li
          :title="file.pathname"
          :class="{'active': currentFile.id === file.id, 'unsaved': !file.isSaved }"
          v-for="file of tabs"
          :key="file.id"
          :data-id="file.id"
          role="tab"
          tabindex="0"
          :aria-selected="currentFile.id === file.id"
          @click.stop="selectFile(file)"
          @keydown.enter.prevent="selectFile(file)"
          @keydown.space.prevent="selectFile(file)"
          @click.middle="closeTab(file.id)"
          @contextmenu.prevent="handleContextMenu($event, file)"
        >
          <span>{{ file.filename }}</span>
          <svg class="close-icon icon" aria-hidden="true"
            @click.stop="removeFileInTab(file)"
          >
            <circle id="unsaved-circle-icon" cx="6" cy="6" r="3"></circle>
            <use id="default-close-icon" xlink:href="#icon-close-small"></use>
          </svg>
        </li>
      </ul>
    </div>
    <div
      class="new-file"
      role="button"
      tabindex="0"
      title="New tab"
      aria-label="New tab"
      @click.stop="newFile()"
      @keydown.enter.prevent="newFile()"
      @keydown.space.prevent="newFile()"
    >
      <svg class="icon" aria-hidden="true">
        <use xlink:href="#icon-plus"></use>
      </svg>
    </div>
  </div>
</template>

<script>
import { mapActions, mapState } from 'pinia'
import autoScroll from 'dom-autoscroller'
import dragula from 'dragula'
import { tabsMixins } from '../../mixins'
import { showContextMenu } from '../../contextMenu/tabs'
import bus from '../../bus'
import { useEditorStore } from '@/stores/editor'

export default {
  data () {
    this.autoScroller = null
    this.drake = null
    return {}
  },
  mixins: [tabsMixins],
  computed: {
    ...mapState(useEditorStore, ['currentFile', 'tabs'])
  },
  methods: {
    ...mapActions(useEditorStore, {
      dispatchEditor: 'dispatch'
    }),
    newFile () {
      this.dispatchEditor('NEW_UNTITLED_TAB', {})
    },
    handleTabScroll (event) {
      // Use mouse wheel value first but prioritize X value more (e.g. touchpad input).
      let delta = event.deltaY
      if (event.deltaX !== 0) {
        delta = event.deltaX
      }

      const tabs = this.$refs.tabContainer
      const newLeft = Math.max(0, Math.min(tabs.scrollLeft + delta, tabs.scrollWidth))
      tabs.scrollLeft = newLeft
    },
    closeTab (tabId) {
      const tab = this.tabs.find(f => f.id === tabId)
      if (tab) {
        this.dispatchEditor('CLOSE_TAB', tab)
      }
    },
    closeOthers (tabId) {
      const tab = this.tabs.find(f => f.id === tabId)
      if (tab) {
        this.dispatchEditor('CLOSE_OTHER_TABS', tab)
      }
    },
    closeSaved () {
      this.dispatchEditor('CLOSE_SAVED_TABS')
    },
    closeAll () {
      this.dispatchEditor('CLOSE_ALL_TABS')
    },
    rename (tabId) {
      const tab = this.tabs.find(f => f.id === tabId)
      if (tab && tab.pathname) {
        this.dispatchEditor('RENAME_FILE', tab)
      }
    },
    copyPath (tabId) {
      const tab = this.tabs.find(f => f.id === tabId)
      if (tab && tab.pathname) {
        this.$nativeApi.clipboard.writeText(tab.pathname)
      }
    },
    showInFolder (tabId) {
      const tab = this.tabs.find(f => f.id === tabId)
      if (tab && tab.pathname) {
        this.$nativeApi.shell.showItemInFolder(tab.pathname)
      }
    },
    handleContextMenu (event, tab) {
      if (tab.id) {
        showContextMenu(event, tab)
      }
    }
  },
  created () {
    bus.$on('TABS::close-this', this.closeTab)
    bus.$on('TABS::close-others', this.closeOthers)
    bus.$on('TABS::close-saved', this.closeSaved)
    bus.$on('TABS::close-all', this.closeAll)
    bus.$on('TABS::rename', this.rename)
    bus.$on('TABS::copy-path', this.copyPath)
    bus.$on('TABS::show-in-folder', this.showInFolder)
  },
  mounted () {
    this.$nextTick(() => {
      const tabs = this.$refs.tabContainer

      // Allow to scroll through the tabs by mouse wheel or touchpad.
      tabs.addEventListener('wheel', this.handleTabScroll)

      // Allow tab drag and drop to reorder tabs.
      const drake = this.drake = dragula([this.$refs.tabDropContainer], {
        direction: 'horizontal',
        revertOnSpill: true,
        mirrorContainer: this.$refs.tabDropContainer,
        ignoreInputTextSelection: false
      }).on('drop', (el, target, source, sibling) => {
        // Current tab that was dropped and need to be reordered.
        const droppedId = el.getAttribute('data-id')
        // This should be the next tab (tab | ... | el | sibling | tab | ...) but may be
        // the mirror image or null (tab | ... | el | sibling or null) if last tab.
        const nextTabId = sibling && sibling.getAttribute('data-id')
        const isLastTab = !sibling || sibling.classList.contains('gu-mirror')
        if (!droppedId || (sibling && !nextTabId)) {
          throw new Error('Cannot reorder tabs: invalid tab id.')
        }

        this.dispatchEditor('EXCHANGE_TABS_BY_ID', {
          fromId: droppedId,
          toId: isLastTab ? null : nextTabId
        })
      })

      // TODO(perf): Create a copy of dom-autoscroller and just hook tabs-container to
      //   improve performance. Currently autoScroll is triggered when the mouse is moved
      //   in MarkText window.

      // Scroll when dragging a tab to the beginning or end of the tab container.
      this.autoScroller = autoScroll([tabs], {
        margin: 20,
        maxSpeed: 6,
        scrollWhenOutside: false,
        autoScroll: () => {
          return this.autoScroller.down && drake.dragging
        }
      })
    })
  },
  beforeUnmount () {
    bus.$off('TABS::close-this', this.closeTab)
    bus.$off('TABS::close-others', this.closeOthers)
    bus.$off('TABS::close-saved', this.closeSaved)
    bus.$off('TABS::close-all', this.closeAll)
    bus.$off('TABS::rename', this.rename)
    bus.$off('TABS::copy-path', this.copyPath)
    bus.$off('TABS::show-in-folder', this.showInFolder)

    const tabs = this.$refs.tabContainer
    if (tabs) {
      tabs.removeEventListener('wheel', this.handleTabScroll)
    }

    if (this.autoScroller) {
      // Force destroy
      this.autoScroller.destroy(true)
    }
    if (this.drake) {
      this.drake.destroy()
    }
  }
}
</script>

<style scoped>
  svg.close-icon #unsaved-circle-icon {
    fill: var(--themeColor);
  }
  .editor-tabs {
    position: relative;
    display: flex;
    flex-direction: row;
    height: 35px;
    user-select: none;
    box-shadow: 0px 0px 9px 2px rgba(0, 0, 0, .1);
    overflow: hidden;
    &:hover > .new-file {
      opacity: 1 !important;
    }
  }
  .scrollable-tabs {
    flex: 0 1 auto;
    height: 35px;
    overflow: hidden;
  }
  .tabs-container {
    min-width: min-content;
    list-style: none;
    margin: 0;
    padding: 0;
    height: 35px;
    position: relative;
    display: flex;
    flex-direction: row;
    overflow-y: hidden;
    z-index: 2;
    &::-webkit-scrollbar:horizontal {
      display: none;
    }
    & > li {
      position: relative;
      padding: 0 8px;
      color: var(--editorColor50);
      font-size: 12px;
      line-height: 35px;
      height: 35px;
      max-width: 280px;
      background: var(--floatBgColor);
      display: flex;
      align-items: center;
      &[aria-grabbed="true"] {
        color: var(--editorColor30) !important;
      }
      & > svg {
        opacity: 0;
      }
      &:focus {
        outline: none;
      }
      &:focus-visible {
        box-shadow: inset 0 0 0 2px var(--focusColor);
      }
      &:hover > svg {
        opacity: 1;
      }
      &:hover > svg.close-icon #default-close-icon {
        display: block !important;
      }
      &:hover > svg.close-icon #unsaved-circle-icon {
        display: none !important;
      }
      & > span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-right: 3px;
      }
    }
    & > li.unsaved:not(.active) {
      & > svg.close-icon {
        opacity: 1;
      }
      & > svg.close-icon #unsaved-circle-icon {
        display: block;
      }
      & > svg.close-icon #default-close-icon {
        display: none;
      }
    }
    & > li.active {
      background: var(--itemBgColor);
      z-index: 3;
      &:after {
        content: '';
        position: absolute;
        left: 0;
        bottom: 0;
        right: 0;
        height: 2px;
        background: var(--themeColor);
      }
      & > svg {
        opacity: 1;
      }
      & > svg.close-icon #unsaved-circle-icon {
        display: none;
      }
    }
  }
  .editor-tabs > .new-file {
    flex: 0 0 35px;
    width: 35px;
    height: 35px;
    border-right: none;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-around;
    cursor: pointer;
    color: var(--editorColor50);
    opacity: 1;
    border-radius: var(--radius-sm);
    &:hover {
      color: var(--editorColor80);
      background: var(--floatHoverColor);
    }
    &:focus-visible {
      box-shadow: inset 0 0 0 2px var(--focusColor);
    }
    &.always-visible {
      opacity: 1;
    }
  }

  /* dragula effects */
  .gu-mirror {
    position: fixed !important;
    margin: 0 !important;
    z-index: 9999 !important;
    opacity: 0.8;
    cursor: grabbing;
  }
  .gu-hide {
    display: none !important;
  }
  .gu-unselectable {
    user-select: none !important;
  }
  .gu-transit {
    opacity: 0.2;
  }
</style>
