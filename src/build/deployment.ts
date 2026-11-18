export interface DeploymentContext {
  basePath: string
  previewPRNumber: number | null
  isPreview: boolean
  analyticsEnabled: boolean
  storagePrefix: string
}

export interface DeploymentEnvironment {
  basePath?: string
  previewPRNumber?: string
  production?: boolean
}

/** Only path bases are supported: previews must stay inside this Pages site. */
export function resolveDeploymentContext(environment: DeploymentEnvironment): DeploymentContext {
  const rawNumber = environment.previewPRNumber?.trim() ?? ''
  const previewPRNumber = rawNumber === '' ? null : Number(rawNumber)
  if (rawNumber !== '' && (!/^[1-9]\d*$/.test(rawNumber) || !Number.isSafeInteger(previewPRNumber))) {
    throw new Error('VITE_PREVIEW_PR_NUMBER must be a positive safe integer.')
  }
  const basePath = environment.basePath?.trim() || (environment.production ? '/ksp-deltav/' : '/')
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath)) {
    throw new Error('VITE_BASE_PATH must be an absolute path ending in /, without query strings or parent segments.')
  }
  if (previewPRNumber !== null && basePath !== `/ksp-deltav/previews/pr-${previewPRNumber}/`) {
    throw new Error('Preview builds require VITE_BASE_PATH=/ksp-deltav/previews/pr-{number}/ matching VITE_PREVIEW_PR_NUMBER.')
  }
  if (previewPRNumber === null && basePath.startsWith('/ksp-deltav/previews/')) {
    throw new Error('A preview base path requires VITE_PREVIEW_PR_NUMBER so preview protections cannot be omitted.')
  }
  return {
    basePath, previewPRNumber, isPreview: previewPRNumber !== null,
    analyticsEnabled: environment.production === true && previewPRNumber === null,
    storagePrefix: previewPRNumber === null ? '' : `ksp-deltav:preview:pr-${previewPRNumber}:`,
  }
}

/** Defense in depth for trusted builds. This is not a same-origin sandbox. */
export const PREVIEW_CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

export function deploymentHtml(html: string, context: DeploymentContext): string {
  if (!context.isPreview) return html
  // CSP must precede resources. Preview pages do not publish production's
  // structured search listing; the canonical link still points to production.
  const withoutIndexing = html
    .replace(/<meta\b[^>]*\bname=(['"])robots\1[^>]*>/gi, '')
    .replace(/<script\b[^>]*\btype=(['"])application\/ld\+json\1[^>]*>[\s\S]*?<\/script>/gi, '')
  return withoutIndexing.replace(/<head>/i, `<head>
    <meta http-equiv="Content-Security-Policy" content="${PREVIEW_CONTENT_SECURITY_POLICY}" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <meta name="ksp-preview-pr" content="${context.previewPRNumber}" />`)
}

export function deploymentRobots(context: DeploymentContext): string {
  return context.isPreview ? 'User-agent: *\nDisallow: /\n'
    : 'User-agent: *\nDisallow: /ksp-deltav/previews/\nSitemap: https://antoniotoni.github.io/ksp-deltav/sitemap.xml\n'
}
