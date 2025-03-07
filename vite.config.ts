import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

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
    rollupOptions: {
      output: {
        manualChunks: undefined,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name) {
            const info = assetInfo.name.split('.');
            const ext = info[info.length - 1];
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`;
            }
          }
          return `assets/[name]-[hash][extname]`;
        },
      },
    },
    sourcemap: true,
    assetsDir: 'assets',
    emptyOutDir: true,
    copyPublicDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3002',
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.error('Proxy error:', err);
            if (!res.headersSent) {
              res.writeHead(500, {
                'Content-Type': 'application/json'
              });
              res.end(JSON.stringify({ error: 'Proxy error', details: err.message }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxying request:', {
              method: req.method,
              url: req.url,
              target: options.target + req.url
            });
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('Proxy response:', {
              method: req.method,
              url: req.url,
              status: proxyRes.statusCode
            });
          });
        }
      },
    },
  },
})
