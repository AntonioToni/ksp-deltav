const bodyKinds = new Set(['star', 'planet', 'moon'])
const nodeKinds = new Set(['surface', 'orbit', 'elliptical', 'encounter'])
const maneuverKinds = new Set(['ascent', 'descent', 'escape', 'capture', 'transfer'])
type Entry = Record<string, unknown>

function isEntry(value: unknown): value is Entry {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Invalid imported objects may shadow toString; never coerce them for diagnostics.
function display(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value) : '[invalid]'
}

/** Validate both imported data shape and the supported maneuver topology. */
export function validatePlanetPack(pack: unknown): string[] {
  const errors: string[] = []
  const raw: unknown = pack
  if (!isEntry(raw)) return ['Planet pack must be an object.']

  const text = (value: unknown, label: string) => {
    if (!isText(value)) errors.push(`${label} must be a nonempty string.`)
  }
  const texts = (value: unknown, label: string) => {
    if (!Array.isArray(value) || value.some(item => !isText(item))) {
      errors.push(`${label} must be an array of nonempty strings.`)
    }
  }
  const entries = (value: unknown, label: string): Entry[] => {
    if (!Array.isArray(value)) {
      errors.push(`${label} must be an array.`)
      return []
    }
    const result: Entry[] = []
    for (const [index, entry] of value.entries()) {
      if (isEntry(entry)) result.push(entry)
      else errors.push(`${label}[${index}] must be an object.`)
    }
    return result
  }
  const index = (items: Entry[], label: string) => {
    const result = new Map<string, Entry>()
    for (const item of items) {
      if (!isText(item.id)) {
        errors.push(`${label} ID must be a nonempty string.`)
      } else if (result.has(item.id)) {
        errors.push(`Duplicate ${label} ID: ${item.id}.`)
      } else result.set(item.id, item)
    }
    return result
  }

  for (const field of ['id', 'name', 'version', 'description']) text(raw[field], `Pack ${field}`)
  for (const field of ['shortName', 'dataNotice', 'transferHubBodyId']) {
    if (raw[field] !== undefined) text(raw[field], `Pack ${field}`)
  }
  texts(raw.assumptions, 'Pack assumptions')
  const bodies = entries(raw.bodies, 'Bodies')
  const nodes = entries(raw.nodes, 'Nodes')
  const sources = entries(raw.sources, 'Sources')
  const maneuvers = entries(raw.maneuvers, 'Maneuvers')
  const bodyById = index(bodies, 'body')
  const nodeById = index(nodes, 'node')
  const sourceById = index(sources, 'source')
  index(maneuvers, 'maneuver')
  if (bodies.length === 0) errors.push('A planet pack must contain at least one body.')
  if (nodes.length === 0) errors.push('A planet pack must contain at least one routing node.')
  if (isText(raw.transferHubBodyId)) {
    const hub = bodyById.get(raw.transferHubBodyId)
    if (!hub || hub.kind !== 'planet') errors.push('Pack transferHubBodyId must reference a planet.')
    else if (!nodes.some(node => node.bodyId === raw.transferHubBodyId && node.kind === 'orbit')) {
      errors.push('Pack transfer hub must have a low-orbit routing state.')
    }
  }

  for (const body of bodies) {
    const label = `Body ${display(body.id)}`
    text(body.name, `${label} name`)
    text(body.color, `${label} color`)
    if (typeof body.kind !== 'string' || !bodyKinds.has(body.kind)) errors.push(`${label} has an unsupported kind.`)
    if (typeof body.hasSurface !== 'boolean') errors.push(`${label} must declare hasSurface.`)
    if (typeof body.hasAtmosphere !== 'boolean') errors.push(`${label} must declare hasAtmosphere.`)
    if (body.supportsAtmosphericBraking !== undefined && typeof body.supportsAtmosphericBraking !== 'boolean') errors.push(`${label} supportsAtmosphericBraking must be a boolean when supplied.`)
    if (body.parentId !== null && !isText(body.parentId)) errors.push(`${label} must declare a parent ID or null.`)
    const parent = typeof body.parentId === 'string' ? bodyById.get(body.parentId) : undefined
    if (typeof body.parentId === 'string' && !parent) errors.push(`${label} references unknown parent ${body.parentId}.`)
    if (body.kind === 'star' && (body.parentId !== null || body.hasSurface === true)) errors.push(`${label}: a star must have no parent or landable surface.`)
    if (body.kind === 'planet' && parent && parent.kind !== 'star') errors.push(`${label}: a planet must orbit a star.`)
    if (body.kind === 'moon' && parent && parent.kind !== 'planet' && parent.kind !== 'moon') errors.push(`${label}: a moon must orbit a planet or moon.`)
    if (body.kind !== 'star' && body.parentId === null) errors.push(`${label} must have a parent body.`)
    const seen = new Set<unknown>([body.id])
    let ancestor = body.parentId
    while (typeof ancestor === 'string' && bodyById.has(ancestor)) {
      if (seen.has(ancestor)) {
        errors.push(`${label} belongs to a cyclic parent hierarchy.`)
        break
      }
      seen.add(ancestor)
      ancestor = bodyById.get(ancestor)?.parentId
    }
  }

  for (const source of sources) {
    text(source.title, `Source ${display(source.id)} title`)
    try {
      if (typeof source.url !== 'string' || new URL(source.url).protocol !== 'https:') throw new Error('Invalid URL')
    } catch {
      errors.push(`Source ${display(source.id)} must have a valid HTTPS URL.`)
    }
  }

  for (const node of nodes) {
    const label = `Node ${display(node.id)}`
    text(node.label, `${label} label`)
    const body = typeof node.bodyId === 'string' ? bodyById.get(node.bodyId) : undefined
    if (!body) errors.push(`${label} references unknown body ${display(node.bodyId)}.`)
    if (typeof node.kind !== 'string' || !nodeKinds.has(node.kind)) errors.push(`${label} has an unsupported kind.`)
    if (node.kind === 'surface' && body && body.hasSurface !== true) errors.push(`${label}: ${display(body.name)} has no landable surface.`)
    if (node.altitudeKm !== undefined && (typeof node.altitudeKm !== 'number' || !Number.isFinite(node.altitudeKm) || node.altitudeKm < 0)) errors.push(`${label} altitude must be finite and nonnegative.`)
  }

  for (const edge of maneuvers) {
    const label = `Maneuver ${display(edge.id)}`
    text(edge.label, `${label} label`)
    texts(edge.assumptions, `${label} assumptions`)
    if (typeof edge.deltaV !== 'number' || !Number.isFinite(edge.deltaV) || edge.deltaV < 0) errors.push(`${label} Delta-V must be finite and nonnegative.`)
    if (typeof edge.sourceId !== 'string' || !sourceById.has(edge.sourceId)) errors.push(`${label} references unknown source ${display(edge.sourceId)}.`)
    if (typeof edge.kind !== 'string' || !maneuverKinds.has(edge.kind)) errors.push(`${label} has an unsupported kind.`)
    const from = typeof edge.from === 'string' ? nodeById.get(edge.from) : undefined
    const to = typeof edge.to === 'string' ? nodeById.get(edge.to) : undefined
    if (!from || !to) {
      errors.push(`${label} references an unknown routing endpoint.`)
      continue
    }
    const fromBody = typeof from.bodyId === 'string' ? bodyById.get(from.bodyId) : undefined
    const toBody = typeof to.bodyId === 'string' ? bodyById.get(to.bodyId) : undefined
    if (!fromBody || !toBody) continue
    const sameBody = from.bodyId === to.bodyId
    let allowed = false
    switch (edge.kind) {
      case 'ascent': allowed = sameBody && from.kind === 'surface' && to.kind === 'orbit'; break
      case 'descent': allowed = sameBody && from.kind === 'orbit' && to.kind === 'surface'; break
      case 'escape': allowed = sameBody && ((from.kind === 'orbit' && (to.kind === 'elliptical' || to.kind === 'encounter')) || (from.kind === 'elliptical' && to.kind === 'encounter')); break
      case 'capture': allowed = sameBody && ((from.kind === 'encounter' && (to.kind === 'elliptical' || to.kind === 'orbit')) || (from.kind === 'elliptical' && to.kind === 'orbit')); break
      case 'transfer': {
        const toMoon = (from.kind === 'orbit' || from.kind === 'elliptical') && to.kind === 'encounter' && toBody.parentId === fromBody.id
        const fromMoon = from.kind === 'encounter' && (to.kind === 'orbit' || to.kind === 'elliptical') && fromBody.parentId === toBody.id
        const betweenPlanets = from.kind === 'encounter' && to.kind === 'encounter' && fromBody.kind === 'planet' && toBody.kind === 'planet' && fromBody.parentId === toBody.parentId
        allowed = !sameBody && (toMoon || fromMoon || betweenPlanets)
        break
      }
    }
    if (!allowed) errors.push(`${label} has an unsupported ${display(edge.kind)} transition (${display(edge.from)} → ${display(edge.to)}).`)
  }
  return errors
}
