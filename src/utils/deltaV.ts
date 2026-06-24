import type { Node } from "../types/node";

import {
  surfaceToOrbit,
  orbitToFlyby,
  interplanetaryDV
} from "../data/deltaV";

function getLocal(body: string, type: "surfaceOrbit" | "orbitFlyby") {
  if (type === "surfaceOrbit") return surfaceToOrbit[body] ?? null;
  return orbitToFlyby[body] ?? null;
}

export function getDeltaV(from: Node, to: Node): number | null {
  // -------------------------
  // SAME BODY
  // -------------------------
  if (from.body === to.body) {
    if (from.situation === to.situation) return 0;

    // surface ↔ orbit
    if (
      (from.situation === "surface" && to.situation === "orbit") ||
      (from.situation === "orbit" && to.situation === "surface")
    ) {
      return getLocal(from.body, "surfaceOrbit");
    }

    // orbit ↔ flyby
    if (
      (from.situation === "orbit" && to.situation === "flyby") ||
      (from.situation === "flyby" && to.situation === "orbit")
    ) {
      return getLocal(from.body, "orbitFlyby");
    }

    // surface ↔ flyby (composed)
    if (from.situation === "surface" && to.situation === "flyby") {
      const a = getLocal(from.body, "surfaceOrbit");
      const b = getLocal(from.body, "orbitFlyby");
      return a && b ? a + b : null;
    }

    if (from.situation === "flyby" && to.situation === "surface") {
      const a = getLocal(from.body, "orbitFlyby");
      const b = getLocal(from.body, "surfaceOrbit");
      return a && b ? a + b : null;
    }

    return null;
  }

  // -------------------------
  // INTERPLANETARY (THIS IS THE FIX)
  // -------------------------

  // orbit → flyby (enter target SOI)
  if (from.situation === "orbit" && to.situation === "flyby") {
    return interplanetaryDV[`${from.body}->${to.body}`] ?? null;
  }

  // flyby → flyby (transfer between SOIs)
  if (from.situation === "flyby" && to.situation === "flyby") {
    return interplanetaryDV[`${from.body}->${to.body}`] ?? null;
  }

  return null;
}