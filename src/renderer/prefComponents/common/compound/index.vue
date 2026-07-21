<template>
  <section class="pref-compound-item">
    <div class="pref-compound-head">
      <slot name="head"/>
    </div>
    <div class="pref-compound-body">
      <slot name="children"/>
    </div>
    <div v-if="notes" class="notes">
      {{notes}}
    </div>
  </section>
</template>

<script>

export default {
  props: {
    notes: String
  }
}
</script>

<style>
  .pref-compound-item {
    font-size: 14px;
    user-select: none;
    margin: 0 0 var(--space-6);
    color: var(--editorColor);

    & .pref-compound-head h6.title {
      margin: 0;
      padding-bottom: var(--space-2);
      color: var(--editorColor80);
      font-weight: 600;
      font-size: 15px;
    }

    & .pref-compound-body {
      padding: var(--space-1) 0 var(--space-2);
      border-top: 1px solid var(--editorColor10);
      background: transparent;
    }

    & .description {
      margin-bottom: 10px;
      & i {
        cursor: pointer;
        opacity: .7;
        color: var(--iconColor);
      }
      & i:hover {
        color: var(--themeColor);
      }
    }

    & .notes {
      margin-top: 10px;
      font-style: italic;
      font-size: 12px;
    }
  }
</style>
