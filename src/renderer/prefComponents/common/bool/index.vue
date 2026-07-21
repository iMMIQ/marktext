<template>
  <section class="pref-switch-item" :class="{'ag-underdevelop': disable}">
    <div class="description">
      <span>{{description}}</span>
      <info-icon v-if="more"
        @click="handleMoreClick"
      ></info-icon>
      <el-tooltip
        v-else-if="detailedDescription"
        :content="detailedDescription"
        class="item"
        effect="dark"
        placement="top-start"
      >
        <info-icon></info-icon>
      </el-tooltip>
      <span v-if="notes" class="notes">
        {{notes}}
      </span>
    </div>
    <el-switch
      v-model="status"
      @change="handleSwitchChange">
    </el-switch>
  </section>
</template>

<script>
import InfoIcon from '../infoIcon.vue'

export default {
  components: {
    InfoIcon
  },
  data () {
    return {
      status: this.bool
    }
  },
  props: {
    description: String,
    notes: String,
    bool: Boolean,
    onChange: Function,
    more: String,
    detailedDescription: String,
    disable: {
      type: Boolean,
      default: false
    }
  },
  watch: {
    bool: function (value, oldValue) {
      if (value !== oldValue) {
        this.status = value
      }
    }
  },
  methods: {
    handleMoreClick () {
      if (typeof this.more === 'string') {
        this.$nativeApi.shell.openExternal(this.more)
      }
    },
    handleSwitchChange (value) {
      this.onChange(value)
    }
  }
}
</script>

<style>
  .pref-switch-item {
    font-size: 14px;
    user-select: none;
    min-height: var(--control-height);
    margin: var(--space-2) 0;
    color: var(--editorColor);
    display: flex;
    align-items: center;
    justify-content: space-between;

    & .description {
      & .pref-info-icon {
        cursor: pointer;
        opacity: .7;
        color: var(--iconColor);
      }
      & .pref-info-icon:hover {
        color: var(--themeColor);
      }
    }

    & .notes {
      font-style: italic;
      font-size: 12px;
    }
  }

  span.el-switch__core::after {
    top: 3px;
    left: 7px;
    width: 10px;
    height: 10px;
  }

  .el-switch .el-switch__core {
    border: 2px solid var(--iconColor);
    background: transparent;
    box-sizing: border-box;
  }

  span.el-switch__label {
    color: var(--editorColor50);
  }

  .el-switch:not(.is-checked) .el-switch__core::after {
    background: var(--iconColor);
  }
</style>
