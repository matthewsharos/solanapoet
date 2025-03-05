import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['stream', 'os', 'path', 'crypto', 'buffer', 'process', 'events', 'assert', 'util', 'fs', 'http2'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      stream: 'stream-browserify',
      os: 'os-browserify/browser',
      util: 'util',
      https: 'https-browserify',
      http: 'stream-http',
      fs: 'memfs',
      http2: 'http2-wrapper',
    },
  },
  optimizeDeps: {
    include: ['buffer', 'process', 'memfs', 'http2-wrapper'],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
