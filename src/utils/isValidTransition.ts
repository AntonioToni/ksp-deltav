// src/utils/isValidTransition.ts
import type { Node } from "../types/node";

function areParentChild(a: Node, b: Node): boolean {
  return a.body === b.parent || b.body === a.parent;
}

export function isValidTransition(from: Node, to: Node): boolean {
  // SAME BODY — only adjacent states
  if (from.body === to.body) {
    return (
      (from.situation === "surface" && to.situation === "orbit") ||
      (from.situation === "orbit"   && to.situation === "surface") ||
      (from.situation === "orbit"   && to.situation === "flyby") ||
      (from.situation === "flyby"   && to.situation === "orbit")
      // surface ↔ flyby is NOT a direct edge; Dijkstra will route through orbit
    );
  }

  // SAME SYSTEM — only between a moon and its direct parent
  if (from.system === to.system) {
    if (!areParentChild(from, to)) return false;
    // Parent orbit → moon flyby, or moon flyby → parent orbit
    return (
      (from.situation === "orbit" && to.situation === "flyby") ||
      (from.situation === "flyby" && to.situation === "orbit")
    );
  }

  // DIFFERENT SYSTEM — only flyby → flyby
  return from.situation === "flyby" && to.situation === "flyby";
}