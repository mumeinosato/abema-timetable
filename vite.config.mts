import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const configDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ mode }) => {
  const isPopup = mode === 'popup'

  return {
    root: 'src',
    build: {
      outDir: '../dist',
      emptyOutDir: !isPopup,
      rollupOptions: {
        input: {
          [isPopup ? 'popup' : 'index']: resolve(configDir, `src/${isPopup ? 'popup' : 'index'}.ts`),
        },
        output: {
          entryFileNames: '[name].js',
          format: 'iife',
        },
      },
    },
  }
})