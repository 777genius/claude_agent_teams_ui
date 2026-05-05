<script setup lang="ts">
import {
  mdiBookOpenPageVariantOutline,
  mdiRobotOutline,
  mdiViewDashboardOutline,
  mdiOpenSourceInitiative,
} from '@mdi/js';

const { content } = useLandingContent();
const { t, locale } = useI18n();
const { baseURL } = useRuntimeConfig().app;
const workflowVideoSrc = 'https://github.com/user-attachments/assets/35e27989-726d-4059-8662-bae610e46b42';

const downloadStore = useDownloadStore();
const { resolve, data: releaseData } = useReleaseDownloads();
const { repoUrl, latestReleaseUrl, releaseDownloadUrl } = useGithubRepo();
const withBase = (path: string) => `${baseURL.replace(/\/?$/, '/')}${path.replace(/^\/+/, '')}`;

const releaseVersion = computed(() => releaseData.value?.version || null);
const releaseDate = computed(() => {
  const raw = releaseData.value?.pubDate;
  if (!raw) return null;
  return new Date(raw).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
});

onMounted(() => downloadStore.init());

const heroDownloadUrl = computed(() => {
  const asset = downloadStore.selectedAsset;
  if (!asset) return latestReleaseUrl.value;
  const arch = asset.os === 'macos' ? downloadStore.macArch : asset.arch;
  return resolve(asset.os, arch)?.url || releaseDownloadUrl(asset.fileName);
});

const devBranchUrl = computed(() => `${repoUrl.value}/tree/dev`);
const docsHref = computed(() => withBase(locale.value === 'ru' ? 'docs/ru/' : 'docs/'));
const devBranchNote = computed(() =>
  locale.value === 'ru'
    ? 'Самая свежая версия в ветке dev - можно развернуть локально.'
    : 'Freshest version is on the dev branch - clone and run it locally.',
);
</script>

<template>
  <section id="hero" class="hero-section section anchor-offset">
    <div class="hero-section__video-bg" aria-hidden="true">
      <video
        class="hero-section__video-bg-player"
        autoplay
        muted
        loop
        playsinline
        preload="metadata"
        :poster="`${baseURL}screenshots/1.jpg`"
      >
        <source :src="workflowVideoSrc" type="video/mp4">
      </video>
      <div class="hero-section__video-bg-wash" />
      <div class="hero-section__video-bg-edge" />
    </div>

    <v-container class="hero-section__container">
      <v-row align="center" justify="space-between">
        <!-- Left: Text content -->
        <v-col cols="12" md="7" class="hero-section__content">
          <h1 class="hero-section__title">
            <img
              :src="`${baseURL}logo-192.png`"
              alt=""
              class="hero-section__logo"
              width="56"
              height="56"
            />
            {{ content.hero.title }}
          </h1>

          <p class="hero-section__subtitle">
            {{ content.hero.subtitle }}
          </p>

          <div class="hero-section__actions">
            <v-btn
              variant="flat"
              size="large"
              :href="heroDownloadUrl"
              target="_blank"
              class="hero-section__btn-primary"
            >
              {{ t('hero.downloadNow') }}
            </v-btn>
            <v-btn
              variant="outlined"
              size="large"
              :href="docsHref"
              class="hero-section__btn-docs"
              :prepend-icon="mdiBookOpenPageVariantOutline"
            >
              {{ t('hero.ctaDocs') }}
            </v-btn>
            <v-btn
              variant="outlined"
              size="large"
              href="#comparison"
              class="hero-section__btn-secondary"
            >
              {{ t('hero.ctaSecondary') }}
            </v-btn>
          </div>

          <a
            class="hero-section__dev-note"
            :href="devBranchUrl"
            target="_blank"
            rel="noopener"
          >
            {{ devBranchNote }}
          </a>

          <!-- Release version badge -->
          <div v-if="releaseVersion" class="hero-section__release-badge">
            v{{ releaseVersion }}<template v-if="releaseDate"> · {{ releaseDate }}</template>
          </div>

          <!-- Trust indicators -->
          <div class="hero-section__trust">
            <div class="hero-section__trust-item">
              <v-icon size="16" class="hero-section__trust-icon" :icon="mdiRobotOutline" />
              <span>{{ t('hero.trust.agentTeams') }}</span>
            </div>
            <div class="hero-section__trust-divider" />
            <div class="hero-section__trust-item">
              <v-icon size="16" class="hero-section__trust-icon" :icon="mdiViewDashboardOutline" />
              <span>{{ t('hero.trust.kanban') }}</span>
            </div>
            <div class="hero-section__trust-divider" />
            <div class="hero-section__trust-item">
              <v-icon size="16" class="hero-section__trust-icon" :icon="mdiOpenSourceInitiative" />
              <span>{{ t('hero.trust.openSource') }}</span>
            </div>
          </div>
        </v-col>

        <!-- Right: Demo video -->
        <v-col cols="12" md="5" class="hero-section__demo-col">
          <div class="hero-section__preview">
            <div class="hero-section__preview-glow" />
            <ClientOnly>
              <Suspense>
                <LazyHeroDemoVideo />
                <template #fallback>
                  <div class="hero-demo-fallback" />
                </template>
              </Suspense>
              <template #fallback>
                <div class="hero-demo-fallback" />
              </template>
            </ClientOnly>
          </div>
        </v-col>
      </v-row>
    </v-container>
  </section>
