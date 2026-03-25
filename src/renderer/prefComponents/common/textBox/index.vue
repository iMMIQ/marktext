<template>
  <section class="pref-text-box-item" :class="{'ag-underdevelop': disable}">
    <div class="description">
      <span>{{description}}:</span>
      <info-icon v-if="more"
        @click="handleMoreClick"
      ></info-icon>
    </div>
    <el-input
      class="input"
      :class="{error: invalidInput}"
      :placeholder="defaultValue"
      v-model="inputText"
      @input="handleInput"
      size="small"
      clearable>
    </el-input>
    <div v-if="notes" class="notes">
      {{notes}}
    </div>
  </section>
</template>

<script>
import InfoIcon from '../infoIcon.vue'

export default {
  components: {
    InfoIcon
  },
  data () {
    this.inputTimer = null
    return {
      inputText: this.input,
      invalidInput: false
    }
  },
  props: {
    description: String,
    notes: String,
    input: String,
    onChange: Function,
    more: String,
    disable: {
      type: Boolean,
      default: false
    },
    defaultValue: {
      type: String,
      default: ''
    },
    emitTime: {
      type: Number,
      default: 800
    },
    regexValidator: {
      type: RegExp,
      default () {
        return /(.*?)/
      }
    }
  },
  watch: {
    input: function (value, oldValue) {
      if (value !== oldValue) {
        this.inputText = value
      }
    }
  },
  methods: {
    handleMoreClick () {
      if (typeof this.more === 'string') {
        this.$nativeApi.shell.openExternal(this.more)
      }
    },
    handleInput (value) {
      const result = this.regexValidator.test(value)
      this.invalidInput = !result

      if (result) {
        // Only clear timer when input is valid, otherwise write the last value.
        if (this.inputTimer) {
          clearTimeout(this.inputTimer)
        }

        const { emitTime } = this
        if (emitTime === 0) {
          this.onChange(value)
          return
        }

        // Setting delay a little bit higher to prevent continuously file writes when typing.
        this.inputTimer = setTimeout(() => {
          this.inputTimer = null
          this.onChange(value)
        }, emitTime)
      }
    }
  }
}
</script>

<style>
  .pref-text-box-item {
    font-size: 14px;
    user-select: none;
    margin: 20px 0;
    color: var(--editorColor);
    width: 100%;
    & input.el-input__inner {
      height: 30px;
      background: transparent;
      color: var(--editorColor);
      border-color: var(--editorColor10);
      padding-right: 15px;
      &::placeholder {
        color: var(--editorColor30);
      }
    }
    & .notes {
      margin-top: 10px;
      font-style: italic;
      font-size: 12px;
    }
    & .input {
      width: 100%;
    }
    & .el-input.is-active .el-input__inner,
    & .el-input__inner:focus {
      border-color: var(--themeColor);
    }
    & .el-input__icon,
    & .el-input__inner {
      line-height: 30px;
    }
    & .description {
      margin-bottom: 10px;
    }
    & .pref-info-icon {
      cursor: pointer;
      opacity: .7;
      color: var(--iconColor);
    }
    & .pref-info-icon:hover {
      color: var(--themeColor);
    }
  }
  .pref-text-box-item .el-input.error input {
    color: #f56c6c;
  }
</style>
