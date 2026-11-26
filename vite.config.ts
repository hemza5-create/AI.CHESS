/**
 * @author Hemza Harigui
 * @fingerprint HH-CVSU-2026
 */
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const define: Record<string, string> = {};
  const rawExtUrl = (process.env.VITE_EXTERNAL_SERVER_URL ?? '').trim();
  if (rawExtUrl && !/^https?:\/\//i.test(rawExtUrl)) {
    define['import.meta.env.VITE_EXTERNAL_SERVER_URL'] = JSON.stringify('');
  }
  const rawViteId = (process.env.VITE_EXTERNAL_SERVER_ID ?? '').trim();
  const rawServerId = (process.env.EXTERNAL_SERVER_ID ?? '').trim();
  if (
    (rawViteId === 'srv_key_9f8a2c7e' || rawViteId === 'ebd12-cc856') &&
    (!rawServerId || rawServerId === 'cvsu-uci-core-v2')
  ) {
    define['import.meta.env.VITE_EXTERNAL_SERVER_ID'] = JSON.stringify('cvsu-uci-core-v2');
  }
  const rawViteExplain = (process.env.VITE_API_ROUTE_EXPLAIN ?? '').trim();
  if (/\/gemini\//i.test(rawViteExplain) || /^\/api\/v2\/tt$/i.test(rawViteExplain)) {
    define['import.meta.env.VITE_API_ROUTE_EXPLAIN'] = JSON.stringify('/api/v2/coach/explain');
  }
  const rawViteBoard = (process.env.VITE_API_ROUTE_BOARD_SCAN ?? '').trim();
  if (/\/gemini\//i.test(rawViteBoard)) {
    define['import.meta.env.VITE_API_ROUTE_BOARD_SCAN'] = JSON.stringify('/api/v2/vision/scan-board');
  }

  return {
    define,
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
      {
        name: 'production-security-sanitizer',
        apply: 'build',
        generateBundle(_options, bundle) {
          for (const fileName of Object.keys(bundle)) {
            const base = path.basename(fileName).toLowerCase();
            if (
              base.endsWith('.map') ||
              base.startsWith('.env') ||
              base.endsWith('.pem') ||
              base.endsWith('.key') ||
              base.endsWith('.secret')
            ) {
              delete bundle[fileName];
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
      minify: 'oxc',
      cssMinify: true,
      sourcemap: false,
      reportCompressedSize: false,
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
