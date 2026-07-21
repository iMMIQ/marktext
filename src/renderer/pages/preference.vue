<template>
  <div class="pref-container">
    <title-bar v-if="showCustomTitleBar"></title-bar>
    <side-bar></side-bar>
    <div
      class="pref-content"
      :class="{ 'frameless': titleBarStyle === 'custom' || isOsx }"
    >
      <div class="title-bar" v-if="!showCustomTitleBar"></div>
      <router-view class="pref-setting"></router-view>
    </div>
  </div>
</template>

<script>
import { mapActions, mapState } from 'pinia'
import TitleBar from '@/prefComponents/common/titlebar.vue'
import SideBar from '@/prefComponents/sideBar/index.vue'
import { loadingPageMixins } from '@/mixins'
import { addThemeStyle } from '@/util/theme'
import { DEFAULT_STYLE } from '@/config'
import { isOsx } from '@/util'
import { getInitialState } from '@/services/runtime'
import { usePreferencesStore } from '@/stores/preferences'

export default {
  data () {
    this.isOsx = isOsx
    return {}
  },
  mixins: [loadingPageMixins],
  components: {
    TitleBar,
    SideBar
  },
  computed: {
    ...mapState(usePreferencesStore, ['theme', 'titleBarStyle']),
    showCustomTitleBar () {
      return this.titleBarStyle === 'custom' && !this.isOsx
    }
  },
  watch: {
    theme: function (value, oldValue) {
      if (value !== oldValue) {
        addThemeStyle(value)
      }
    }
  },
  methods: {
    ...mapActions(usePreferencesStore, ['askForUserPreference'])
  },
  created () {
    this.$nextTick(() => {
      const state = getInitialState() || DEFAULT_STYLE
      addThemeStyle(state.theme)

      this.askForUserPreference()
      this.hideLoadingPage()
    })
  }
}
</script>

<style>
.pref-container {
  --prefSideBarWidth: 220px;

  width: 100vw;
  height: 100vh;
  max-width: 100vw;
  max-height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  display: flex;
  background: var(--editorBgColor);

  & h4 {
    margin: 0;
    font-weight: normal;
  }

  & h5 {
    font-weight: normal;
  }

  & .pref-content {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    max-width: calc(100vw - var(--prefSideBarWidth));
    & .title-bar {
      width: 100%;
      height: var(--titleBarHeight);
      position: fixed;
      top: 0;
      right: 0;
      -webkit-app-region: drag;
    }
    & .pref-setting {
      width: 100%;
      max-width: 860px;
      box-sizing: border-box;
      align-self: center;
      padding: var(--space-6) clamp(var(--space-4), 4vw, 48px);
      padding-top: var(--titleBarHeight);
      flex: 1;
      height: calc(100vh - var(--titleBarHeight));
      overflow: auto;
    }
    & .pref-setting > h4 {
      margin: var(--space-2) 0 var(--space-5);
      color: var(--editorColor80);
      font-size: 22px;
      font-weight: 600;
    }
    & span, & div,
    & h1, & h2, & h3, & h4, & h5 {
      user-select: none;
    }
  }
  & .pref-content.frameless .pref-setting {
    /* Move the scrollbar below the titlebar */
    margin-top: var(--titleBarHeight);
    padding-top: 0;
  }

  & .el-input__wrapper {
    background: transparent;
    box-shadow: 0 0 0 1px var(--editorColor10) inset;
  }

  & .el-input__wrapper.is-focus {
    box-shadow: 0 0 0 1px var(--themeColor) inset;
  }

  & .el-input__inner {
    border: 0 !important;
  }
}

@media (max-width: 720px) {
  .pref-container {
    --prefSideBarWidth: 72px;
  }

  .pref-container .pref-content .pref-setting {
    padding-right: var(--space-4);
    padding-left: var(--space-4);
  }
}
</style>
