import type { Situation } from "./situation";

export interface Node {
  id: string;
  body: string;
  situation: Situation;
  system: string; // NEW
}