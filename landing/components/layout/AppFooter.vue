<script setup lang="ts">
const { t, locale } = useI18n();
const { repoUrl } = useGithubRepo();
const { baseURL } = useRuntimeConfig().app;
const year = new Date().getFullYear();
const docsHref = computed(() => {
  const base = baseURL.replace(/\/?$/, '/');
  return `${base}${locale.value === 'ru' ? 'docs/ru/' : 'docs/'}`;
});
</script>

<template>
  <footer class="app-footer">
    <v-container class="app-footer__inner">
      <span class="app-footer__copy"
        >{{ t('footer.copyright', { year }) }} · {{ t('footer.tagline') }}</span
      >
      <div class="app-footer__links">
        <a class="app-footer__link" href="https://github.com/777genius" target="_blank">Author</a>
        <span class="app-footer__divider" />
        <a class="app-footer__link" :href="repoUrl" target="_blank">GitHub</a>
        <span class="app-footer__divider" />
        <a class="app-footer__link" :href="docsHref">{{ t('footer.links.docs') }}</a>
      </div>
    </v-container>
  </footer>
</template>

<style scoped>
.app-footer {
  border-top: 1px solid var(--at-c-border);
  padding: 20px 0;
}

.app-footer__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-footer__copy {
  font-size: 13px;
  opacity: 0.5;
  font-family: var(--at-font-mono);
}

.app-footer__links {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-footer__link {
  color: var(--at-c-cyan);
  text-decoration: none;
  font-size: 13px;
  opacity: 0.7;
  transition: opacity 0.2s ease;
  font-family: var(--at-font-mono);
}

.app-footer__link:hover {
  opacity: 1;
}

.app-footer__divider {
  width: 1px;
  height: 14px;
  background: var(--at-c-border-strong);
}

.v-theme--light .app-footer {
  border-top-color: var(--at-c-border);
}

.v-theme--light .app-footer__copy {
  opacity: 0.72;
}

.v-theme--light .app-footer__link {
  color: #007c8b;
  opacity: 1;
}

.v-theme--light .app-footer__link:hover {
  color: #005c66;
}

.v-theme--light .app-footer__divider {
  background: rgba(0, 128, 144, 0.26);
}

@media (max-width: 600px) {
  .app-footer__inner {
    flex-direction: column;
    gap: 10px;
    text-align: center;
  }
}
</style>
