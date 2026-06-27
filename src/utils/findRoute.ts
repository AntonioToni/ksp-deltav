// src/utils/findRoute.ts
import type { Graph } from "./buildGraph";

export interface RouteResult {
  path: string[];
  cost: number;
}

export function findLowestCostPath(
  graph: Graph,
  start: string,
  goal: string
): RouteResult | null {
  const distances: Record<string, number> = {};
  const previous: Record<string, string | null> = {};
  const visited = new Set<string>();

  for (const node in graph) {
    distances[node] = Infinity;
    previous[node] = null;
  }
  distances[start] = 0;

  while (true) {
    let current: string | null = null;
    let lowest = Infinity;

    for (const node in distances) {
      if (!visited.has(node) && distances[node] < lowest) {
        lowest = distances[node];
        current = node;
      }
    }

    if (!current || current === goal) break;
    visited.add(current);

    for (const edge of graph[current] ?? []) {
      const newDist = distances[current] + edge.cost;
      if (newDist < distances[edge.to]) {
        distances[edge.to] = newDist;
        previous[edge.to] = current;
      }
    }
  }

  // No path found
  if (distances[goal] === Infinity) return null;

  const path: string[] = [];
  let curr: string | null = goal;
  while (curr) {
    path.unshift(curr);
    curr = previous[curr];
  }

  return { path, cost: distances[goal] };
}