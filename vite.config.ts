/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// Tauri expects a fixed port in development and serves dist/ in the app.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // Two windows: the main window and the floating player.
    rollupOptions: { input: { main: 'index.html', mini: 'mini.html' } },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.ts'] },
});
