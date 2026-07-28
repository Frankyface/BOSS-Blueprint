import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

import { BASE_PATH, DEV_PORT, PREVIEW_HOST, PREVIEW_PORT } from './site.config.ts'

// https://vite.dev/config/
export default defineConfig({
  base: BASE_PATH,
  plugins: [react()],
  server: { port: DEV_PORT, strictPort: true },
  preview: { host: PREVIEW_HOST, port: PREVIEW_PORT, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
