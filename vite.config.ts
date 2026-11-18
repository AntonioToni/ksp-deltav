import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { deploymentHtml, deploymentRobots, resolveDeploymentContext, type DeploymentContext } from './src/build/deployment.ts'

const socialPreviewSource = new URL('./docs/assets/planner-preview.png', import.meta.url)

/** Publish the README artwork without keeping a second source image in public/. */
function socialPreview(): Plugin {
  return {
    name: 'planner-social-preview',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'social-preview.png',
        source: readFileSync(socialPreviewSource),
      })
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!['GET', 'HEAD'].includes(request.method ?? '')
          || request.url?.split('?', 1)[0] !== '/social-preview.png') return next()

        try {
          const image = readFileSync(socialPreviewSource)
          response.statusCode = 200
          response.setHeader('Content-Type', 'image/png')
          response.setHeader('Content-Length', image.byteLength)
          response.setHeader('Cache-Control', 'no-cache')
          response.end(request.method === 'HEAD' ? undefined : image)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

function deploymentAssets(context: DeploymentContext): Plugin {
  return {
    name: 'planner-deployment-context',
    transformIndexHtml: { order: 'pre', handler: html => deploymentHtml(html, context) },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: deploymentRobots(context) })
    },
  }
}

// Development and production defaults stay unchanged. Preview builds provide
// both variables so a nested artifact cannot accidentally omit protections.
export default defineConfig(({ command, isPreview, mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_')
  const context = resolveDeploymentContext({
    basePath: environment.VITE_BASE_PATH,
    previewPRNumber: environment.VITE_PREVIEW_PR_NUMBER,
    production: command === 'build' || isPreview,
  })
  return { plugins: [react(), socialPreview(), deploymentAssets(context)], base: context.basePath }
})
