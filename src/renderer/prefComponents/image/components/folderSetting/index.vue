<template>
  <section class="image-folder">
    <h5>{{ $tr('Global or relative image folder') }}</h5>
    <text-box description="Global image folder" :input="imageFolderPath"
      :regexValidator="/^(?:$|([a-zA-Z]:)?[\/\\].*$)/" :defaultValue="folderPathPlaceholder"
      :onChange="value => modifyImageFolderPath(value)"></text-box>
    <div>
      <el-button size="small" @click="modifyImageFolderPath(undefined)">{{ $tr('Open...') }}</el-button>
      <el-button size="small" :disabled="!imageFolderPath" @click="openImageFolder">{{ $tr('Show in Folder') }}</el-button>
    </div>
    <compound>
      <template #head>
        <bool description="Prefer relative assets folder"
          more="https://github.com/marktext/marktext/blob/develop/docs/IMAGES.md"
          :bool="imagePreferRelativeDirectory"
          :onChange="value => onSelectChange('imagePreferRelativeDirectory', value)"></bool>
      </template>
      <template #children>
        <text-box description="Relative image folder name" :input="imageRelativeDirectoryName"
          :regexValidator="/^(?:$|(?![a-zA-Z]:)[^\/\\].*$)/"
          :defaultValue="relativeDirectoryNamePlaceholder"
          :onChange="value => onSelectChange('imageRelativeDirectoryName', value)"></text-box>
        <div class="footnote">
          {{ $tr('Include') }} <code>${filename}</code> {{ $tr('in the text box above to automatically insert the document file name.') }}
        </div>
      </template>
    </compound>
  </section>
</template>

<script>
import { mapActions, mapState } from 'pinia'
import Bool from '@/prefComponents/common/bool/index.vue'
import Compound from '@/prefComponents/common/compound/index.vue'
import TextBox from '@/prefComponents/common/textBox/index.vue'
import { usePreferencesStore } from '@/stores/preferences'

export default {
  components: {
    Bool,
    Compound,
    TextBox
  },
  data () {
    return {
    }
  },
  computed: {
    ...mapState(usePreferencesStore, [
      'imageFolderPath',
      'imagePreferRelativeDirectory',
      'imageRelativeDirectoryName'
    ]),
    folderPathPlaceholder () {
      return this.imageFolderPath || ''
    },
    relativeDirectoryNamePlaceholder () {
      return this.imageRelativeDirectoryName || 'assets'
    }
  },
  methods: {
    ...mapActions(usePreferencesStore, ['setImageFolderPath', 'setSinglePreference']),
    openImageFolder () {
      this.$nativeApi.shell.showItemInFolder(this.imageFolderPath)
    },
    modifyImageFolderPath (value) {
      return this.setImageFolderPath(value)
    },
    onSelectChange (type, value) {
      this.setSinglePreference({ type, value })
    }
  }
}
</script>

<style scoped>
.image-folder .footnote {
  font-size: 13px;
  & code {
    font-size: 13px;
  }
}
</style>
