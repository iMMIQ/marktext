<template>
    <div class="search-result-item">
      <div
        class="search-result"
        :title="searchResult.filePath"
      >
        <svg
          class="icon icon-arrow"
          :class="{'fold': !showSearchMatches}"
          aria-hidden="true"
          @click.stop="toggleSearchMatches()"
        >
          <use xlink:href="#icon-arrow"></use>
        </svg>
        <div
          class="file-info"
          @click.stop="toggleSearchMatches()"
        >
          <div class="title">
            <span class="filename">
              <span class="name">{{ filename }}</span><span class="extension">{{extension}}</span>
            </span>
            <span class="match-count">{{ matchCount }}</span>
          </div>
          <div class="folder-path">
            <span>{{ parentFolder }}</span>
          </div>
        </div>
      </div>
      <div
        class="matches"
        v-if="showSearchMatches"
      >
        <ul>
          <li
            class="match-row"
            v-for="(searchMatch, index) of getMatches"
            :key="index"
            :searchMatch="searchMatch"
            :title="searchMatch.lineText"
            @click="handleSearchResultClick(searchMatch)"
          >
            <span class="line-number">{{ searchMatch.range[0][0] + 1 }}</span>
            <span class="match-text">
              <span>{{ ellipsisText(searchMatch.lineText.substring(0, searchMatch.range[0][1])) }}</span>
              <span class="highlight">{{ searchMatch.lineText.substring(searchMatch.range[0][1], searchMatch.range[1][1]) }}</span>
              <span>{{ searchMatch.lineText.substring(searchMatch.range[1][1]) }}</span>
            </span>
          </li>
        </ul>
        <div v-if="!allMatchesShown">
          <div
            class="button tiny"
            @click="handleShowMoreMatches"
          >
            {{ $tr('Show more matches') }}
          </div>
        </div>
      </div>
    </div>
</template>

<script>
import path from 'path'
import { mapState } from 'pinia'
import { fileMixins } from '../../mixins'
import { useEditorStore } from '@/stores/editor'

export default {
  mixins: [fileMixins],
  data () {
    return {
      showSearchMatches: this.searchResult.matches.length <= 20,
      allMatchesShown: this.searchResult.matches.length <= 10,
      shownMatches: 10
    }
  },
  props: {
    searchResult: {
      type: Object,
      required: true
    }
  },
  computed: {
    ...mapState(useEditorStore, ['tabs', 'currentFile']),

    getMatches () {
      if (this.searchResult.matches.length === 0 || this.allMatchesShown) {
        return this.searchResult.matches
      }
      return this.searchResult.matches.slice(0, this.shownMatches)
    },

    // Return filename without extension.
    filename () {
      return path.basename(this.searchResult.filePath, path.extname(this.searchResult.filePath))
    },

    matchCount () {
      return this.searchResult.matches.length
    },

    // Return the filename extension or null.
    extension () {
      return path.extname(this.searchResult.filePath)
    },

    parentFolder () {
      return path.basename(path.dirname(this.searchResult.filePath))
    }
  },
  methods: {
    toggleSearchMatches () {
      this.showSearchMatches = !this.showSearchMatches
    },

    handleShowMoreMatches (event) {
      this.shownMatches += 15
      if (event.ctrlKey || event.metaKey ||
          this.shownMatches >= this.searchResult.matches.length) {
        this.allMatchesShown = true
      }
    },

    ellipsisText (text) {
      const len = text.length
      const MAX_PRETEXT_LEN = 6
      return len > MAX_PRETEXT_LEN ? `...${text.substring(len - MAX_PRETEXT_LEN)}` : text
    }
  }
}
</script>

<style scoped>
  .search-result-item {
    position: relative;
    user-select: none;
    padding: 0 var(--space-2) var(--space-3);
    color: var(--sideBarColor);
    font-size: 14px;
    & > .search-result {
      display: flex;
      align-items: center;
      & > svg:first-child {
        margin-right: 3px;
      }
      & > .file-info {
        flex: 1;
        overflow: hidden;
        padding: var(--space-1) var(--space-1);
      }
    }
    & .title .filename {
      font-size: 14px;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
      padding-right: 8px;
    }
    & .matches {
      & ul {
        padding-left: 0;
        list-style-type: none;
        & li {
          display: flex;
          align-items: baseline;
          min-width: 0;
          padding: 5px var(--space-2);
          cursor: pointer;
          & .highlight {
            background: var(--highlightColor);
            line-height: 16px;
            height: 16px;
            display: inline-block;
            color: var(--sideBarTextColor);
            border-radius: 1px;
          }
          &:hover {
            background: var(--sideBarItemHoverBgColor);
          }
          & .line-number {
            width: 24px;
            flex: 0 0 24px;
            color: var(--sideBarTextColor);
            font-size: 11px;
            font-variant-numeric: tabular-nums;
          }
          & .match-text {
            display: flex;
            align-items: baseline;
            flex: 1 1 auto;
            min-width: 0;
            overflow: hidden;
            color: var(--sideBarColor);
            white-space: nowrap;
            font-size: 13px;
          }
          & .match-text > span {
            flex: 0 0 auto;
            white-space: pre;
          }
        }
      }
      & .button {
        width: 130px;
        margin: 0 auto;
        text-align: center;
      }
    }
  }
  .search-result-item.active {
    font-weight: 600;
    .title {
      color: var(--themeColor);
    }
  }
  .search-result-item.active::before {
    height: 100%;
  }
  .title {
    display: flex;
    color: var(--sideBarTextColor);
    & .filename {
      flex: 1;
      & .name {
        font-weight: 600;
      }
      & .extension {
        color: var(--sideBarTextColor);
        font-size: 12px;
      }
    }
    & .match-count {
      display: inline-block;
      font-size: 12px;
      line-height: 18px;
      text-align: center;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      flex-shrink: 0;
      background: var(--itemBgColor);
      color: var(--sideBarTextColor);
    }
  }

  .folder-path {
    font-size: 12px;
    color: var(--sideBarTextColor);
  }

  .folder-path > span,
  .matches {
    width: 100%;
    margin-top: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--sideBarTextColor);
  }

  .icon-arrow {
    transition: all .25s ease-out;
    transform: rotate(90deg);
    fill: var(--sideBarTextColor);
  }
  .icon-arrow.fold {
    transform: rotate(0);
  }
</style>
