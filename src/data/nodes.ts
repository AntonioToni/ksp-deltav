// src/data/nodes.ts
import type { Node } from "../types/node";

export const nodes: Node[] = [
  { id: "kerbin_surface", body: "kerbin", situation: "surface", system: "kerbin", parent: null },
  { id: "kerbin_orbit",   body: "kerbin", situation: "orbit",   system: "kerbin", parent: null },
  { id: "kerbin_flyby",   body: "kerbin", situation: "flyby",   system: "kerbin", parent: null },

  { id: "mun_surface", body: "mun", situation: "surface", system: "kerbin", parent: "kerbin" },
  { id: "mun_orbit",   body: "mun", situation: "orbit",   system: "kerbin", parent: "kerbin" },
  { id: "mun_flyby",   body: "mun", situation: "flyby",   system: "kerbin", parent: "kerbin" },

  { id: "minmus_surface", body: "minmus", situation: "surface", system: "kerbin", parent: "kerbin" },
  { id: "minmus_orbit",   body: "minmus", situation: "orbit",   system: "kerbin", parent: "kerbin" },
  { id: "minmus_flyby",   body: "minmus", situation: "flyby",   system: "kerbin", parent: "kerbin" },

  { id: "duna_surface", body: "duna", situation: "surface", system: "duna", parent: null },
  { id: "duna_orbit",   body: "duna", situation: "orbit",   system: "duna", parent: null },
  { id: "duna_flyby",   body: "duna", situation: "flyby",   system: "duna", parent: null },

  { id: "ike_surface", body: "ike", situation: "surface", system: "duna", parent: "duna" },
  { id: "ike_orbit",   body: "ike", situation: "orbit",   system: "duna", parent: "duna" },
  { id: "ike_flyby",   body: "ike", situation: "flyby",   system: "duna", parent: "duna" },
];