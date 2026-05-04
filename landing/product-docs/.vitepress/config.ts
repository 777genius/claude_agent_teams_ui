import {
  transformerNotationDiff,
  transformerNotationErrorLevel,
  transformerNotationFocus,
  transformerNotationHighlight
} from "@shikijs/transformers";
import { fileURLToPath } from "node:url";
import { defineConfig, type DefaultTheme } from "vitepress";
import llmstxt, { copyOrDownloadAsMarkdownButtons } from "vitepress-plugin-llms";

const REPO = "777genius/claude_agent_teams_ui";
const SITE_TITLE = "Agent Teams Docs";
const SITE_DESCRIPTION = "Documentation for Agent Teams, a local desktop app for AI agent orchestration.";

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const normalizeBase = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}/`;
};
const withTrailingSlash = (value: string) => `${trimTrailingSlash(value)}/`;

const appBase = normalizeBase(process.env.NUXT_APP_BASE_URL || "/");
const base = appBase === "/" ? "/docs/" : `${appBase}docs/`;
const siteUrl = trimTrailingSlash(
  process.env.NUXT_PUBLIC_SITE_URL || "https://777genius.github.io/claude_agent_teams_ui"
);
const publicBaseUrl =
  appBase === "/" || siteUrl.endsWith(trimTrailingSlash(appBase))
    ? withTrailingSlash(siteUrl)
    : `${withTrailingSlash(siteUrl)}${appBase.replace(/^\/+/, "")}`;
const docsUrl = `${publicBaseUrl}docs/`;
const downloadUrl = `${publicBaseUrl}download/`;
const ruDownloadUrl = `${publicBaseUrl}ru/download/`;
const landingPublicDir = fileURLToPath(new URL("../../public", import.meta.url));

const rootGuide: DefaultTheme.SidebarItem[] = [
  {
    text: "Start",
    items: [
      { text: "Quickstart", link: "/guide/quickstart" },
      { text: "Installation", link: "/guide/installation" },
      { text: "Create a team", link: "/guide/create-team" }
    ]
  },
  {
    text: "Workflows",
    items: [
      { text: "Runtime setup", link: "/guide/runtime-setup" },
      { text: "Agent workflow", link: "/guide/agent-workflow" },
      { text: "Code review", link: "/guide/code-review" },
      { text: "Troubleshooting", link: "/guide/troubleshooting" }
    ]
  },
  {
    text: "Reference",
    items: [
      { text: "Concepts", link: "/reference/concepts" },
      { text: "Providers and runtimes", link: "/reference/providers-runtimes" },
      { text: "Privacy and local data", link: "/reference/privacy-local-data" },
      { text: "FAQ", link: "/reference/faq" }
    ]
  }
];

const ruGuide: DefaultTheme.SidebarItem[] = [
  {
    text: "Старт",
    items: [
      { text: "Быстрый старт", link: "/ru/guide/quickstart" },
      { text: "Установка", link: "/ru/guide/installation" },
      { text: "Создание команды", link: "/ru/guide/create-team" }
    ]
  },
  {
    text: "Рабочие процессы",
    items: [
      { text: "Настройка рантайма", link: "/ru/guide/runtime-setup" },
      { text: "Работа агентов", link: "/ru/guide/agent-workflow" },
      { text: "Код-ревью", link: "/ru/guide/code-review" },
      { text: "Диагностика", link: "/ru/guide/troubleshooting" }
    ]
  },
  {
    text: "Справочник",
    items: [
      { text: "Концепции", link: "/ru/reference/concepts" },
      { text: "Провайдеры и рантаймы", link: "/ru/reference/providers-runtimes" },
      { text: "Приватность и локальные данные", link: "/ru/reference/privacy-local-data" },
      { text: "FAQ", link: "/ru/reference/faq" }
    ]
  }
];

const rootNav: DefaultTheme.NavItem[] = [
  { text: "Guide", link: "/guide/quickstart" },
  { text: "Reference", link: "/reference/concepts" },
  { text: "Troubleshooting", link: "/guide/troubleshooting" },
  { text: "Download", link: downloadUrl, target: "_self" }
];

const ruNav: DefaultTheme.NavItem[] = [
  { text: "Руководство", link: "/ru/guide/quickstart" },
  { text: "Справочник", link: "/ru/reference/concepts" },
  { text: "Диагностика", link: "/ru/guide/troubleshooting" },
  { text: "Скачать", link: ruDownloadUrl, target: "_self" }
];

export default defineConfig({
  lang: "en-US",
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  base,
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: docsUrl
  },
  head: [
    ["link", { rel: "icon", type: "image/png", href: `${base}logo-192.png` }],
    ["meta", { name: "theme-color", content: "#00f0ff" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: SITE_TITLE }],
    ["meta", { property: "og:description", content: SITE_DESCRIPTION }],
    ["meta", { property: "og:url", content: docsUrl }],
    ["meta", { property: "og:image", content: `${publicBaseUrl}og-image.png` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }]
  ],
  vite: {
    publicDir: landingPublicDir,
    plugins: [llmstxt()],
    optimizeDeps: {
      include: ["medium-zoom", "vitepress-codeblock-collapse"]
    }
  },
  markdown: {
    codeTransformers: [
      transformerNotationDiff(),
      transformerNotationFocus(),
      transformerNotationHighlight(),
      transformerNotationErrorLevel()
    ],
    config(md) {
      md.use(copyOrDownloadAsMarkdownButtons);
    }
  },
  themeConfig: {
    logo: "/logo-192.png",
    siteTitle: "Agent Teams",
    outline: {
      level: [2, 3],
      label: "On this page"
    },
    search: {
      provider: "local"
    },
    nav: rootNav,
    sidebar: {
      "/ru/": ruGuide,
      "/": rootGuide
    },
    socialLinks: [{ icon: "github", link: `https://github.com/${REPO}` }],
    editLink: {
      pattern: `https://github.com/${REPO}/edit/main/landing/product-docs/:path`,
      text: "Edit this page on GitHub"
    },
    footer: {
      message: "Free and open source.",
      copyright: "Copyright © 777genius"
    }
  },
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      themeConfig: {
        nav: rootNav,
        sidebar: rootGuide,
        docFooter: {
          prev: "Previous",
          next: "Next"
        }
      }
    },
    ru: {
      label: "Русский",
      lang: "ru-RU",
      title: "Документация Agent Teams",
      description: "Документация Agent Teams, локального desktop-приложения для оркестрации AI-агентов.",
      themeConfig: {
        nav: ruNav,
        sidebar: ruGuide,
        outline: {
          level: [2, 3],
          label: "На этой странице"
        },
        editLink: {
          pattern: `https://github.com/${REPO}/edit/main/landing/product-docs/:path`,
          text: "Редактировать на GitHub"
        },
        docFooter: {
          prev: "Назад",
          next: "Дальше"
        },
        footer: {
          message: "Бесплатно и с открытым кодом.",
          copyright: "Copyright © 777genius"
        }
      }
    }
  }
});
