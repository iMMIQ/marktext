<template>
  <div class="search-bar"
    @click.stop="noop"
    v-show="showSearch"
  >
    <div
      class="left-arrow"
      role="button"
      tabindex="0"
      :aria-label="type === 'search' ? 'Show replace controls' : 'Hide replace controls'"
      :title="type === 'search' ? 'Show replace controls' : 'Hide replace controls'"
      @click="toggleSearchType"
      @keydown.enter.prevent="toggleSearchType"
      @keydown.space.prevent="toggleSearchType"
    >
      <svg
        class="icon"
        aria-hidden="true"
        :class="{'arrow-right': type === 'search'}"
      >
        <use xlink:href="#icon-arrowdown"></use>
      </svg>
    </div>
    <div class="right-controls">
      <section class="search">
        <div
          class="input-wrapper"
          :class="{'error': !!searchErrorMsg}"
        >
          <input
            type="text"
            v-model="searchValue"
            @keyup="search($event)"
            ref="search"
            placeholder="Search"
            aria-label="Find in document"
          >
          <div class="controls">
            <span class="search-result">{{`${highlightIndex + 1} / ${highlightCount}`}}</span>
            <span
              title="Case Sensitive"
              aria-label="Case sensitive"
              role="button"
              tabindex="0"
              class="is-case-sensitive"
              :class="{'active': isCaseSensitive}"
              @click.stop="toggleCtrl('isCaseSensitive')"
              @keydown.enter.prevent="toggleCtrl('isCaseSensitive')"
              @keydown.space.prevent="toggleCtrl('isCaseSensitive')"
            >
              <svg :viewBox="FindCaseIcon.viewBox" aria-hidden="true">
                <use :xlink:href="FindCaseIcon.url" />
              </svg>
            </span>
            <span
              title="Select whole word"
              aria-label="Match whole word"
              role="button"
              tabindex="0"
              class="is-whole-word"
              :class="{'active': isWholeWord}"
              @click.stop="toggleCtrl('isWholeWord')"
              @keydown.enter.prevent="toggleCtrl('isWholeWord')"
              @keydown.space.prevent="toggleCtrl('isWholeWord')"
            >
              <svg :viewBox="FindWordIcon.viewBox" aria-hidden="true">
                <use :xlink:href="FindWordIcon.url" />
              </svg>
            </span>
            <span
              title="Use query as RegEx"
              aria-label="Use regular expression"
              role="button"
              tabindex="0"
              class="is-regex"
              :class="{'active': isRegexp}"
              @click.stop="toggleCtrl('isRegexp')"
              @keydown.enter.prevent="toggleCtrl('isRegexp')"
              @keydown.space.prevent="toggleCtrl('isRegexp')"
            >
              <svg :viewBox="FindRegexIcon.viewBox" aria-hidden="true">
                <use :xlink:href="FindRegexIcon.url" />
              </svg>
            </span>
          </div>
          <div class="error-msg" v-if="searchErrorMsg">
            {{searchErrorMsg}}
          </div>
        </div>
        <div class="button-group">
          <button type="button" title="Previous match" aria-label="Previous match" class="button right" @click="find('prev')">
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-arrow-up"></use>
            </svg>
          </button>
          <button type="button" title="Next match" aria-label="Next match" class="button" @click="find('next')">
            <svg class="icon" aria-hidden="true">
              <use xlink:href="#icon-arrowdown"></use>
            </svg>
          </button>
        </div>
      </section>
      <section class="replace" v-if="type === 'replace'">
        <div class="input-wrapper replace-input">
          <input type="text" v-model="replaceValue" placeholder="Replacement" aria-label="Replacement text">
        </div>
        <div class="button-group">
          <el-tooltip class="item"
            effect="dark"
            content="Replace All"
            placement="top"
            :visible-arrow="false"
            :open-delay="1000"
          >
            <button type="button" class="button right" @click="replace(false)">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-all-inclusive"></use>
              </svg>
            </button>
          </el-tooltip>
          <el-tooltip class="item"
            effect="dark"
            content="Replace Single"
            placement="top"
            :visible-arrow="false"
            :open-delay="1000"
          >
            <button type="button" class="button" @click="replace(true)">
              <svg class="icon" aria-hidden="true">
                <use xlink:href="#icon-replace"></use>
              </svg>
            </button>
          </el-tooltip>
        </div>
      </section>
    </div>
    <button
      type="button"
      class="close-search"
      title="Close find"
      aria-label="Close find"
      @click.stop="emptySearch(true)"
    >
      <svg class="icon" aria-hidden="true">
        <use xlink:href="#icon-close-small"></use>
      </svg>
    </button>
  </div>
</template>

