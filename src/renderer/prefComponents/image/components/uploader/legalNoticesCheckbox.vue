<template>
  <div class="pref-cb-legal-notices">
    <el-checkbox v-model="uploaderService.agreedToLegalNotices"></el-checkbox>
    <span>
      {{ $tr('By using this service, you agree to its') }}
      <span class="link" @click="openUrl(uploaderService.privacyUrl)">{{ $tr('Privacy Statement') }}</span>
      {{ $tr('and') }}
      <span class="link" @click="openUrl(uploaderService.tosUrl)">{{ $tr('Terms of Service') }}</span>.
      <span v-if="!uploaderService.isGdprCompliant">{{ $tr('This service cannot be used in Europe due to GDPR issues.') }}</span>
    </span>
  </div>
</template>

<script>
export default {
  data () {
    return {}
  },
  props: {
    uploaderService: Object
  },
  methods: {
    openUrl (link) {
      if (link) {
        this.$nativeApi.shell.openExternal(link)
      }
    }
  }
}
</script>

<style>
.pref-cb-legal-notices {
  border: 1px solid transparent;
  padding: 3px 5px;
  & .el-checkbox {
    margin-right: 0;
  }
}
</style>
