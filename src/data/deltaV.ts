export const surfaceToOrbit: Record<string, number> = {
  kerbin: 3400,
  mun: 580,
  minmus: 180,
  duna: 1450,
};

export const orbitToFlyby: Record<string, number> = {
  kerbin: 950,
  mun: 310,
  minmus: 160,
  duna: 610,
};

export const interplanetaryDV: Record<string, number> = {
  "kerbin->mun": 860,
  "kerbin->minmus": 930,
  "kerbin->duna": 130,
  "mun->duna": 1200,
  "minmus->duna": 1250,
};