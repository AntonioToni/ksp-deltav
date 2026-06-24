import type { Node } from "../types/node";

export function getPhase(from: Node, to: Node): string | null {
  if (from.body === to.body) {
    if (from.situation === "surface" && to.situation === "orbit") {
      return "launch";
    }

    if (from.situation === "orbit" && to.situation === "flyby") {
      return "departure";
    }

    if (from.situation === "flyby" && to.situation === "orbit") {
      return "capture";
    }

    if (from.situation === "orbit" && to.situation === "surface") {
      return "landing";
    }
  }

  if (from.situation === "flyby" && to.situation === "flyby") {
    return "transfer";
  }

  return null;
}