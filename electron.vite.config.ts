import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

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
        // an explicit second entry.
        entry: ['electron/main/index.ts', 'electron/main/media/mpvWorker.ts'],
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
    plugins: [react()],
  },
})
