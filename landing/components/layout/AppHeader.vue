<script setup lang="ts">
import { mdiMenu, mdiClose, mdiGithub } from '@mdi/js';

const { t, locale } = useI18n();
const { repoUrl } = useGithubRepo();
const { baseURL } = useRuntimeConfig().app;
const menuOpen = ref(false);

const withBase = (path: string) => `${baseURL.replace(/\/?$/, '/')}${path.replace(/^\/+/, '')}`;
const docsHref = computed(() => withBase(locale.value === 'ru' ? 'docs/ru/' : 'docs/'));

const navItems = computed(() => [
  { href: '#screenshots', label: t('nav.screenshots') },
  { href: docsHref.value, label: t('nav.docs') },
  { href: '#download', label: t('nav.download') },
  { href: '#comparison', label: t('nav.comparison') },
  { href: '#pricing', label: t('nav.pricing') },
  { href: '#faq', label: t('nav.faq') },
]);
</script>

<template>
  <header class="app-header">
    <v-container class="app-header__inner">
      <AppLogo />
      <nav class="app-header__nav">
        <v-btn v-for="item in navItems" :key="item.href" variant="text" :href="item.href">
          {{ item.label }}
        </v-btn>
      </nav>
      <div class="app-header__spacer" />
      <div class="app-header__desktop-actions">
        <LanguageSwitcher icon-only />
        <v-btn
          variant="outlined"
          size="small"
          :href="repoUrl"
          target="_blank"
          class="app-header__github-btn"
          :prepend-icon="mdiGithub"
        >
          GitHub
        </v-btn>
        <ThemeToggle />
      </div>
      <div class="app-header__mobile-actions">
        <v-btn :icon="mdiMenu" variant="text" @click="menuOpen = true" />
        <Teleport to="body">
          <Transition name="mobile-menu-fade">
            <div v-if="menuOpen" class="mobile-menu-overlay" @click.self="menuOpen = false">
              <div class="mobile-menu">
                <div class="mobile-menu__header">
                  <AppLogo />
                  <div style="flex: 1" />
                  <v-btn :icon="mdiClose" variant="text" @click="menuOpen = false" />
                </div>
                <hr class="mobile-menu__divider">
                <nav class="mobile-menu__list">
                  <a
                    v-for="item in navItems"
                    :key="item.href"
                    :href="item.href"
                    class="mobile-menu__link"
                    @click="menuOpen = false"
                  >
                    {{ item.label }}
                  </a>
                  <a
                    :href="repoUrl"
                    target="_blank"
                    class="mobile-menu__link"
                    @click="menuOpen = false"
                  >
                    GitHub
                  </a>
                </nav>
                <hr class="mobile-menu__divider">
                <div class="mobile-menu__actions">
                  <LanguageSwitcher compact />
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>
      </div>
    </v-container>
  </header>
</template>

<style scoped>
.app-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: var(--at-z-header);
  height: 64px;
  display: flex;
  align-items: center;
  backdrop-filter: blur(var(--at-blur-md));
  -webkit-backdrop-filter: blur(var(--at-blur-md));
  border-bottom: 1px solid var(--at-c-border);
}

.v-theme--light .app-header {
  background: rgba(255, 255, 255, 0.9);
  border-bottom-color: var(--at-c-border);
}

.v-theme--dark .app-header {
  background: rgba(10, 10, 15, 0.9);
}

.app-header__inner {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
}

.app-header__nav {
  display: flex;
  align-self: stretch;
  align-items: stretch;
  margin-left: 48px;
}

.app-header__nav :deep(.v-btn) {
  height: 100% !important;
  border-radius: 0;
}

.app-header__spacer {
  flex: 1;
}

.app-header__desktop-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.app-header__github-btn {
  border-color: var(--at-c-border-strong) !important;
  color: var(--at-c-cyan) !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  letter-spacing: 0.02em !important;
}

.app-header__github-btn:hover {
  border-color: var(--at-c-focus) !important;
  background: rgba(0, 240, 255, 0.06) !important;
}

.app-header__mobile-actions {
  display: none;
}

@media (max-width: 959px) {
  .app-header__nav {
    display: none;
  }

  .app-header__desktop-actions {
    display: none;
  }

  .app-header__mobile-actions {
    display: flex;
  }
}

.mobile-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgb(var(--v-theme-surface));
}

.mobile-menu {
  padding: 16px 16px 24px;
  height: 100%;
  overflow-y: auto;
}

.mobile-menu__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
}

.mobile-menu__divider {
  border: none;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mobile-menu__list {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
}

.mobile-menu__link {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  font-size: 1rem;
  color: rgb(var(--v-theme-on-surface));
  text-decoration: none;
  border-radius: 8px;
  transition: background-color 0.15s;
}

.mobile-menu__link:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.mobile-menu__actions {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding-top: 16px;
}

.mobile-menu-fade-enter-active,
.mobile-menu-fade-leave-active {
  transition: opacity 0.2s ease;
}

.mobile-menu-fade-enter-from,
.mobile-menu-fade-leave-to {
  opacity: 0;
}
</style>