</template>

<style scoped>
.hero-section {
  position: relative;
  min-height: 85vh;
  display: flex;
  align-items: center;
  isolation: isolate;
}

.hero-section__video-bg {
  position: absolute;
  inset: -120px 0 -110px;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.hero-section__video-bg-player {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(1px) saturate(1.22) contrast(1.08);
  opacity: 0.95;
  mix-blend-mode: normal;
  transform: scale(1.04);
}

.hero-section__video-bg-wash {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, rgb(var(--v-theme-background)) 0%, rgba(var(--v-theme-background), 0.82) 34%, rgba(var(--v-theme-background), 0.08) 64%, rgba(var(--v-theme-background), 0.34) 100%),
    linear-gradient(180deg, rgba(var(--v-theme-background), 0.28) 0%, rgba(var(--v-theme-background), 0.52) 58%, rgb(var(--v-theme-background)) 96%);
}

.hero-section__video-bg-edge {
  position: absolute;
  inset: auto 0 0;
  height: 42%;
  background: linear-gradient(180deg, transparent, rgb(var(--v-theme-background)));
}

.v-theme--light .hero-section__video-bg-player {
  mix-blend-mode: multiply;
}

.v-theme--light .hero-section__video-bg-wash {
  background:
    linear-gradient(90deg, rgb(var(--v-theme-background)) 0%, rgba(var(--v-theme-background), 0.86) 34%, rgba(var(--v-theme-background), 0.16) 64%, rgba(var(--v-theme-background), 0.36) 100%),
    linear-gradient(180deg, rgba(var(--v-theme-background), 0.36) 0%, rgba(var(--v-theme-background), 0.54) 58%, rgb(var(--v-theme-background)) 96%);
}

.hero-section__container {
  position: relative;
  z-index: 2;
}

.hero-section__content {
  animation: heroFadeIn 0.8s ease both;
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.55);
}

.v-theme--light .hero-section__content {
  text-shadow: 0 1px 16px rgba(255, 255, 255, 0.9);
}

/* ─── Title ─── */
.hero-section__title {
  font-size: 3rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.1;
  margin-bottom: 20px;
  background: linear-gradient(135deg, #e0e6ff 0%, #00f0ff 50%, #ff00ff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: heroFadeIn 0.8s ease both;
  animation-delay: 0.2s;
  display: flex;
  align-items: center;
  gap: 16px;
  white-space: nowrap;
}

.v-theme--light .hero-section__title {
  background: linear-gradient(135deg, #185f73 0%, #009fb0 48%, #6448d8 100%);
  -webkit-background-clip: text;
  background-clip: text;
}

.hero-section__logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  flex-shrink: 0;
  object-fit: contain;
  -webkit-text-fill-color: initial;
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
}

/* ─── Subtitle ─── */
.hero-section__subtitle {
  font-size: 1.2rem;
  line-height: 1.7;
  color: #aeb8d4;
  opacity: 0.96;
  max-width: 480px;
  margin-bottom: 36px;
  animation: heroFadeIn 0.8s ease both;
  animation-delay: 0.3s;
}

.v-theme--light .hero-section__subtitle {
  color: #34405e;
  opacity: 1;
  font-weight: 500;
}

/* ─── Actions ─── */
.hero-section__actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  animation: heroFadeIn 0.8s ease both;
  animation-delay: 0.4s;
}

