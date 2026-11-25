import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'stockfish-worker-assets',
        configureServer(server) {
          const runtimeDir = path.resolve(__dirname, '.stockfish-runtime');
          const sfBinDir = path.resolve(__dirname, 'node_modules/stockfish/bin');
          const safeFilename = /^stockfish[\w.-]*\.(?:js|wasm)$/;
          server.middlewares.use('/stockfish', (req, res, next) => {
            const cleanName = path.basename((req.url ?? '').split('?')[0]);
            if (!safeFilename.test(cleanName)) {
              next();
              return;
            }
            const runtimeFile = path.join(runtimeDir, cleanName);
            const bundledFile = path.join(sfBinDir, cleanName);
            const filePath = fs.existsSync(runtimeFile)
              ? runtimeFile
              : fs.existsSync(bundledFile)
              ? bundledFile
              : null;
            if (!filePath) {
              next();
              return;
            }
            res.setHeader(
              'Content-Type',
              cleanName.endsWith('.wasm')
                ? 'application/wasm'
                : 'application/javascript; charset=utf-8'
            );
            res.setHeader('Cache-Control', 'no-cache');
            fs.createReadStream(filePath).pipe(res);
          });
        },
        generateBundle() {
          const sfBinDir = path.resolve(__dirname, 'node_modules/stockfish/bin');
          const files = [
            'stockfish-19-lite-single.js',
            'stockfish-19-lite-single.wasm',
            'stockfish-19-asm.js',
          ];
          for (const f of files) {
            const src = path.join(sfBinDir, f);
            if (fs.existsSync(src)) {
              this.emitFile({
                type: 'asset',
                fileName: `stockfish/${f}`,
                source: fs.readFileSync(src),
              });
            }
          }
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'favicon-32x32.png'],
        manifest: {
          id: '/',
          name: 'رَصْد الشطرنج — Stockfish UCI',
          short_name: 'رصد الشطرنج',
          description:
            'تطبيق تحليل شطرنج مباشر عبر الكاميرا أو البث التفاعلي مع محرك Stockfish 19 عبر UCI والشرح الصوتي.',
          theme_color: '#0B0E14',
          background_color: '#0B0E14',
          display: 'standalone',
          orientation: 'any',
          start_url: '/',
          scope: '/',
          dir: 'rtl',
          lang: 'ar',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,wasm}'],
          globIgnores: ['**/stockfish/stockfish-19-asm.js', '**/dev-dist/**'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^\/api\/.*/i,
              handler: 'NetworkOnly',
            },
            {
              urlPattern: /\/stockfish\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'stockfish-wasm-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 16,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      minify: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('antiReverseGuard')) {
              return 'security-core';
            }
            return undefined;
          },
        },
      },
    },
  };
});
