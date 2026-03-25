<template>
  <div class="pref-editor">
    <h4>Editor</h4>
    <compound>
      <template #head>
        <h6 class="title">Text editor settings:</h6>
      </template>
      <template #children>
        <range
          description="Font size"
          :value="fontSize"
          :min="12"
          :max="32"
          unit="px"
          :step="1"
          :onChange="value => onSelectChange('fontSize', value)"
        ></range>
        <range
          description="Line height"
          :value="lineHeight"
          :min="1.2"
          :max="2.0"
          :step="0.1"
          :onChange="value => onSelectChange('lineHeight', value)"
        ></range>
        <font-text-box
          description="Font family"
          :value="editorFontFamily"
          :onChange="value => onSelectChange('editorFontFamily', value)"
        ></font-text-box>
        <text-box
          description="Maximum width of text editor"
          notes="Leave empty for theme default, otherwise use number with unit suffix, which is one of 'ch' for characters, 'px' for pixels, or '%' for percentage."
          :input="editorLineWidth"
          :regexValidator="/^(?:$|[0-9]+(?:ch|px|%)$)/"
          :onChange="value => onSelectChange('editorLineWidth', value)"
        ></text-box>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Code block settings:</h6>
      </template>
      <template #children>
        <range
          description="Font size"
          :value="codeFontSize"
          :min="12"
          :max="28"
          unit="px"
          :step="1"
          :onChange="value => onSelectChange('codeFontSize', value)"
        ></range>
        <font-text-box
          description="Font family"
          :onlyMonospace="true"
          :value="codeFontFamily"
          :onChange="value => onSelectChange('codeFontFamily', value)"
        ></font-text-box>
        <!-- FIXME: Disabled due to #1648. -->
        <bool
          v-show="false"
          description="Show line numbers"
          :bool="codeBlockLineNumbers"
          :onChange="value => onSelectChange('codeBlockLineNumbers', value)"
        ></bool>
        <bool
          description="Remove leading and trailing empty lines"
          :bool="trimUnnecessaryCodeBlockEmptyLines"
          :onChange="value => onSelectChange('trimUnnecessaryCodeBlockEmptyLines', value)"
        ></bool>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Writing behavior:</h6>
      </template>
      <template #children>
        <bool
          description="Automatically close brackets when writing"
          :bool="autoPairBracket"
          :onChange="value => onSelectChange('autoPairBracket', value)"
        ></bool>
        <bool
          description="Automatically complete markdown syntax"
          :bool="autoPairMarkdownSyntax"
          :onChange="value => onSelectChange('autoPairMarkdownSyntax', value)"
        ></bool>
        <bool
          description="Automatically close quotation marks"
          :bool="autoPairQuote"
          :onChange="value => onSelectChange('autoPairQuote', value)"
        ></bool>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">File representation:</h6>
      </template>
      <template #children>
        <cur-select
          description="Preferred tab width"
          :value="tabSize"
          :options="tabSizeOptions"
          :onChange="value => onSelectChange('tabSize', value)"
        ></cur-select>
        <cur-select
          description="Line separator type"
          :value="endOfLine"
          :options="endOfLineOptions"
          :onChange="value => onSelectChange('endOfLine', value)"
        ></cur-select>
        <cur-select
          description="Default encoding"
          :value="defaultEncoding"
          :options="defaultEncodingOptions"
          :onChange="value => onSelectChange('defaultEncoding', value)"
        ></cur-select>
        <bool
          description="Automatically detect file encoding"
          :bool="autoGuessEncoding"
          :onChange="value => onSelectChange('autoGuessEncoding', value)"
        ></bool>
        <cur-select
          description="Handling of trailing newline characters"
          :value="trimTrailingNewline"
          :options="trimTrailingNewlineOptions"
          :onChange="value => onSelectChange('trimTrailingNewline', value)"
        ></cur-select>
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">Misc:</h6>
      </template>
      <template #children>
        <cur-select
          description="Text direction"
          :value="textDirection"
          :options="textDirectionOptions"
          :onChange="value => onSelectChange('textDirection', value)"
        ></cur-select>
        <bool
          description="Hide hint for selecting type of new paragraph"
          :bool="hideQuickInsertHint"
          :onChange="value => onSelectChange('hideQuickInsertHint', value)"
        ></bool>
        <bool
          description="Hide popup when cursor is over link"
          :bool="hideLinkPopup"
          :onChange="value => onSelectChange('hideLinkPopup', value)"
        ></bool>
        <bool
          description="Whether to automatically check any related tasks"
          :bool="autoCheck"
          :onChange="value => onSelectChange('autoCheck', value)"
        ></bool>
      </template>
    </compound>
  </div>
</template>

<script>
import { mapActions, mapState } from 'pinia'
import Compound from '../common/compound/index.vue'
import FontTextBox from '../common/fontTextBox/index.vue'
import Range from '../common/range/index.vue'
import CurSelect from '../common/select/index.vue'
import Bool from '../common/bool/index.vue'
import Separator from '../common/separator/index.vue'
import TextBox from '../common/textBox/index.vue'
import {
  tabSizeOptions,
  endOfLineOptions,
  textDirectionOptions,
  trimTrailingNewlineOptions,
  getDefaultEncodingOptions
} from './config'
import { usePreferencesStore } from '@/stores/preferences'

export default {
  components: {
    Compound,
    FontTextBox,
    Range,
    CurSelect,
    Bool,
    Separator,
    TextBox
  },
  data () {
    this.tabSizeOptions = tabSizeOptions
    this.endOfLineOptions = endOfLineOptions
    this.textDirectionOptions = textDirectionOptions
    this.trimTrailingNewlineOptions = trimTrailingNewlineOptions
    this.defaultEncodingOptions = getDefaultEncodingOptions()
    return {}
  },
  computed: {
    ...mapState(usePreferencesStore, [
      'fontSize',
      'editorFontFamily',
      'lineHeight',
      'autoPairBracket',
      'autoPairMarkdownSyntax',
      'autoPairQuote',
      'tabSize',
      'endOfLine',
      'textDirection',
      'codeFontSize',
      'codeFontFamily',
      'codeBlockLineNumbers',
      'trimUnnecessaryCodeBlockEmptyLines',
      'hideQuickInsertHint',
      'hideLinkPopup',
      'autoCheck',
      'editorLineWidth',
      'defaultEncoding',
      'autoGuessEncoding',
      'trimTrailingNewline'
    ])
  },
  methods: {
    ...mapActions(usePreferencesStore, ['setSinglePreference']),
    onSelectChange (type, value) {
      this.setSinglePreference({ type, value })
    }
  }
}
</script>

<style scoped>
  .pref-editor {
    & .image-ctrl {
      font-size: 14px;
      user-select: none;
      margin: 20px 0;
      color: var(--editorColor);
      & label {
        display: block;
        margin: 20px 0;
      }
    }
  }
</style>
