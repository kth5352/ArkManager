import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Content-Security-Policy for the packaged renderer. The renderer never needs
// the network (all remote data is fetched by the main process), so every
// fetch/script/frame source is closed except the app's own files and its two
// custom image protocols. Injected only for production builds because the
// Vite dev server needs inline scripts / eval / websockets for HMR.
const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: thumb: mediathumb:",
  "font-src 'self' data:",
  "media-src 'none'",
  "connect-src 'self' thumb: mediathumb:",
  "worker-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'ark-content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${PRODUCTION_CSP}" />`
      )
    },
  }
}

export default defineConfig({
  main: {
    build: {
      lib: {
        // Two entries, not one: mpvWorker.ts is never imported by the main
        // process - mpvProcessManager forks it by path
        // (`join(__dirname, 'mpvWorker.js')`, i.e. out/main/mpvWorker.js), so
        // nothing pulls it into index.js's module graph and a single-entry
        // build silently emits no worker at all. utilityProcess.fork() on a
        // missing script fails at runtime, not build time, so this has to be
        // an explicit second entry. mpvPreviewWorker.ts (the scene-preview
        // mpv, forked by mpvPreviewManager) is a third entry for the same reason.
        entry: [
          'electron/main/index.ts',
          'electron/main/media/mpvWorker.ts',
          'electron/main/media/mpvPreviewWorker.ts',
        ],
      },
    },
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    build: {
      lib: {
        entry: 'electron/preload/index.ts',
      },
    },
    // A sandboxed preload script (BrowserWindow's default - see
    // electron/main/index.ts) can't require() an arbitrary node_modules
    // package the way a normal Node process can. The preload only imports
    // types from shared/types/ipc.ts, but that file also defines zod
    // schemas at module scope, so evaluating it at all pulls in zod as a
    // real runtime dependency - externalizeDepsPlugin's default (leave every
    // node_modules package as an external require()) breaks under the
    // sandbox with "module not found: zod". Excluding it here bundles zod's
    // actual code into the preload output instead.
    plugins: [externalizeDepsPlugin({ exclude: ['zod'] })],
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: 'index.html',
      },
    },
    plugins: [react(), contentSecurityPolicy()],
  },
})
