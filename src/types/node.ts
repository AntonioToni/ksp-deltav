import type { Situation } from "./situation";

export interface Node {
  id: string;
  body: string;
  situation: Situation;
  system: string;
  parent: string | null; // e.g. "kerbin" for mun/minmus, "duna" for ike, null for planets
}