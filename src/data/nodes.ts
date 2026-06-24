import type { Node } from "../types/node";

export const nodes: Node[] = [
  // Kerbin (Kerbol system)
  { id: "kerbin_surface", body: "kerbin", situation: "surface", system: "kerbin" },
  { id: "kerbin_orbit", body: "kerbin", situation: "orbit", system: "kerbin" },
  { id: "kerbin_flyby", body: "kerbin", situation: "flyby", system: "kerbin" },

  // Mun (Kerbin system)
  { id: "mun_surface", body: "mun", situation: "surface", system: "kerbin" },
  { id: "mun_orbit", body: "mun", situation: "orbit", system: "kerbin" },
  { id: "mun_flyby", body: "mun", situation: "flyby", system: "kerbin" },

  // Minmus (Kerbin system)
  { id: "minmus_surface", body: "minmus", situation: "surface", system: "kerbin" },
  { id: "minmus_orbit", body: "minmus", situation: "orbit", system: "kerbin" },
  { id: "minmus_flyby", body: "minmus", situation: "flyby", system: "kerbin" },

  // Duna (Kerbol system)
  { id: "duna_surface", body: "duna", situation: "surface", system: "duna" },
  { id: "duna_orbit", body: "duna", situation: "orbit", system: "duna" },
  { id: "duna_flyby", body: "duna", situation: "flyby", system: "duna" },
];