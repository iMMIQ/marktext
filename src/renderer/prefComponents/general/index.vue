<template>
  <div class="pref-general">
    <h4>{{ $tr('General') }}</h4>
    <compound>
      <template #head>
        <h6 class="title">{{ $tr('Auto Save:') }}</h6>
      </template>
      <template #children>
        <bool
          description="Automatically save document changes"
          :bool="autoSave"
          :onChange="value => onSelectChange('autoSave', value)"
        ></bool>
        <range
          description="Delay following document edit before automatically saving"
          :value="autoSaveDelay"
          :min="1000"
          :max="10000"
          unit="ms"
          :step="100"
          :onChange="value => onSelectChange('autoSaveDelay', value)"
        ></range>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ $tr('Window:') }}</h6>
      </template>
      <template #children>
        <cur-select
          v-if="!isOsx"
          description="Title bar style"
          notes="Requires restart."
          :value="titleBarStyle"
          :options="titleBarStyleOptions"
          :onChange="value => onSelectChange('titleBarStyle', value)"
        ></cur-select>
        <bool
          description="Hide scrollbars"
          :bool="hideScrollbar"
          :onChange="value => onSelectChange('hideScrollbar', value)"
        ></bool>
        <bool
          description="Open files in new window"
          :bool="openFilesInNewWindow"
          :onChange="value => onSelectChange('openFilesInNewWindow', value)"
        ></bool>
        <bool
          description="Open folders in new window"
          :bool="openFolderInNewWindow"
          :onChange="value => onSelectChange('openFolderInNewWindow', value)"
        ></bool>
        <cur-select
          description="Zoom"
          :value="zoom"
          :options="zoomOptions"
          :onChange="value => onSelectChange('zoom', value)"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ $tr('Sidebar:') }}</h6>
      </template>
      <template #children>
        <bool
          description="Wrap text in table of contents"
          :bool="wordWrapInToc"
          :onChange="value => onSelectChange('wordWrapInToc', value)"
        ></bool>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ $tr('Action on startup:') }}</h6>
      </template>
      <template #children>
        <section class="startup-action-ctrl">
          <el-radio-group v-model="startUpAction" class="startup-options">
            <el-radio label="lastState">{{ $tr('Restore last editor session') }}</el-radio>
            <div class="startup-folder-option">
              <el-radio label="folder">{{ $tr('Open the default directory') }}</el-radio>
              <div class="startup-folder-control">
                <el-button size="small" :disabled="startUpAction !== 'folder'" @click="selectDefaultDirectoryToOpen">{{ $tr('Select Folder') }}</el-button>
                <span class="startup-folder-path" :title="defaultDirectoryToOpen">
                  {{ defaultDirectoryToOpen || $tr('No folder selected') }}
                </span>
              </div>
            </div>
            <el-radio label="blank">{{ $tr('Open a blank page') }}</el-radio>
          </el-radio-group>
        </section>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ $tr('Misc:') }}</h6>
      </template>
      <template #children>
        <cur-select
          description="User interface language"
          :value="language"
          :options="languageOptions"
          :onChange="value => onSelectChange('language', value)"
        ></cur-select>
      </template>
    </compound>
  </div>
</template>

<script>
import { mapActions, mapState } from 'pinia'
import Compound from '../common/compound/index.vue'
import Range from '../common/range/index.vue'
import CurSelect from '../common/select/index.vue'
import Bool from '../common/bool/index.vue'
import { isOsx } from '@/util'
import { usePreferencesStore } from '@/stores/preferences'

import {
  titleBarStyleOptions,
  zoomOptions,
  languageOptions
} from './config'

export default {
  components: {
    Compound,
    Bool,
    Range,
    CurSelect
  },
  data () {
    this.titleBarStyleOptions = titleBarStyleOptions
    this.zoomOptions = zoomOptions
    this.languageOptions = languageOptions
    this.isOsx = isOsx
    return {}
  },
  computed: {
    ...mapState(usePreferencesStore, [
      'autoSave',
      'autoSaveDelay',
      'titleBarStyle',
      'defaultDirectoryToOpen',
      'openFilesInNewWindow',
      'openFolderInNewWindow',
      'zoom',
      'hideScrollbar',
      'wordWrapInToc',
      'language'
    ]),
    startUpAction: {
      get () {
        return usePreferencesStore().startUpAction
      },
      set (value) {
        this.setSinglePreference({ type: 'startUpAction', value })
      }
    }
  },
  methods: {
    ...mapActions(usePreferencesStore, {
      setSinglePreference: 'setSinglePreference',
      selectDefaultDirectoryToOpenAction: 'selectDefaultDirectoryToOpen'
    }),
    onSelectChange (type, value) {
      this.setSinglePreference({ type, value })
    },
    selectDefaultDirectoryToOpen () {
      this.selectDefaultDirectoryToOpenAction()
    }
  }
}
</script>

<style scoped>
  .pref-general {
    & .startup-action-ctrl {
      font-size: 14px;
      user-select: none;
      color: var(--editorColor);
      & .startup-options {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-3);
      }
      & .el-radio {
        margin: 0;
      }
      & .startup-folder-option {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }
      & .startup-folder-control {
        min-width: 0;
        margin-left: 24px;
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }
      & .startup-folder-path {
        min-width: 0;
        overflow: hidden;
        color: var(--editorColor60);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
</style>
