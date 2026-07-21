<template>
  <section class="pref-font-input-item" :class="{'ag-underdevelop': disable}">
    <div class="description">
      <span>{{ $tr(description) }}:</span>
      <svg
        v-if="more"
        class="font-textbox-info"
        viewBox="0 0 16 16"
        aria-hidden="true"
        @click="handleMoreClick"
      >
        <circle cx="8" cy="8" r="6.5"></circle>
        <path d="M8 7v4"></path>
        <circle cx="8" cy="4.5" r="0.75" class="font-textbox-info-dot"></circle>
      </svg>
    </div>
    <el-autocomplete
      class="font-autocomplete"
      popper-class="font-autocomplete-popper"
      v-model="selectValue"
      :fetch-suggestions="querySearch"
      :placeholder="$tr('Select font...')"
      @select="handleSelect"
    >
      <template #suffix>
        <svg class="el-input__icon font-autocomplete-suffix" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4.5 6.5L8 10l3.5-3.5"></path>
        </svg>
      </template>
      <template #default="{ item }">
        <div class="family">{{ item }}</div>
      </template>
    </el-autocomplete>
  </section>
</template>

<script>
// Example of fontmanager-redux objects:
// {
//     path: '/Library/Fonts/Arial.ttf',
//     postscriptName: 'ArialMT',
//     family: 'Arial',
//     style: 'Regular',
//     weight: 400,
//     width: 5,
//     italic: false,
//     monospace: false
// }
// {
//     path: '/Library/Fonts/Arial Bold.ttf',
//     postscriptName: 'Arial-BoldMT',
//     family: 'Arial',
//     style: 'Bold',
//     weight: 700,
//     width: 5,
//     italic: false,
//     monospace: false
// }

export default {
  data () {
    this.defaultValue = this.value
    return {
      fontFamilies: [],
      selectValue: this.value
    }
  },
  props: {
    description: String,
    value: String,
    onChange: Function,
    more: String,
    disable: {
      type: Boolean,
      default: false
    },
    onlyMonospace: {
      type: Boolean,
      default: false
    }
  },

  watch: {
    value: function (value, oldValue) {
      if (value !== oldValue) {
        this.defaultValue = value
        this.selectValue = value
      }
    }
  },

  methods: {
    querySearch (queryString, callback) {
      const fontFamilies = this.fontFamilies
      const results = queryString && this.defaultValue !== queryString
        ? fontFamilies.filter(f => f.toLowerCase().indexOf(queryString.toLowerCase()) === 0)
        : fontFamilies
      callback(results)
    },

    handleSelect (value) {
      if (/^[^\s]+((-|\s)*[^\s])*$/.test(value)) {
        this.selectValue = value
        this.onChange(value)
      }
    },

    handleMoreClick () {
      if (typeof this.more === 'string') {
        this.$nativeApi.shell.openExternal(this.more)
      }
    }
  },
  async mounted () {
    this.fontFamilies = await this.$nativeApi.fonts.listFamilies({
      onlyMonospace: this.onlyMonospace
    })
  }
}
</script>

<style>
.el-autocomplete-suggestion {
  border: 1px solid var(--floatBorderColor);
  background-color: var(--floatBgColor);
}
.el-popper[x-placement^=top] .popper__arrow {
  border-top-color: var(--floatBorderColor);
}
.el-popper[x-placement^=bottom] .popper__arrow {
  border-bottom-color: var(--floatBorderColor);
}
.el-popper[x-placement^=top] .popper__arrow::after {
  border-top-color: var(--floatBgColor);
}
.el-popper[x-placement^=bottom] .popper__arrow::after {
  border-bottom-color: var(--floatBgColor);
}

.el-autocomplete-suggestion li {
  color: var(--editorColor);
}
.el-autocomplete-suggestion li.highlighted,
.el-autocomplete-suggestion li:hover {
  background: var(--floatHoverColor);
}

.pref-font-input-item {
  margin: 20px 0;
  font-size: 14px;
  color: var(--editorColor);
  & .font-autocomplete {
    width: 100%;
  }
  & input.el-input__inner {
    height: 30px;
    background: transparent;
    color: var(--editorColor);
    border-color: var(--editorColor10);
  }
  & .el-input.is-active .el-input__inner,
  & .el-input__inner:focus {
    border-color: var(--themeColor);
  }
  & .el-input__icon,
  & .el-input__inner {
    line-height: 30px;
  }
}
.pref-font-input-item .description {
  margin-bottom: 10px;
  & .font-textbox-info {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-left: 4px;
    cursor: pointer;
    opacity: 0.7;
    color: var(--iconColor);
    fill: none;
    stroke: currentColor;
    stroke-width: 1.2;
    vertical-align: -2px;
  }
  & .font-textbox-info:hover {
    color: var(--themeColor);
  }
  & .font-textbox-info-dot {
    fill: currentColor;
    stroke: none;
  }
}
.pref-font-input-item .font-autocomplete-suffix {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.4;
}
.pref-font-input-item .font-autocomplete-popper {
  li {
    line-height: normal;
    padding: 7px;
    .value {
      text-overflow: ellipsis;
      overflow: hidden;
    }
    .link {
      font-size: 12px;
      color: #b4b4b4;
    }
  }
}
</style>