<script>
import bus from '../../bus'
import { mapState } from 'pinia'
import FindCaseIcon from '@/assets/icons/searchIcons/iconCase.svg'
import FindWordIcon from '@/assets/icons/searchIcons/iconWord.svg'
import FindRegexIcon from '@/assets/icons/searchIcons/iconRegex.svg'
import { useEditorStore } from '@/stores/editor'

export default {
  data () {
    this.FindCaseIcon = FindCaseIcon
    this.FindWordIcon = FindWordIcon
    this.FindRegexIcon = FindRegexIcon
    return {
      showSearch: false,
      isCaseSensitive: false,
      isWholeWord: false,
      isRegexp: false,
      type: 'search',
      searchValue: '',
      replaceValue: '',
      searchErrorMsg: ''
    }
  },

  watch: {
    searchMatches: function (newValue, oldValue) {
      if (!newValue || !oldValue) return
      const { value } = newValue
      if (value && value !== oldValue.value) {
        this.searchValue = value
      }
    }
  },

  computed: {
    ...mapState(useEditorStore, {
      searchMatches: state => state.currentFile.searchMatches
    }),
    highlightIndex () {
      if (this.searchMatches) {
        return this.searchMatches.index
      } else {
        return -1
      }
    },
    highlightCount () {
      if (this.searchMatches) {
        return this.searchMatches.matches.length
      } else {
        return 0
      }
    }
  },

  created () {
    bus.$on('find', this.listenFind)
    bus.$on('replace', this.listenReplace)
    bus.$on('findNext', this.listenFindNext)
    bus.$on('findPrev', this.listenFindPrev)
    document.addEventListener('click', this.docClick)
    document.addEventListener('keyup', this.docKeyup)
  },

  beforeUnmount () {
    bus.$off('find', this.listenFind)
    bus.$off('replace', this.listenReplace)
    bus.$off('findNext', this.listenFindNext)
    bus.$off('findPrev', this.listenFindPrev)
    document.removeEventListener('click', this.docClick)
    document.removeEventListener('keyup', this.docKeyup)
  },

  methods: {
    toggleCtrl (ctrl) {
      this[ctrl] = !this[ctrl]
      this.search()
    },

    listenFind () {
      this.showSearch = true
      this.type = 'search'
      this.$nextTick(() => {
        this.$refs.search.focus()
        if (this.searchValue) {
          this.search()
        }
      })
    },

    listenReplace () {
      this.showSearch = true
      this.type = 'replace'
    },

    listenFindNext () {
      this.find('next')
    },

    listenFindPrev () {
      this.find('prev')
    },

    docKeyup (event) {
      if (event.key === 'Escape') {
        this.emptySearch(true)
      }
    },

    docClick () {
      if (!this.showSearch) return
      this.emptySearch(true)
    },

    emptySearch (selectHighlight = false) {
      this.showSearch = false
      const searchValue = this.searchValue = ''
      this.replaceValue = ''
      bus.$emit('searchValue', searchValue, { selectHighlight })
    },

    toggleSearchType () {
      this.type = this.type === 'search' ? 'replace' : 'search'
    },

    /**
     * Find the previous or next search result.
     * action: prev or next
     */
    find (action) {
      bus.$emit('find-action', action)
    },

    search (event) {
      if (event && event.key === 'Escape') {
        return
      }

      if (event && event.key === 'Enter') {
        return this.find('next')
      }

      const { searchValue, isCaseSensitive, isWholeWord, isRegexp } = this
      if (isRegexp) {
        // Handle invalid regexp.
        try {
          // eslint-disable-next-line no-new
          new RegExp(searchValue)
          this.searchErrorMsg = ''
        } catch (err) {
          this.searchErrorMsg = `Invalid regular expression: /${searchValue}/.`
          return
        }
        // Handle match empty string, no need to search.
        try {
          const SEARCH_REG = new RegExp(searchValue)
          if (searchValue && SEARCH_REG.test('')) {
            throw new Error()
          }
          this.searchErrorMsg = ''
        } catch (err) {
          this.searchErrorMsg = `RegExp: /${searchValue}/ match empty string.`
          return
        }
      }
      bus.$emit('searchValue', searchValue, {
        isCaseSensitive,
        isWholeWord,
        isRegexp
      })
    },

    replace (isSingle = true) {
      const { replaceValue, isCaseSensitive, isWholeWord, isRegexp } = this
      bus.$emit('replaceValue', replaceValue, {
        isSingle,
        isCaseSensitive,
        isWholeWord,
        isRegexp
      })
    },

    noop () {}
  }
}
</script>

