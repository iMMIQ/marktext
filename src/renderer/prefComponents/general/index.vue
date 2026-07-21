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

        <!-- TODO: The description is very bad and the entry isn't used by the editor. -->
        <cur-select
          description="Sort field for files in open folders"
          :value="fileSortBy"
          :options="fileSortByOptions"
          :onChange="value => onSelectChange('fileSortBy', value)"
          :disable="true"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ $tr('Action on startup:') }}</h6>
      </template>
      <template #children>
        <section class="startup-action-ctrl">
          <el-radio-group v-model="startUpAction">
            <!--
              Hide "lastState" for now (#2064).
            <el-radio class="ag-underdevelop" label="lastState">Restore last editor session</el-radio>
            -->
            <el-radio label="folder" style="margin-bottom: 10px;">{{ $tr('Open the default directory') }}<span>: {{defaultDirectoryToOpen}}</span></el-radio>
            <el-button size="small" @click="selectDefaultDirectoryToOpen">{{ $tr('Select Folder') }}</el-button>
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
import Separator from '../common/separator/index.vue'
import { isOsx } from '@/util'
import { usePreferencesStore } from '@/stores/preferences'

import {
  titleBarStyleOptions,
  zoomOptions,
  fileSortByOptions,
  languageOptions
} from './config'

export default {
  components: {
    Compound,
    Bool,
    Range,
    CurSelect,
    Separator
  },
  data () {
    this.titleBarStyleOptions = titleBarStyleOptions
    this.zoomOptions = zoomOptions
    this.fileSortByOptions = fileSortByOptions
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
      'fileSortBy',
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
      & .el-button--small {
        margin-left: 25px;
      }
      & label {
        display: block;
        margin: 20px 0;
      }
    }
  }
</style>
