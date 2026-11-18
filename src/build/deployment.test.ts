import { describe, expect, it } from 'vitest'
import { deploymentHtml, deploymentRobots, PREVIEW_CONTENT_SECURITY_POLICY, resolveDeploymentContext } from './deployment'

const production = resolveDeploymentContext({ production: true })
const preview = resolveDeploymentContext({ production: true, basePath: '/ksp-deltav/previews/pr-24/', previewPRNumber: '24' })

describe('Pages deployment build context', () => {
  it('preserves local and production default paths, analytics eligibility and storage keys', () => {
    expect(resolveDeploymentContext({}).basePath).toBe('/')
    expect(resolveDeploymentContext({}).analyticsEnabled).toBe(false)
    expect(production).toEqual({ basePath: '/ksp-deltav/', previewPRNumber: null, isPreview: false, analyticsEnabled: true, storagePrefix: '' })
  })

  it('identifies an explicit PR path and disables analytics while isolating its storage', () => {
    expect(preview).toEqual({ basePath: '/ksp-deltav/previews/pr-24/', previewPRNumber: 24, isPreview: true, analyticsEnabled: false, storagePrefix: 'ksp-deltav:preview:pr-24:' })
    expect(resolveDeploymentContext({ production: true, basePath: '/ksp-deltav/previews/pr-25/', previewPRNumber: '25' }).storagePrefix).not.toBe(preview.storagePrefix)
  })

  it.each(['0', '-2', '2.1', '2e3', '024', 'Infinity', '9007199254740992', '24;evil'])('rejects invalid PR identity %s', previewPRNumber => {
    expect(() => resolveDeploymentContext({ basePath: '/ksp-deltav/previews/pr-24/', previewPRNumber })).toThrow(/positive safe integer/)
  })

  it.each(['https://example.com/', '//example.com/', '/a/../b/', '/a//b/', '/a/?token=x', '/a/#hash', '/a/%2e%2e/', '/missing-slash'])('rejects unsafe or ambiguous asset base %s', basePath => {
    expect(() => resolveDeploymentContext({ basePath })).toThrow(/absolute path/)
  })

  it('rejects a preview identity at the production root or a different PR path', () => {
    expect(() => resolveDeploymentContext({ previewPRNumber: '24', production: true })).toThrow(/matching/)
    expect(() => resolveDeploymentContext({ previewPRNumber: '24', basePath: '/ksp-deltav/previews/pr-25/' })).toThrow(/matching/)
    expect(() => resolveDeploymentContext({ basePath: '/ksp-deltav/previews/pr-24/' })).toThrow(/protections/)
  })

  it('leaves production HTML unchanged and adds preview safeguards before resources', () => {
    const html = '<html><head><meta name="robots" content="index, follow" /><script src="/assets/app.js"></script><script type="application/ld+json">{"name":"Production"}</script></head><body></body></html>'
    expect(deploymentHtml(html, production)).toBe(html)
    const result = deploymentHtml(html, preview)
    expect(result).toContain('content="noindex, nofollow, noarchive"')
    expect(result).not.toContain('content="index, follow"')
    expect(result).not.toContain('application/ld+json')
    expect(result).toContain('name="ksp-preview-pr" content="24"')
    expect(result.indexOf('Content-Security-Policy')).toBeLessThan(result.indexOf('<script'))
    expect(result).toContain(PREVIEW_CONTENT_SECURITY_POLICY)
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("connect-src 'none'")
    expect(PREVIEW_CONTENT_SECURITY_POLICY).toContain("script-src 'self'")
  })

  it('inserts noindex even when a future template has no existing robots meta', () => {
    expect(deploymentHtml('<html><head></head><body></body></html>', preview)).toContain('content="noindex, nofollow, noarchive"')
    expect(deploymentRobots(preview)).toBe('User-agent: *\nDisallow: /\n')
    expect(deploymentRobots(production)).toContain('Disallow: /ksp-deltav/previews/')
  })
})
