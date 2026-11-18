import { defineConfig, devices } from '@playwright/test'
import baseConfig from './playwright.config'
import { resolveDeploymentContext } from './src/build/deployment'

// Use the same environment for the build and this command. This tests the
// emitted site under its real nested Pages URL, rather than Vite's dev fallback.
const { basePath } = resolveDeploymentContext({
  basePath: process.env.VITE_BASE_PATH,
  previewPRNumber: process.env.VITE_PREVIEW_PR_NUMBER,
  production: true,
})
const baseURL = `http://127.0.0.1:4176${basePath}`

export default defineConfig({
  ...baseConfig,
  metadata: { ...baseConfig.metadata, pagesDeployment: true },
  testMatch: '**/preview-deployment.spec.ts',
  use: { ...baseConfig.use, baseURL },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4176 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
  },
})
