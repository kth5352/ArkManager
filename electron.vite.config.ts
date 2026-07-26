import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      lib: {
        entry: 'electron/main/index.ts',
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
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    build: {
      rollupOptions: {
        input: 'index.html',
      },
    },
    plugins: [react()],
  },
})
