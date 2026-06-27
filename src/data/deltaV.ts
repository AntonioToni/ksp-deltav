export const surfaceToOrbit: Record<string, number> = {
  kerbin: 3400,
  mun: 580,
  minmus: 180,
  duna: 1450,
  ike: 390,
};

export const orbitToFlyby: Record<string, number> = {
  kerbin: 950,
  mun: 310,
  minmus: 160,
  duna: 610,
  ike: 180,
};

// Same-system: from parent body's orbit → moon's flyby (and reverse)
// e.g. Kerbin orbit → Mun flyby, or Duna orbit → Ike flyby
export const sameSystemDV: Record<string, number> = {
  "kerbin<->mun": 860,
  "kerbin<->minmus": 930,
  "duna<->ike": 390,
};

// Interplanetary: from origin's flyby → destination's flyby
export const interplanetaryDV: Record<string, number> = {
  "kerbin<->duna": 130,
  "kerbin<->moho": 760,
  // add more 
};