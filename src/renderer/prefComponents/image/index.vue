<template>
  <div class="pref-image">
    <h4>{{ $tr('Image') }}</h4>
    <section class="image-ctrl">
      <div>{{ $tr('Default action after an image is inserted from local folder or clipboard') }}
        <el-tooltip class='item' effect='dark'
          :content="$tr('Clipboard handling is only fully supported on macOS and Windows.')"
          placement='top-start'>
          <info-icon></info-icon>
        </el-tooltip>
      </div>
      <CurSelect :value="imageInsertAction" :options="imageActions"
        :onChange="value => onSelectChange('imageInsertAction', value)"></CurSelect>
    </section>
    <Separator />
    <FolderSetting v-if="imageInsertAction === 'folder' || imageInsertAction === 'path'" />
    <Uploader v-if="imageInsertAction === 'upload'" />
  </div>
</template>

<script>
import { mapActions, mapState } from 'pinia'
import Separator from '../common/separator/index.vue'
import InfoIcon from '../common/infoIcon.vue'
import Uploader from './components/uploader/index.vue'
import CurSelect from '@/prefComponents/common/select/index.vue'
import FolderSetting from './components/folderSetting/index.vue'
import { imageActions } from './config'
import { usePreferencesStore } from '@/stores/preferences'

export default {
  components: {
    InfoIcon,
    Separator,
    CurSelect,
    FolderSetting,
    Uploader
  },
  data () {
    this.imageActions = imageActions

    return {}
  },
  computed: {
    ...mapState(usePreferencesStore, ['imageInsertAction'])
  },
  methods: {
    ...mapActions(usePreferencesStore, ['setSinglePreference']),
    onSelectChange (type, value) {
      this.setSinglePreference({ type, value })
    }
  }
}
</script>

<style>
.pref-image {
  & .image-ctrl {
    font-size: 14px;
    margin: 20px 0;
    color: var(--editorColor);
    & label {
      display: block;
      margin: 20px 0;
    }
    & .pref-info-icon {
      margin-left: 4px;
      color: var(--iconColor);
      cursor: pointer;
    }
  }
}
</style>