<style scoped>
  .search-bar {
    position: absolute;
    width: min(520px, calc(100vw - 32px));
    padding: 0;
    top: var(--space-2);
    right: var(--space-4);
    border: 1px solid var(--floatBorderColor);
    border-radius: var(--radius-md);
    box-shadow: var(--floatShadow);
    background: var(--floatBgColor);
    display: flex;
    flex-direction: row;
  }
  .search-bar .left-arrow {
    width: var(--icon-button-size);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .search-bar .left-arrow:hover {
    background: var(--floatHoverColor);
  }
  .search-bar .left-arrow:focus-visible {
    box-shadow: inset 0 0 0 2px var(--focusColor);
  }
  .search-bar .left-arrow svg {
    height: 12px;
    width: 12px;
  }
  .search-bar .left-arrow svg.arrow-right {
    transform: rotate(-90deg);
  }

  .search-bar .right-controls {
    flex: 1;
    min-width: 0;
  }
  .search, .replace {
    min-height: var(--control-height);
    display: flex;
    padding: 4px 4px 4px 0;
    margin: 0;
  }

  .search-bar .button {
    outline: none;
    cursor: pointer;
    box-sizing: border-box;
    height: var(--icon-button-size);
    width: var(--icon-button-size);
    min-height: var(--icon-button-size);
    text-align: center;
    padding: 5px;
    display: inline-block;
    font-weight: 500;
    color: var(--sideBarIconColor);
    &.left {
      margin-right: 10px;
    }
    &.right {
      margin-left: 10px;
    }
  }
  .button.active {
    color: var(--themeColor);
  }
  .search-bar .button > svg {
    width: 16px;
    height: 16px;
  }
  .search-bar .button:active {
    opacity: .5;
  }
  .input-wrapper {
    display: flex;
    flex: 1;
    min-width: 0;
    position: relative;
    border: 1px solid var(--inputBgColor);
    background: var(--inputBgColor);
    border-radius: var(--radius-sm);
    overflow: visible;
  }
  .input-wrapper.error {
    border: 1px solid var(--notificationErrorBg);
    border-bottom-right-radius: 0;
    border-bottom-left-radius: 0;
  }
  .input-wrapper .controls {
    position: absolute;
    top: 6px;
    right: 10px;
    font-size: 12px;
    display: flex;
    color: var(--sideBarTitleColor);
    & > span.search-result {
      height: 20px;
      margin-right: 5px;
      line-height: 17px;
    }
    & > span:not(.search-result) {
        cursor: pointer;
        width: 20px;
        height: 20px;
        margin-left: 2px;
        margin-right: 2px;
        &:hover {
          color: var(--sideBarIconColor);
        }
        & > svg {
          fill: var(--sideBarIconColor);
          &:hover {
            fill: var(--highlightThemeColor);
          }
        }
        &.active svg {
            fill: var(--highlightThemeColor);
        }
        &:focus-visible {
          border-radius: var(--radius-sm);
          box-shadow: 0 0 0 2px var(--focusColor);
        }
      }
  }
  .input-wrapper .controls > span:not(.search-result) > svg {
    display: block;
    width: 20px;
    height: 20px;
  }

  .input-wrapper .error-msg {
    position: absolute;
    top: 27px;
    width: calc(100% + 2px);
    height: 28px;
    left: -1px;
    padding: 0 8px;
    box-sizing: border-box;
    border-bottom-left-radius: 3px;
    border-bottom-right-radius: 3px;
    background: var(--notificationErrorBg);
    line-height: 28px;
    color: #ffffff;
    font-size: 14px;
    z-index: 1;
  }

  .input-wrapper input {
    flex: 1;
    min-width: 0;
    height: 32px;
    outline: none;
    border: none;
    box-sizing: border-box;
    font-size: 14px;
    color: var(--editorColor);
    padding: 0 152px 0 10px;
    background: transparent;
  }
  .button-group {
    display: flex;
    flex: 0 0 auto;
  }
  .close-search {
    width: var(--icon-button-size);
    height: var(--icon-button-size);
    flex: 0 0 var(--icon-button-size);
    align-self: center;
    margin-right: 4px;
    padding: 8px;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--sideBarIconColor);
    background: transparent;
    cursor: pointer;
  }
  .close-search:hover {
    color: var(--editorColor80);
    background: var(--floatHoverColor);
  }
  .close-search:focus-visible {
    box-shadow: inset 0 0 0 2px var(--focusColor);
  }

  @media (max-width: 680px) {
    .search-bar {
      left: var(--space-2);
      right: var(--space-2);
      width: auto;
    }
    .input-wrapper input {
      padding-right: 118px;
    }
    .input-wrapper .controls > span:not(.search-result) {
      display: none;
    }
  }
</style>
