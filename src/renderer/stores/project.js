import path from 'path'
import { defineStore } from 'pinia'
import { addFile, unlinkFile, addDirectory, unlinkDirectory } from '@/stores/helpers/treeCtrl'
import bus from '@/bus'
import { create, paste, rename } from '@/util/fileSystem'
import { PATH_SEPARATOR } from '@/config'
import notice from '@/services/notification'
import appApi from '@/services/nativeApi/app'
import events from '@/services/nativeApi/events'
import filesystem from '@/services/nativeApi/filesystem'
import projectApi from '@/services/nativeApi/project'
import shell from '@/services/nativeApi/shell'
import { hasMarkdownExtension } from 'common/filesystem/pathUtils'
import { useEditorStore } from '@/stores/editor'
import { useLayoutStore } from '@/stores/layout'

let isLoadProjectListenerBound = false
let isUpdateProjectListenerBound = false
let isSidebarContextMenuBound = false

const createProjectState = () => ({
  activeItem: {},
  createCache: {},
  renameCache: null,
  clipboard: null,
  projectTree: null
})

export const useProjectStore = defineStore('project', {
  state: createProjectState,
  actions: {
    setRootDirectory (pathname) {
      let name = path.basename(pathname)
      if (!name) {
        name = pathname
      }

      this.projectTree = {
        pathname: path.normalize(pathname),
        name,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
    },
    addFileChange (change) {
      addFile(this.projectTree, change)
    },
    unlinkFileChange (change) {
      unlinkFile(this.projectTree, change)
    },
    addDirectoryChange (change) {
      addDirectory(this.projectTree, change)
    },
    unlinkDirectoryChange (change) {
      unlinkDirectory(this.projectTree, change)
    },
    changeActiveItem (activeItem) {
      this.activeItem = activeItem
    },
    changeClipboard (data) {
      this.clipboard = data
    },
    setCreatePath (cache) {
      this.createCache = cache
    },
    setRenameCache (cache) {
      this.renameCache = cache
    },
    bindLoadProjectEvents () {
      if (isLoadProjectListenerBound) {
        return
      }

      events.on('mt::open-directory', (event, pathname) => {
        const layoutStore = useLayoutStore(this.$pinia)
        this.setRootDirectory(pathname)
        layoutStore.applyLayout({
          rightColumn: 'files',
          showSideBar: true,
          showTabBar: true
        })
        layoutStore.dispatchLayoutMenuItems()
      })

      isLoadProjectListenerBound = true
    },
    bindUpdateProjectEvents () {
      if (isUpdateProjectListenerBound) {
        return
      }

      events.on('mt::update-object-tree', (event, { type, change }) => {
        const editorStore = useEditorStore(this.$pinia)

        switch (type) {
          case 'add': {
            this.addFileChange(change)
            break
          }
          case 'unlink':
            this.unlinkFileChange(change)
            editorStore.setSaveStatusWhenRemove(change)
            break
          case 'addDir':
            this.addDirectoryChange(change)
            break
          case 'unlinkDir':
            this.unlinkDirectoryChange(change)
            break
          case 'change':
            break
          default:
            if (process.env.NODE_ENV === 'development') {
              console.log(`Unknown directory watch type: "${type}"`)
            }
            break
        }
      })

      isUpdateProjectListenerBound = true
    },
    askForOpenProject () {
      projectApi.openInSidebar()
    },
    bindSidebarContextMenu () {
      if (isSidebarContextMenuBound) {
        return
      }

      bus.$on('SIDEBAR::show-in-folder', () => {
        shell.showItemInFolder(this.activeItem.pathname)
      })

      bus.$on('SIDEBAR::new', type => {
        const { pathname, isDirectory } = this.activeItem
        const dirname = isDirectory ? pathname : path.dirname(pathname)
        this.setCreatePath({ dirname, type })
        bus.$emit('SIDEBAR::show-new-input')
      })

      bus.$on('SIDEBAR::remove', () => {
        filesystem.trashItem(this.activeItem.pathname).catch(err => {
          notice.notify({
            title: 'Error while deleting',
            type: 'error',
            message: err.message
          })
        })
      })

      bus.$on('SIDEBAR::copy-cut', type => {
        this.changeClipboard({ type, src: this.activeItem.pathname })
      })

      bus.$on('SIDEBAR::paste', () => {
        const { clipboard } = this
        const { pathname, isDirectory } = this.activeItem
        const dirname = isDirectory ? pathname : path.dirname(pathname)

        if (clipboard && clipboard.src) {
          clipboard.dest = dirname + PATH_SEPARATOR + path.basename(clipboard.src)

          if (path.normalize(clipboard.src) === path.normalize(clipboard.dest)) {
            notice.notify({
              title: 'Paste Forbidden',
              type: 'warning',
              message: 'Source and destination must not be the same.'
            })
            return
          }

          paste(clipboard)
            .then(() => {
              this.changeClipboard(null)
            })
            .catch(err => {
              notice.notify({
                title: 'Error while pasting',
                type: 'error',
                message: err.message
              })
            })
        }
      })

      bus.$on('SIDEBAR::rename', () => {
        this.setRenameCache(this.activeItem.pathname)
        bus.$emit('SIDEBAR::show-rename-input')
      })

      isSidebarContextMenuBound = true
    },
    createFileDirectory (name) {
      const { dirname, type } = this.createCache
      let finalName = name

      if (type === 'file' && !hasMarkdownExtension(finalName)) {
        finalName += '.md'
      }

      const fullName = `${dirname}/${finalName}`

      create(fullName, type)
        .then(() => {
          this.setCreatePath({})
          if (type === 'file') {
            appApi.openFilePath(fullName, {})
          }
        })
        .catch(err => {
          notice.notify({
            title: 'Error in Side Bar',
            type: 'error',
            message: err.message
          })
        })
    },
    renameInSidebar (name) {
      const src = this.renameCache
      const dirname = path.dirname(src)
      const dest = dirname + PATH_SEPARATOR + name

      rename(src, dest)
        .then(() => {
          const editorStore = useEditorStore(this.$pinia)
          editorStore.renameIfNeeded({ src, dest })
        })
    },
    openSettingWindow () {
      appApi.openSettingsWindow()
    },
    dispatch (type, payload) {
      switch (type) {
        case 'CHANGE_ACTIVE_ITEM':
          return this.changeActiveItem(payload)
        case 'ASK_FOR_OPEN_PROJECT':
          return this.askForOpenProject()
        case 'RENAME_IN_SIDEBAR':
          return this.renameInSidebar(payload)
        case 'OPEN_SETTING_WINDOW':
          return this.openSettingWindow()
        default:
          throw new Error(`Unknown project action: ${type}`)
      }
    },
    commit (type, payload) {
      switch (type) {
        case 'CREATE_PATH':
          return this.setCreatePath(payload)
        case 'SET_RENAME_CACHE':
          return this.setRenameCache(payload)
        default:
          throw new Error(`Unknown project mutation: ${type}`)
      }
    }
  }
})
