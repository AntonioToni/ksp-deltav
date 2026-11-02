import type { Point } from './mapLayout'

/** Shortest orthogonal path through obstacle-edge lanes to a horizontal gutter. */
export function routeToGutter(start: Point, gutterY: number, xs: number[], ys: number[], clear: (points: Point[]) => boolean): Point[] | undefined {
  return routeOnGrid(start, gutterY, xs, ys, clear)
}

/** Orthogonal path that balances distance with a small cost for each elbow. */
export function routeBetweenPoints(start: Point, end: Point, xs: number[], ys: number[], clear: (points: Point[]) => boolean): Point[] | undefined {
  return routeOnGrid(start, end.y, xs, ys, clear, end.x)
}

function routeOnGrid(start: Point, targetY: number, xs: number[], ys: number[], clear: (points: Point[]) => boolean, targetX?: number): Point[] | undefined {
  const width = xs.length
  const startColumn = xs.indexOf(start.x)
  const startRow = ys.indexOf(start.y)
  const targetRow = ys.indexOf(targetY)
  const targetColumn = targetX === undefined ? undefined : xs.indexOf(targetX)
  if (!width || startColumn < 0 || startRow < 0 || targetRow < 0 || targetColumn === -1) return
  // Direct links prefer a few clear elbows over equal-length staircases. Keep
  // both incoming axes in the search state: the next turn's cost depends on it.
  // Existing gutter routing retains its distance-only behavior.
  const axes = targetColumn === undefined ? 1 : 3
  const startIndex = (startRow * width + startColumn) * axes
  const distances = new Float64Array(width * ys.length * axes).fill(Infinity)
  const previous = new Int32Array(distances.length).fill(-1)
  const closed = new Uint8Array(distances.length)
  const queue: { index: number; score: number }[] = []
  const point = (index: number): Point => {
    const cell = Math.floor(index / axes)
    return { x: xs[cell % width]!, y: ys[Math.floor(cell / width)]! }
  }
  const remaining = (point: Point) => Math.abs(point.y - targetY) + (targetX === undefined ? 0 : Math.abs(point.x - targetX))
  const push = (entry: { index: number; score: number }) => {
    queue.push(entry)
    let index = queue.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (queue[parent]!.score <= entry.score) break
      queue[index] = queue[parent]!
      index = parent
    }
    queue[index] = entry
  }
  const pop = () => {
    const first = queue[0]!
    const last = queue.pop()!
    if (queue.length) {
      let index = 0
      while (index * 2 + 1 < queue.length) {
        let child = index * 2 + 1
        if (child + 1 < queue.length && queue[child + 1]!.score < queue[child]!.score) child++
        if (queue[child]!.score >= last.score) break
        queue[index] = queue[child]!
        index = child
      }
      queue[index] = last
    }
    return first.index
  }
  distances[startIndex] = 0
  push({ index: startIndex, score: remaining(start) })
  while (queue.length) {
    const current = pop()
    if (closed[current]) continue
    closed[current] = 1
    const cell = Math.floor(current / axes)
    const row = Math.floor(cell / width)
    const column = cell % width
    const incomingAxis = current % axes
    if (row === targetRow && (targetColumn === undefined || column === targetColumn)) {
      const path: Point[] = []
      for (let index = current; index !== -1; index = previous[index]!) path.push(point(index))
      path.reverse()
      return path.filter((point, index) => {
        if (!index || index === path.length - 1) return true
        const before = path[index - 1]!
        const after = path[index + 1]!
        return (before.x !== point.x || point.x !== after.x) && (before.y !== point.y || point.y !== after.y)
      })
    }
    const from = point(current)
    const neighbors = [column > 0 ? cell - 1 : -1, column + 1 < width ? cell + 1 : -1,
      row > 0 ? cell - width : -1, row + 1 < ys.length ? cell + width : -1]
    for (const neighbor of neighbors) {
      if (neighbor < 0) continue
      const nextAxis = axes === 1 ? 0 : Math.floor(neighbor / width) === row ? 1 : 2
      const next = neighbor * axes + nextAxis
      if (closed[next]) continue
      const to = point(next)
      const turnCost = incomingAxis !== 0 && incomingAxis !== nextAxis ? 12 : 0
      const distance = distances[current]! + Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + turnCost
      if (distance >= distances[next]! || !clear([from, to])) continue
      distances[next] = distance
      previous[next] = current
      push({ index: next, score: distance + remaining(to) })
    }
  }
}
