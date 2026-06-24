export type BodyId = "kerbin" | "mun" | "minmus" | "duna";

export const interplanetaryDeltaV: Record<string, number> = {
  "kerbin->mun": 860,
  "mun->kerbin": 860,

  "kerbin->minmus": 930,
  "minmus->kerbin": 930,

  "kerbin->duna": 1300,
  "duna->kerbin": 1450,

  "mun->minmus": 300,
  "minmus->mun": 300,

  "mun->duna": 2200,
  "duna->mun": 2200,

  "minmus->duna": 2100,
  "duna->minmus": 2100,
};