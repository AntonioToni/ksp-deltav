import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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

// Keep development at /; production and preview use the Pages project path.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react(), socialPreview()],
  base: command === 'build' || isPreview ? '/ksp-deltav/' : '/',
}))