.hero-section__actions :deep(.v-btn) {
  min-width: 0 !important;
  height: 44px !important;
  padding-inline: 18px !important;
  font-size: 0.92rem !important;
}

.hero-section__dev-note {
  display: inline-flex;
  max-width: 460px;
  margin-bottom: 14px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.74rem;
  line-height: 1.55;
  color: #00f0ff;
  opacity: 0.78;
  text-decoration: none;
  transition:
    color 0.2s ease,
    opacity 0.2s ease;
  animation: heroFadeIn 0.8s ease both;
  animation-delay: 0.43s;
}

.hero-section__dev-note:hover {
  color: #39ff14;
  opacity: 1;
}

.v-theme--light .hero-section__dev-note {
  color: #007c8b;
  opacity: 1;
}

.v-theme--light .hero-section__dev-note:hover {
  color: #0b6f32;
}

/* ─── Release badge ─── */
.hero-section__release-badge {
  font-size: 0.78rem;
  font-weight: 500;
  color: #8892b0;
  opacity: 0.7;
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 24px;
  animation: heroFadeIn 0.8s ease both;
  animation-delay: 0.45s;
}

.v-theme--light .hero-section__release-badge {
  color: #34405e;
  opacity: 1;
  font-weight: 700;
  text-shadow: 0 1px 12px rgba(255, 255, 255, 0.95);
}

.hero-section__btn-primary {
  background: linear-gradient(135deg, #00f0ff, #ff00ff) !important;
  color: #0a0a0f !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em !important;
  box-shadow: 0 4px 20px rgba(0, 240, 255, 0.3) !important;
  transition: all 0.3s ease !important;
}

.hero-section__btn-primary:hover {
  box-shadow: 0 6px 30px rgba(0, 240, 255, 0.5) !important;
  transform: translateY(-1px) !important;
}

.hero-section__btn-secondary {
  border-color: rgba(0, 240, 255, 0.3) !important;
  color: #00f0ff !important;
  font-weight: 600 !important;
  transition: all 0.3s ease !important;
}

.hero-section__btn-secondary:hover {
  border-color: rgba(0, 240, 255, 0.5) !important;
  background: rgba(0, 240, 255, 0.06) !important;
}

.v-theme--light .hero-section__btn-secondary {
  border-color: rgba(0, 128, 144, 0.34) !important;
  color: #007c8b !important;
  background: rgba(255, 255, 255, 0.5) !important;
}

.v-theme--light .hero-section__btn-secondary:hover {
  border-color: rgba(0, 128, 144, 0.58) !important;
  color: #005c66 !important;
  background: rgba(255, 255, 255, 0.72) !important;
}

.hero-section__btn-docs {
  border-color: rgba(57, 255, 20, 0.38) !important;
  color: #d6ffe1 !important;
  font-weight: 700 !important;
  letter-spacing: 0.02em !important;
  background: rgba(57, 255, 20, 0.05) !important;
  box-shadow: inset 0 0 0 1px rgba(57, 255, 20, 0.06) !important;
  transition: all 0.3s ease !important;
}

.hero-section__btn-docs:hover {
  border-color: rgba(57, 255, 20, 0.62) !important;
  color: #39ff14 !important;
  background: rgba(57, 255, 20, 0.09) !important;
  transform: translateY(-1px) !important;
}

.v-theme--light .hero-section__btn-docs {
  color: #0d5f2c !important;
  border-color: rgba(13, 95, 44, 0.32) !important;
  background: rgba(255, 255, 255, 0.6) !important;
}

/* ─── Trust indicators ─── */
.hero-section__trust {
  display: flex;
  align-items: center;
  gap: 16px;
  animation: heroFadeIn 0.8s ease both;
  animation-delay: 0.5s;
}

.hero-section__trust-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 500;
  color: #8892b0;
}

