<script setup lang="ts">
import { withBase } from "vitepress";

const workflowVideoSrc = "https://github.com/user-attachments/assets/35e27989-726d-4059-8662-bae610e46b42";
</script>

<template>
  <div class="docs-hero-visual">
    <video
      class="docs-hero-visual__video no-zoom"
      autoplay
      muted
      loop
      playsinline
      preload="metadata"
      :poster="withBase('/screenshots/1.jpg')"
    >
      <source :src="workflowVideoSrc" type="video/mp4">
    </video>
    <div class="docs-hero-visual__wash" />
    <div class="docs-hero-visual__edge" />
  </div>
</template>

<style scoped>
.docs-hero-visual {
  position: absolute;
  inset: -130px -120px -110px;
  overflow: hidden;
  pointer-events: none;
}

.docs-hero-visual__video {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: blur(1px) saturate(1.22) contrast(1.08);
  opacity: 0.95;
  mix-blend-mode: multiply;
  transform: scale(1.04);
}

.docs-hero-visual__wash {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(90deg, var(--vp-c-bg) 0%, color-mix(in srgb, var(--vp-c-bg) 82%, transparent) 34%, color-mix(in srgb, var(--vp-c-bg) 8%, transparent) 64%, color-mix(in srgb, var(--vp-c-bg) 26%, transparent) 100%),
    linear-gradient(180deg, color-mix(in srgb, var(--vp-c-bg) 32%, transparent) 0%, color-mix(in srgb, var(--vp-c-bg) 44%, transparent) 58%, var(--vp-c-bg) 96%);
}

.docs-hero-visual__edge {
  position: absolute;
  inset: auto 0 0;
  height: 42%;
  background: linear-gradient(180deg, transparent, var(--vp-c-bg));
}

.dark .docs-hero-visual__video {
  opacity: 0.95;
  filter: blur(1px) saturate(1.24) contrast(1.08);
  mix-blend-mode: normal;
}

.dark .docs-hero-visual__wash {
  background:
    linear-gradient(90deg, var(--vp-c-bg) 0%, color-mix(in srgb, var(--vp-c-bg) 76%, transparent) 34%, color-mix(in srgb, var(--vp-c-bg) 8%, transparent) 64%, color-mix(in srgb, var(--vp-c-bg) 34%, transparent) 100%),
    linear-gradient(180deg, color-mix(in srgb, var(--vp-c-bg) 28%, transparent) 0%, color-mix(in srgb, var(--vp-c-bg) 52%, transparent) 58%, var(--vp-c-bg) 96%);
}

@media (max-width: 768px) {
  .docs-hero-visual {
    inset: -90px -72px -80px;
  }

  .docs-hero-visual__video {
    opacity: 0.95;
    filter: blur(1px) saturate(1.2) contrast(1.06);
  }
}
</style>
