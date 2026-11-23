import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the front-end into ../wwwroot/dist, served by ASP.NET Core:
//   dist/app.js   – entry (loaded by Pages/Shared/_Layout.cshtml as a module)
//   dist/app.css  – all front-end CSS
//   dist/chunks/* – lazily loaded React islands (hashed, cached forever)
export default defineConfig({
  plugins: [react()],
  base: '/dist/',
  build: {
    outDir: '../wwwroot/dist',
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: 'src/main.ts',
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        // Shared code (cart store, catalogue, helpers) goes into its own chunk so no island chunk ever
        // imports "../app.js". The page loads the entry under a fingerprinted URL; a second URL would
        // run the entry twice (double click handlers, two cart stores).
        manualChunks(id: string) {
          if (id.replace(/\\/g, '/').includes('/src/lib/')) return 'shared';
        },
        assetFileNames: (info) =>
          (info.names?.[0] ?? info.name ?? '').endsWith('.css') ? 'app.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
