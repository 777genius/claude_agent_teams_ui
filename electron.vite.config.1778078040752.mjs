// electron.vite.config.ts
import { defineConfig } from "electron-vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import react from "@vitejs/plugin-react";
import { readFileSync } from "fs";
import { resolve } from "path";
var __electron_vite_injected_dirname = "/Users/belief/dev/projects/claude/claude_team";
var pkg = JSON.parse(readFileSync(resolve(__electron_vite_injected_dirname, "package.json"), "utf-8"));
var prodDeps = Object.keys(pkg.dependencies || {});
var runtimeExternalDeps = /* @__PURE__ */ new Set([
  "node-pty",
  "agent-teams-controller",
  "fastify",
  "@fastify/cors",
  "@fastify/static"
]);
var bundledDeps = prodDeps.filter((d) => !runtimeExternalDeps.has(d));
function nativeModuleStub() {
  const STUB_ID = "\0native-stub";
  const NODE_MODULE_RE = /\.node(?:\?.*)?$/;
  return {
    name: "native-module-stub",
    enforce: "pre",
    resolveId(source) {
      if (NODE_MODULE_RE.test(source)) return `${STUB_ID}:${source}`;
      return null;
    },
    load(id) {
      if (id.startsWith(STUB_ID) || NODE_MODULE_RE.test(id)) return "export default {}";
      return null;
    }
  };
}
var sentryPlugins = process.env.SENTRY_AUTH_TOKEN ? [
  sentryVitePlugin({
    org: process.env.SENTRY_ORG ?? "quant-jump-pro",
    project: process.env.SENTRY_PROJECT ?? "electron",
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: { name: `agent-teams-ai@${pkg.version}` },
    sourcemaps: {
      filesToDeleteAfterUpload: ["./out/renderer/**/*.map", "./dist-electron/**/*.map"]
    }
  })
] : [];
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [
      nativeModuleStub(),
      ...sentryPlugins
    ],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      // Inject DSN at compile time — process.env.SENTRY_DSN is NOT available
      // at runtime in packaged Electron apps (only during CI build).
      "process.env.SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN ?? "")
    },
    resolve: {
      alias: {
        "@features": resolve(__electron_vite_injected_dirname, "src/features"),
        "@main": resolve(__electron_vite_injected_dirname, "src/main"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared"),
        "@preload": resolve(__electron_vite_injected_dirname, "src/preload")
      }
    },
    build: {
      externalizeDeps: {
        exclude: bundledDeps
      },
      commonjsOptions: {
        strictRequires: [/node_modules\/.*ssh2\//]
      },
      sourcemap: "hidden",
      outDir: "dist-electron/main",
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/main/index.ts"),
          "team-fs-worker": resolve(__electron_vite_injected_dirname, "src/main/workers/team-fs-worker.ts"),
          "task-change-worker": resolve(__electron_vite_injected_dirname, "src/main/workers/task-change-worker.ts"),
          "team-data-worker": resolve(__electron_vite_injected_dirname, "src/main/workers/team-data-worker.ts")
        },
        output: {
          // CJS format so bundled deps can use __dirname/require.
          // Use .cjs extension since package.json has "type": "module".
          format: "cjs",
          entryFileNames: "[name].cjs",
          // Set UV_THREADPOOL_SIZE before any module code runs.
          // Must be in the banner because ESM→CJS hoists imports above top-level code.
          // On Windows, fs.watch({recursive:true}) occupies a UV pool thread per watcher;
          // with 3+ watchers + concurrent fs/DNS/spawn, the default 4 threads deadlock.
          banner: `if(!process.env.UV_THREADPOOL_SIZE){process.env.UV_THREADPOOL_SIZE='24'}`
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        "@features": resolve(__electron_vite_injected_dirname, "src/features"),
        "@preload": resolve(__electron_vite_injected_dirname, "src/preload"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared"),
        "@main": resolve(__electron_vite_injected_dirname, "src/main")
      }
    },
    build: {
      outDir: "dist-electron/preload",
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts")
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].js"
        }
      }
    }
  },
  renderer: {
    optimizeDeps: {
      include: ["@codemirror/language-data"],
      exclude: ["@claude-teams/agent-graph"]
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      // Pass SENTRY_DSN to renderer as VITE_SENTRY_DSN (Vite replaces at compile time)
      "import.meta.env.VITE_SENTRY_DSN": JSON.stringify(process.env.SENTRY_DSN ?? "")
    },
    resolve: {
      alias: {
        "@features": resolve(__electron_vite_injected_dirname, "src/features"),
        "@renderer": resolve(__electron_vite_injected_dirname, "src/renderer"),
        "@shared": resolve(__electron_vite_injected_dirname, "src/shared"),
        "@main": resolve(__electron_vite_injected_dirname, "src/main"),
        "@claude-teams/agent-graph": resolve(__electron_vite_injected_dirname, "packages/agent-graph/src/index.ts")
      }
    },
    plugins: [react(), ...sentryPlugins],
    build: {
      sourcemap: "hidden",
      rollupOptions: {
        input: {
          index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html")
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