.hero-section__trust-icon {
  color: #00f0ff;
  opacity: 0.8;
}

.hero-section__trust-divider {
  width: 1px;
  height: 16px;
  background: rgba(0, 240, 255, 0.2);
}

.v-theme--light .hero-section__trust-item {
  color: #56617c;
}

.v-theme--light .hero-section__trust-icon {
  color: #008ea0;
  opacity: 1;
}

.v-theme--light .hero-section__trust-divider {
  background: rgba(0, 128, 144, 0.26);
}

/* ─── Preview Card ─── */
.hero-section__preview {
  position: relative;
  width: 100%;
  animation: heroSlideUp 0.9s ease both;
  animation-delay: 0.3s;
}

.hero-section__preview-glow {
  position: absolute;
  inset: -2px;
  border-radius: 22px;
  background: linear-gradient(
    135deg,
    rgba(0, 240, 255, 0.2),
    rgba(255, 0, 255, 0.2),
    rgba(57, 255, 20, 0.1)
  );
  filter: blur(20px);
  opacity: 0.4;
  z-index: 0;
  animation: glowPulse 4s ease-in-out infinite;
}

@keyframes glowPulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.02);
  }
}

/* ─── SSR Fallback ─── */
.hero-demo-fallback {
  border-radius: 16px;
  background: #0a0a0f;
  min-height: 330px;
  border: 1px solid rgba(0, 240, 255, 0.1);
}

@media (max-width: 600px) {
  .hero-demo-fallback {
    min-height: 280px;
  }
}

/* ─── Entrance animations ─── */
@keyframes heroFadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes heroSlideUp {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ─── Demo column ─── */
.hero-section__demo-col {
  display: flex;
}

@media (max-width: 959px) {
  .hero-section__demo-col {
    margin-top: 32px;
    justify-content: center;
  }
}

/* ─── Responsive ─── */
@media (max-width: 960px) {
  .hero-section {
    min-height: auto;
    padding-top: 40px;
  }

  .hero-section__video-bg {
    inset: -90px 0 -90px;
  }

  .hero-section__video-bg-player {
    opacity: 0.82;
  }

  .hero-section__video-bg-wash {
    background:
      linear-gradient(90deg, rgb(var(--v-theme-background)) 0%, rgba(var(--v-theme-background), 0.9) 50%, rgba(var(--v-theme-background), 0.54) 100%),
      linear-gradient(180deg, rgba(var(--v-theme-background), 0.42) 0%, rgba(var(--v-theme-background), 0.72) 58%, rgb(var(--v-theme-background)) 96%);
  }

  .hero-section__title {
    font-size: 2rem;
    white-space: nowrap;
  }

  .hero-section__logo {
    width: 44px;
    height: 44px;
    border-radius: 12px;
  }

  .hero-section__subtitle {
    font-size: 1.05rem;
  }

  .hero-section__trust {
    flex-wrap: wrap;
    gap: 12px;
  }

  .hero-section__preview {
    margin-top: 40px;
  }
}

@media (max-width: 600px) {
  .hero-section__content {
    flex: 0 0 calc(100vw - 48px);
    max-width: calc(100vw - 48px);
  }

  .hero-section__title {
    font-size: 1.6rem;
    white-space: nowrap;
    gap: 12px;
  }

  .hero-section__logo {
    width: 36px;
    height: 36px;
    border-radius: 10px;
  }

  .hero-section__subtitle {
    font-size: 0.95rem;
    margin-bottom: 28px;
    width: 100%;
    max-width: 330px;
    word-break: normal;
    overflow-wrap: normal;
    hyphens: none;
  }

  .hero-section__actions {
    flex-direction: column;
    align-items: stretch;
    max-width: 320px;
    margin-bottom: 12px;
  }

  .hero-section__actions :deep(.v-btn) {
    width: 100%;
  }

  .hero-section__dev-note {
    max-width: 320px;
    margin-bottom: 20px;
    font-size: 0.7rem;
  }

  .hero-section__trust {
    gap: 10px;
  }

  .hero-section__trust-divider {
    display: none;
  }

  .hero-section__trust-item {
    font-size: 0.75rem;
  }
}
</style>
