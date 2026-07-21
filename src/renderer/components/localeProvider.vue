<template>
  <el-config-provider :locale="elementLocale">
    <router-view class="view"></router-view>
  </el-config-provider>
</template>

<script>
import { mapState } from 'pinia'
import elementEn from 'element-plus/dist/locale/en.mjs'
import elementZhCN from 'element-plus/dist/locale/zh-cn.mjs'
import { normalizeLocale } from 'common/i18n'
import { usePreferencesStore } from '@/stores/preferences'

export default {
  computed: {
    ...mapState(usePreferencesStore, ['language']),
    elementLocale () {
      return normalizeLocale(this.language) === 'zh-CN' ? elementZhCN : elementEn
    }
  }
}
</script>
