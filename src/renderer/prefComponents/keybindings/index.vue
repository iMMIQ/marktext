<template>
  <div class="pref-keybindings">
    <h4>{{ $tr('Key Bindings') }}</h4>
    <section class="keybindings-toolbar">
      <el-input
        v-model="searchQuery"
        class="keybindings-search"
        clearable
        :placeholder="$tr('Search shortcuts')"
        :aria-label="$tr('Search shortcuts')"
      >
        <template #suffix>
          <svg class="keybindings-search-icon" :viewBox="SearchIcon.viewBox" aria-hidden="true">
            <use :xlink:href="SearchIcon.url"></use>
          </svg>
        </template>
      </el-input>
      <el-select
        v-model="selectedCategory"
        class="keybindings-category"
        :aria-label="$tr('Category')"
      >
        <el-option :label="$tr('All categories')" value="all"></el-option>
        <el-option
          v-for="category in categoryOptions"
          :key="category"
          :label="$tr(category)"
          :value="category"
        ></el-option>
      </el-select>
      <div class="keybindings-primary-actions">
        <el-button size="default" type="primary" :disabled="!hasChanges" @click="saveKeybindings">{{ $tr('Save') }}</el-button>
        <el-button size="default" :disabled="!keybindingConfigurator" @click="restoreDefaults">{{ $tr('Restore Defaults') }}</el-button>
      </div>
    </section>
    <section class="keybindings-table">
      <el-table
        :data="filteredKeybindings"
        :empty-text="$tr('No matching shortcuts')"
        height="100%"
        row-key="id"
        style="width: 100%"
      >
        <el-table-column prop="description" :label="$tr('Description')">
          <template #default="scope">
            {{ $tr(scope.row.description) }}
          </template>
        </el-table-column>
        <el-table-column prop="accelerator" :label="$tr('Key Combination')" width="220">
        </el-table-column>
        <el-table-column fixed="right" :label="$tr('Options')" width="160">
          <template #default="scope">
            <el-button @click="handleEditClick(scope.$index, scope.row)" type="text" size="small" :title="$tr('Edit')">
              {{ $tr('Edit') }}
            </el-button>
            <el-button :disabled="scope.row.type === 0" @click="handleResetClick(scope.$index, scope.row)" type="text" size="small" :title="$tr('Reset')">
              {{ $tr('Reset') }}
            </el-button>
            <el-button :disabled="!scope.row.accelerator" @click="handleUnbindClick(scope.$index, scope.row)" type="text" size="small" :title="$tr('Unbind')">
              {{ $tr('Clear') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
    <section v-if="showDebugTools" class="keyboard-debug">
      <el-button size="default" @click="dumpKeyboardInformation">{{ $tr('Dump keyboard information') }}</el-button>
    </section>
    <key-input-dialog
      :showWithId="selectedShortcutId"
      :onCommit="onKeybinding"
    ></key-input-dialog>
  </div>
</template>

<script>
import log from 'electron-log'
import { setKeyboardLayout } from '@hfelix/electron-localshortcut'
import KeyInputDialog from './key-input-dialog.vue'
import KeybindingConfigurator from './KeybindingConfigurator'
import SearchIcon from '@/assets/icons/search.svg'
import notice from '@/services/notification'
import { getRuntime } from '@/services/runtime'

export default {
  components: {
    KeyInputDialog
  },
  data () {
    this.SearchIcon = SearchIcon
    return {
      showDebugTools: false,
      keybindingConfigurator: null,
      selectedShortcutId: null,
      keybindingList: [],
      searchQuery: '',
      selectedCategory: 'all'
    }
  },

  computed: {
    categoryOptions () {
      return [...new Set(this.keybindingList.map(entry => this.getCategory(entry.description)))]
        .sort((a, b) => this.$tr(a).localeCompare(this.$tr(b)))
    },
    filteredKeybindings () {
      const query = this.searchQuery.trim().toLocaleLowerCase()
      return this.keybindingList.filter(entry => {
        const category = this.getCategory(entry.description)
        if (this.selectedCategory !== 'all' && category !== this.selectedCategory) return false
        if (!query) return true
        return [entry.description, this.$tr(entry.description), entry.accelerator, entry.id]
          .some(value => String(value || '').toLocaleLowerCase().includes(query))
      })
    },
    hasChanges () {
      return Boolean(this.keybindingConfigurator?.isDirty)
    }
  },

  mounted () {
    this.$nativeApi.keyboard.getInfo()
      .then(({ layout, keymap }) => {
        // Update the key mapper to prevent problems on non-US keyboards.
        setKeyboardLayout(layout, keymap)
      })
      .catch(error => log.error('Error while loading keyboard information for settings:', error))

    this.$nativeApi.app.getPreferenceKeybindings()
      .then(({ defaultKeybindings, userKeybindings }) => {
        this.keybindingConfigurator = new KeybindingConfigurator(defaultKeybindings, userKeybindings)
        this.keybindingList = this.keybindingConfigurator.getKeybindings()
      })
      .catch(error => log.error('Error while loading keyboard information for settings:', error))

    // Show keyboard debugging tools which has been moved from CLI because we
    // need an active window on Windows.
    this.showDebugTools = getRuntime().env.debug
  },

  unmounted () {
    this.keybindingList = []
    this.keybindingConfigurator = null
  },

  methods: {
    getCategory (description) {
      const separator = description.indexOf(':')
      return separator === -1 ? 'Other' : description.slice(0, separator)
    },
    openKeybindingWiki () {
      this.$nativeApi.shell.openExternal('https://github.com/marktext/marktext/blob/master/docs/KEYBINDINGS.md')
    },
    saveKeybindings () {
      if (this.keybindingConfigurator && this.keybindingList.length > 0) {
        this.keybindingConfigurator.save()
          .then(success => {
            if (!success) {
              notice.notify({
                title: this.$tr('Failed to save'),
                type: 'error',
                message: this.$tr('An unexpected error occurred while saving.')
              })
            }
          })
          .catch(error => log.error(error))
      }
    },
    restoreDefaults () {
      this.keybindingConfigurator.resetAll()
        .then(success => {
          if (!success) {
            notice.notify({
              title: this.$tr('Failed to save'),
              type: 'error',
              message: this.$tr('An unexpected error occurred while saving.')
            })
          }
        })
        .catch(error => log.error(error))
    },
    handleEditClick (index, entry) {
      if (index >= 0 && entry) {
        this.selectedShortcutId = entry.id
      }
    },
    handleResetClick (index, entry) {
      const { keybindingConfigurator } = this
      const { id } = entry
      const success = keybindingConfigurator.resetToDefault(id)
      if (!success) {
        this.handleDuplicateShortcut(id, keybindingConfigurator.getDefaultAccelerator(id))
      }
    },
    handleUnbindClick (index, entry) {
      this.keybindingConfigurator.unbind(entry.id)
    },
    onKeybinding (value) {
      const selectedId = this.selectedShortcutId
      if (value && selectedId) {
        const success = this.keybindingConfigurator.change(selectedId, value)
        if (!success) {
          this.handleDuplicateShortcut(selectedId, value)
        }
      }
      this.selectedShortcutId = null
    },
    handleDuplicateShortcut (id, accelerator) {
      notice.notify({
        title: this.$tr('Shortcut already in use'),
        type: 'warning',
        message: this.$tr('The shortcut "{shortcut}" is already in use. Please unset the shortcut and try again.')
          .replace('{shortcut}', accelerator)
      })
    },
    dumpKeyboardInformation () {
      this.$nativeApi.keyboard.dumpInfo()
    }
  }
}
</script>

<style scoped>
.pref-keybindings {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  & > h4 {
    flex: 0 0 auto;
  }
  & .keyboard-debug,
  & .keybindings-table {
    font-size: 14px;
    color: var(--editorColor);
  }
  & .keybindings-toolbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  & .keybindings-search {
    min-width: 180px;
    flex: 1 1 280px;
  }
  & .keybindings-search-icon {
    width: 16px;
    height: 16px;
    color: var(--iconColor);
    fill: currentColor;
  }
  & .keybindings-category {
    width: 170px;
    flex: 0 0 170px;
  }
  & .keybindings-primary-actions {
    display: flex;
    flex: 0 0 auto;
    gap: var(--space-2);
    & .el-button + .el-button {
      margin-left: 0;
    }
  }
  & .keybindings-table {
    min-height: 180px;
    flex: 1 1 auto;
    overflow: hidden;
  }
  & button.el-button {
    font-size: 13px;
  }
}
.el-table, .el-table__expanded-cell {
  background: var(--editorBgColor);
}
.el-table button {
  padding: 2px 2px;
  margin: 4px 0px;
  color: var(--themeColor);
  background: none;
  border: none;
}
.el-table button:not(:last-child) {
  margin-right: 4px;
}
.el-table button:hover,
.el-table button:active {
  opacity: 0.9;
  background: none;
}

@media (max-width: 720px) {
  .pref-keybindings {
    & .keybindings-toolbar {
      flex-wrap: wrap;
    }
    & .keybindings-search {
      flex-basis: calc(100% - 178px);
    }
    & .keybindings-primary-actions {
      width: 100%;
    }
  }
}
</style>
<style>
.pref-keybindings .el-table table {
  margin: 0;
  border: none;
}
.pref-keybindings .el-table th,
.pref-keybindings .el-table tr {
  background: var(--editorBgColor);
}
.pref-keybindings .el-table th.el-table__cell.is-leaf,
.pref-keybindings .el-table th,
.pref-keybindings .el-table td {
  border: none;
}
.pref-keybindings .el-table th.el-table__cell.is-leaf:last-child,
.pref-keybindings .el-table th:last-child,
.pref-keybindings .el-table td:last-child {
  border-right: 1px solid var(--tableBorderColor);
}
.pref-keybindings .el-table--border::after,
.pref-keybindings .el-table--group::after,
.pref-keybindings .el-table::before,
.pref-keybindings .el-table__fixed-right::before,
.pref-keybindings .el-table__fixed::before {
  background: var(--tableBorderColor);
}
.pref-keybindings .el-table__body tr.hover-row.current-row>td,
.pref-keybindings .el-table__body tr.hover-row.el-table__row--striped.current-row>td,
.pref-keybindings .el-table__body tr.hover-row.el-table__row--striped>td,
.pref-keybindings .el-table__body tr.hover-row>td {
  background: var(--selectionColor);
}
.pref-keybindings .el-table .el-table__cell {
  padding: 2px 0;
  margin: 0;
}
</style>
