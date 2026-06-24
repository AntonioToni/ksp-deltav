import { nodes } from "../data/nodes";
import { getDeltaV } from "./deltaV";
import { isValidTransition } from "./isValidTransition";

export type Graph = Record<string, { to: string; cost: number }[]>;

export function buildGraph(): Graph {
  const graph: Record<string, { to: string; cost: number }[]> = {};

  for (const from of nodes) {
    graph[from.id] = [];

    for (const to of nodes) {
      if (from.id === to.id) continue;

      // 🚨 HARD BLOCK: no orbit-to-orbit interplanetary edges
      if (
        from.situation === "orbit" &&
        to.situation === "orbit" &&
        from.body !== to.body
      ) {
        continue;
      }

      if (!isValidTransition(from, to)) continue;

      const cost = getDeltaV(from, to);
      if (cost === null) {
        continue;
      }

      graph[from.id].push({
        to: to.id,
        cost,
      });
    }
  }

  return graph;
}