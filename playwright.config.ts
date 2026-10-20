import { defineConfig } from '@playwright/test';

// Runs against the built UI in its browser variant (sample stations, silent audio).
// Use scripts/e2e-docker.sh: same browser on Windows, Linux and macOS.
export default defineConfig({
  testDir: 'e2e',
  testIgnore: process.env.SCREENS ? [] : ['screenshots.spec.ts', 'readme-shots.spec.ts'],
  use: { baseURL: 'http://localhost:4173', viewport: { width: 380, height: 640 } },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: false,
  },
  reporter: [['list']],
});
