import type { Node } from "../types/node";

export function isValidTransition(from: Node, to: Node): boolean {
  // SAME BODY
  if (from.body === to.body) {
    return (
      (from.situation === "surface" && to.situation === "orbit") ||
      (from.situation === "orbit" && to.situation === "surface") ||
      (from.situation === "orbit" && to.situation === "flyby") ||
      (from.situation === "flyby" && to.situation === "orbit")
    );
  }

  // SAME SYSTEM (Kerbin system: Kerbin, Mun, Minmus)
  if (from.system === to.system) {
    return (
      (from.situation === "orbit" && to.situation === "orbit") ||
      (from.situation === "orbit" && to.situation === "flyby") ||
      (from.situation === "flyby" && to.situation === "orbit")
    );
  }

  // DIFFERENT SYSTEM (interplanetary)
  if (from.system !== to.system) {
    return (
      from.situation === "flyby" &&
      to.situation === "flyby"
    );
  }

  return false;
}