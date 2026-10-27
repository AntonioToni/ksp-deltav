/** Ideal two-body budgets in SI units; callers choose any rounding. */

function positive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive.`)
}

function nonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and nonnegative.`)
}

function supported(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('The orbital budget exceeds the supported numerical range.')
  return value
}

function circularSpeed(mu: number, radiusM: number): number {
  // Separate square roots avoid overflowing mu/r before taking its root.
  return supported(Math.sqrt(mu) / Math.sqrt(radiusM))
}

/** Impulse magnitudes between circular orbits; the arrival value is the
 * relative encounter speed used by an ideal patched-conic moon/planet capture.
 */
export function hohmannTransfer(mu: number, departureRadiusM: number, arrivalRadiusM: number): {
  departureDeltaV: number
  arrivalDeltaV: number
} {
  positive('Gravitational parameter', mu)
  positive('Departure radius', departureRadiusM)
  positive('Arrival radius', arrivalRadiusM)
  const departureSpeed = circularSpeed(mu, departureRadiusM)
  const arrivalSpeed = circularSpeed(mu, arrivalRadiusM)
  const transferDepartureSpeed = departureSpeed * Math.sqrt(2 / (1 + departureRadiusM / arrivalRadiusM))
  const transferArrivalSpeed = arrivalSpeed * Math.sqrt(2 / (1 + arrivalRadiusM / departureRadiusM))
  return {
    departureDeltaV: supported(Math.abs(transferDepartureSpeed - departureSpeed)),
    arrivalDeltaV: supported(Math.abs(arrivalSpeed - transferArrivalSpeed)),
  }
}

/** Nominal encounter speed at the receiving orbit's node. The transfer is a
 * Hohmann ellipse in the parent's reference plane; the receiving circular
 * orbit's velocity is inclined by inclinationDeg there. This is an arrival
 * vector difference, not a general plane-change or launch-window solver.
 */
export function hohmannArrivalSpeed(mu: number, departureRadiusM: number, arrivalRadiusM: number, inclinationDeg: number): number {
  positive('Gravitational parameter', mu)
  positive('Departure radius', departureRadiusM)
  positive('Arrival radius', arrivalRadiusM)
  if (!Number.isFinite(inclinationDeg) || inclinationDeg < 0 || inclinationDeg > 180) {
    throw new RangeError('Arrival inclination must be finite and between 0 and 180 degrees.')
  }
  const receivingSpeed = circularSpeed(mu, arrivalRadiusM)
  const transferSpeed = receivingSpeed * Math.sqrt(2 / (1 + arrivalRadiusM / departureRadiusM))
  // Equivalent to the cosine rule without subtracting nearly equal squares.
  const transverse = Math.sqrt(receivingSpeed) * (2 * Math.sin(inclinationDeg * Math.PI / 360) * Math.sqrt(transferSpeed))
  return supported(Math.hypot(receivingSpeed - transferSpeed, transverse))
}

/** Hyperbolic arrival to circular parking orbit, or its time-reversed escape. */
export function parkingOrbitBurn(mu: number, parkingRadiusM: number, vInfinity: number): number {
  positive('Gravitational parameter', mu)
  positive('Parking radius', parkingRadiusM)
  nonNegative('Hyperbolic excess speed', vInfinity)
  const speed = circularSpeed(mu, parkingRadiusM)
  return supported(Math.hypot(vInfinity, Math.SQRT2 * speed) - speed)
}

/** Capture into an ellipse with parking periapsis, then circularize there. */
export function splitCapture(mu: number, parkingRadiusM: number, apoapsisRadiusM: number, vInfinity: number): {
  captureToEllipse: number
  circularization: number
} {
  positive('Gravitational parameter', mu)
  positive('Parking radius', parkingRadiusM)
  positive('Apoapsis radius', apoapsisRadiusM)
  nonNegative('Hyperbolic excess speed', vInfinity)
  if (apoapsisRadiusM < parkingRadiusM) throw new RangeError('Apoapsis must be at or above the parking radius.')
  const speed = circularSpeed(mu, parkingRadiusM)
  const ellipseSpeed = speed * Math.sqrt(2 / (1 + parkingRadiusM / apoapsisRadiusM))
  const hyperbolicSpeed = Math.hypot(vInfinity, Math.SQRT2 * speed)
  return {
    captureToEllipse: supported(hyperbolicSpeed - ellipseSpeed),
    circularization: supported(ellipseSpeed - speed),
  }
}

/** Two instantaneous impulses from a nonrotating surface to a circular orbit.
 * This vacuum lower bound omits terrain, thrust/gravity losses, and atmosphere.
 */
export function surfaceOrbitBudget(mu: number, bodyRadiusM: number, parkingRadiusM: number): number {
  positive('Gravitational parameter', mu)
  positive('Body radius', bodyRadiusM)
  positive('Parking radius', parkingRadiusM)
  if (parkingRadiusM < bodyRadiusM) throw new RangeError('Parking radius must be at or above the body radius.')
  const surfaceSpeed = circularSpeed(mu, bodyRadiusM)
  const parkingSpeed = circularSpeed(mu, parkingRadiusM)
  const departure = surfaceSpeed * Math.sqrt(2 / (1 + bodyRadiusM / parkingRadiusM))
  const arrival = parkingSpeed * Math.sqrt(2 / (1 + parkingRadiusM / bodyRadiusM))
  return supported(departure + parkingSpeed - arrival)
}
