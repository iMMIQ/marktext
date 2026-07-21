<template>
  <div class="pref-sidebar">
    <h3 class="title">Preferences</h3>
    <section class="search-wrapper">
      <el-autocomplete
        popper-class="pref-autocomplete"
        v-model="state"
        :fetch-suggestions="querySearch"
        placeholder="Search preferences"
        :trigger-on-focus="false"
        @select="handleSelect">
        <template #suffix>
          <svg class="el-input__icon pref-sidebar-search-icon" :viewBox="SearchIcon.viewBox" aria-hidden="true">
            <use :xlink:href="SearchIcon.url"></use>
          </svg>
        </template>
        <template #default="{ item }">
          <div class="name">{{ item.category }}</div>
          <span class="addr">{{ item.preference }}</span>
        </template>
      </el-autocomplete>
    </section>
    <section class="category">
      <div v-for="c of category" :key="c.name" class="item"
        @click="handleCategoryItemClick(c)"
        @keydown.enter.prevent="handleCategoryItemClick(c)"
        @keydown.space.prevent="handleCategoryItemClick(c)"
        :class="{active: c.label === currentCategory}"
        role="button"
        tabindex="0"
        :title="c.name"
        :aria-current="c.label === currentCategory ? 'page' : undefined"
      >
        <svg :viewBox="c.icon.viewBox">
          <use :xlink:href="c.icon.url"></use>
        </svg>
        <span class="item-label">{{c.name}}</span>
        <span class="compact-label" aria-hidden="true">{{c.shortName}}</span>
      </div>
    </section>
  </div>
</template>
<script>
import { category, searchContent } from './config'
import SearchIcon from '@/assets/icons/search.svg'

export default {
  data () {
    this.category = category
    this.SearchIcon = SearchIcon
    return {
      currentCategory: 'general',
      offIpcCategoryChange: null,
      restaurants: [],
      state: ''
    }
  },
  watch: {
    '$route' (to, from) {
      if (to.name !== from.name) {
        this.currentCategory = to.name
      }
    }
  },
  methods: {
    querySearch (queryString, cb) {
      const restaurants = this.restaurants
      const results = queryString ? restaurants.filter(this.createFilter(queryString)) : restaurants
      // call callback return this results
      cb(results)
    },
    createFilter (queryString) {
      return (restaurant) => {
        return (restaurant.preference.toLowerCase().indexOf(queryString.toLowerCase()) >= 0) ||
            (restaurant.category.toLowerCase().indexOf(queryString.toLowerCase()) >= 0)
      }
    },
    loadAll () {
      return searchContent
    },
    handleSelect (item) {
      this.$router.push({
        path: `/preference/${item.category.toLowerCase()}`
      })
    },
    handleCategoryItemClick (item) {
      const { currentCategory } = this
      if (item.name.toLowerCase() !== currentCategory) {
        this.$router.push({
          path: item.path
        })
      }
    },
    onIpcCategoryChange (event, category) {
      const validRoute = category && this.$router.getRoutes().findIndex(route => route.path.endsWith(`/${category}`)) !== -1
      if (validRoute) {
        this.$router.push({
          path: `/preference/${category}`
        })
      }
    },
    teardownIpcCategoryChange () {
      if (this.offIpcCategoryChange) {
        this.offIpcCategoryChange()
        this.offIpcCategoryChange = null
      }
    }
  },

  mounted () {
    this.restaurants = this.loadAll()
    if (this.$route && this.$route.name) {
      this.currentCategory = this.$route.name
    }
    this.offIpcCategoryChange = this.$nativeApi.events.on('settings::change-tab', this.onIpcCategoryChange)
  },
  unmounted () {
    this.teardownIpcCategoryChange()
  }
}
</script>

<style>
  .pref-sidebar {
    -webkit-app-region: drag;
    display: flex;
    flex-direction: column;
    background: var(--sideBarBgColor);
    width: var(--prefSideBarWidth);
    height: 100vh;
    padding-top: var(--space-5);
    box-sizing: border-box;
    & h3 {
      margin: 0;
      font-weight: normal;
      padding: 0 var(--space-4);
      text-align: left;
      color: var(--sideBarColor);
      font-size: 18px;
    }
  }
  .pref-sidebar .search-wrapper {
    -webkit-app-region: no-drag;
    height: var(--control-height);
    padding: 0 var(--space-4);
    margin: var(--space-4) 0 var(--space-3);
    border: 0;
    background: transparent;
    box-sizing: content-box;
  }
  .pref-sidebar .el-autocomplete,
  .pref-sidebar .el-input {
    width: 100%;
    height: var(--control-height);
  }
  .pref-sidebar .el-autocomplete {
    & .el-input__inner {
      background: transparent;
      height: var(--control-height);
      line-height: var(--control-height);
      border-radius: var(--radius-md);
    }
  }
  .pref-sidebar-search-icon {
    width: 16px;
    height: 16px;
    margin-right: 8px;
    color: var(--iconColor);
    fill: currentColor;
  }
  .pref-autocomplete.el-autocomplete-suggestion {
    background: var(--floatBgColor);
    border-color: var(--floatBorderColor);
    & .el-autocomplete-suggestion__wrap li:hover {
      background: var(--floatHoverColor);
    }
    & .popper__arrow {
      display: none;
    }
    & li {
      line-height: normal;
      padding: 7px;
      opacity: .8;

      & .name {
        text-overflow: ellipsis;
        overflow: hidden;
        color: var(--editorColor80);
      }
      & .addr {
        font-size: 12px;
        color: var(--editorColor);
      }

      & .highlighted .addr {
        color: var(--editorColor);
      }
    }
  }
  .category {
    -webkit-app-region: no-drag;
    overflow-y: auto;
    & .item {
      width: 100%;
      height: 42px;
      font-size: 14px;
      color: var(--sideBarColor);
      padding-left: var(--space-4);
      box-sizing: border-box;
      display: flex;
      flex-direction: row;
      align-items: center;
      cursor: pointer;
      position: relative;
      user-select: none;
      & > svg {
        width: 18px;
        height: 18px;
        fill: var(--iconColor);
        margin-right: var(--space-3);
      }
      & > .compact-label {
        display: none;
      }
      &:hover {
        background: var(--sideBarItemHoverBgColor);
      }
      &::before {
        content: '';
        width: 4px;
        height: 0;
        background: var(--highlightThemeColor);
        position: absolute;
        left: 0;
        border-top-right-radius: 3px;
        border-bottom-right-radius: 3px;
        transition: height .25s ease-in-out;
        top: 50%;
        transform: translateY(-50%);
      }
      &.active {
        color: var(--sideBarTitleColor);
        background: var(--sideBarItemHoverBgColor);
      }
      &.active::before {
        height: 100%;
      }
      &:focus-visible {
        box-shadow: inset 0 0 0 2px var(--focusColor);
      }
    }
  }

  @media (max-width: 720px) {
    .pref-sidebar {
      padding-top: 42px;
    }
    .pref-sidebar .title,
    .pref-sidebar .search-wrapper,
    .pref-sidebar .category .item > .item-label,
    .pref-sidebar .category .item > svg {
      display: none;
    }
    .pref-sidebar .category .item {
      width: 72px;
      height: 46px;
      padding: 0;
      justify-content: center;
    }
    .pref-sidebar .category .item > .compact-label {
      display: inline;
      margin: 0;
      color: var(--sideBarColor);
      font-size: 11px;
      font-weight: 600;
    }
  }
</style>
