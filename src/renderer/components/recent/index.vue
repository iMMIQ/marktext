<template>
    <div
      class="recent-files-projects"
    >
      <div class="centered-group">
        <svg :viewBox="ContentIcon.viewBox" aria-hidden="true">
          <use :xlink:href="ContentIcon.url" />
        </svg>
        <button class="button-primary" @click="newFile">
          {{ $tr('New File') }}
        </button>
      </div>
    </div>
</template>

<script>
import { mapActions } from 'pinia'
import ContentIcon from '@/assets/icons/undraw_content.svg'
import { useEditorStore } from '@/stores/editor'

export default {
  data () {
    this.ContentIcon = ContentIcon
    return {}
  },
  methods: {
    ...mapActions(useEditorStore, {
      dispatchEditor: 'dispatch'
    }),
    newFile () {
      this.dispatchEditor('NEW_UNTITLED_TAB', {})
    }
  }
}
</script>

<style scoped>
  .recent-files-projects {
    background: var(--editorBgColor);
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-around;
    & .centered-group {
      display: flex;
      flex-direction: column;
      align-items: center;
      & svg {
        width: 200px;
        fill: var(--themeColor);
      }
      & button.button-primary {
        display: block;
        margin-top: 20px;
      }
    }
  }
</style>
