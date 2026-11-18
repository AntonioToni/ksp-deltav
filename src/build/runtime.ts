import { resolveDeploymentContext } from './deployment'

export const deployment = resolveDeploymentContext({
  basePath: import.meta.env.BASE_URL,
  previewPRNumber: import.meta.env.VITE_PREVIEW_PR_NUMBER,
  production: import.meta.env.PROD,
})

/** All future analytics integrations must use this gate before initialization.
 * Preview HTML additionally blocks analytics transports with its CSP. */
export const analyticsEnabled = deployment.analyticsEnabled

export const appStorageKey = (key: string) => `${deployment.storagePrefix}${key}`
