<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    command?: string;
    label?: string;
    copiedLabel?: string;
  }>(),
  {
    command: "git clone https://github.com/777genius/claude_agent_teams_ui.git",
    label: "Click to copy",
    copiedLabel: "Copied"
  }
);

const copied = ref(false);
const copyLabel = computed(() => (copied.value ? props.copiedLabel : props.label));

async function copy() {
  await navigator.clipboard.writeText(props.command);
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1800);
}
</script>

<template>
  <button class="install-block" type="button" @click="copy">
    <code>$ {{ command }}</code>
    <span>{{ copyLabel }}</span>
  </button>
</template>

<style scoped>
.install-block {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  gap: 12px;
  margin: 12px 0 4px;
  padding: 12px 16px;
  border: var(--at-glass-border);
  border-radius: var(--at-radius-lg);
  background: var(--at-c-surface-soft);
  color: var(--at-c-text);
  cursor: pointer;
  transition:
    border-color var(--at-transition-base),
    background-color var(--at-transition-base),
    transform var(--at-transition-base);
}

.install-block:hover {
  border-color: var(--at-c-border-strong);
  background: var(--at-glass-bg-hover);
  transform: translateY(-1px);
}

.install-block code {
  overflow: hidden;
  color: var(--at-c-text);
  font-family: var(--at-font-mono);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.install-block span {
  flex-shrink: 0;
  color: var(--at-c-cyan);
  font-family: var(--at-font-mono);
  font-size: 12px;
}
</style>
