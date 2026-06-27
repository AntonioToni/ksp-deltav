// src/utils/deltaV.ts
import type { Node } from "../types/node";
import { surfaceToOrbit, orbitToFlyby, sameSystemDV, interplanetaryDV } from "../data/deltaV";

function getLocal(body: string, type: "surfaceOrbit" | "orbitFlyby"): number | null {
  if (type === "surfaceOrbit") return surfaceToOrbit[body] ?? null;
  return orbitToFlyby[body] ?? null;
}

function getSymmetric(table: Record<string, number>, a: string, b: string): number | null {
  return table[`${a}<->${b}`] ?? table[`${b}<->${a}`] ?? null;
}

export function getDeltaV(from: Node, to: Node): number | null {
  // SAME BODY
  if (from.body === to.body) {
    if (from.situation === to.situation) return 0;

    if (
      (from.situation === "surface" && to.situation === "orbit") ||
      (from.situation === "orbit" && to.situation === "surface")
    ) {
      return getLocal(from.body, "surfaceOrbit");
    }

    if (
      (from.situation === "orbit" && to.situation === "flyby") ||
      (from.situation === "flyby" && to.situation === "orbit")
    ) {
      return getLocal(from.body, "orbitFlyby");
    }

    return null;
  }

  // SAME SYSTEM, DIFFERENT BODY (e.g. Kerbin ↔ Mun, Duna ↔ Ike)
  // Valid edges: orbit (parent) → flyby (moon), or flyby (moon) → orbit (parent)
  if (from.system === to.system) {
    return getSymmetric(sameSystemDV, from.body, to.body);
  }

  // DIFFERENT SYSTEM — only flyby → flyby is valid here
  if (from.situation === "flyby" && to.situation === "flyby") {
    return getSymmetric(interplanetaryDV, from.body, to.body);
  }

  return null;
}