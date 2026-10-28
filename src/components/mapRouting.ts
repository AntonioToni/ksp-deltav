import type { Point } from './mapLayout'

/** Shortest orthogonal path through obstacle-edge lanes to a horizontal gutter. */
export function routeToGutter(start: Point, gutterY: number, xs: number[], ys: number[], clear: (points: Point[]) => boolean): Point[] | undefined {
  const width = xs.length
  const startIndex = ys.indexOf(start.y) * width + xs.indexOf(start.x)
  const targetRow = ys.indexOf(gutterY)
  const distances = new Float64Array(width * ys.length).fill(Infinity)
  const previous = new Int32Array(distances.length).fill(-1)
  const closed = new Uint8Array(distances.length)
  const queue: { index: number; score: number }[] = []
  const point = (index: number): Point => ({ x: xs[index % width]!, y: ys[Math.floor(index / width)]! })
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
  push({ index: startIndex, score: Math.abs(start.y - gutterY) })
  while (queue.length) {
    const current = pop()
    if (closed[current]) continue
    closed[current] = 1
    const row = Math.floor(current / width)
    const column = current % width
    if (row === targetRow) {
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
    const neighbors = [column > 0 ? current - 1 : -1, column + 1 < width ? current + 1 : -1,
      row > 0 ? current - width : -1, row + 1 < ys.length ? current + width : -1]
    for (const next of neighbors) {
      if (next < 0 || closed[next]) continue
      const to = point(next)
      const distance = distances[current]! + Math.abs(to.x - from.x) + Math.abs(to.y - from.y)
      if (distance >= distances[next]! || !clear([from, to])) continue
      distances[next] = distance
      previous[next] = current
      push({ index: next, score: distance + Math.abs(to.y - gutterY) })
    }
  }
}
