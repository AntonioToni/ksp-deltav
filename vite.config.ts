import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Keep development at /; production and preview use the Pages project path.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === 'build' || isPreview ? '/ksp-deltav/' : '/',
}))
