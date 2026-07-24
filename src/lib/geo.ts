import { randomInt } from "node:crypto";

/**
 * Location privacy helpers. **Server only** — `node:crypto` is not available in
 * the browser, and this must not run client-side anyway (see below).
 */

const EARTH_RADIUS_M = 6_371_000;

/**
 * Moves a reported point by a random offset of up to `meters`, so the exact
 * position a resident stood at is never written to the database (domain rule 2).
 *
 * Two things make this worth doing carefully rather than approximately:
 *
 * - The randomness is cryptographic. `Math.random()` is a seeded PRNG whose
 *   output stream can be reconstructed from a handful of samples, and enough
 *   published pins would be exactly that — which would let someone undo the
 *   jitter across every report at once.
 * - The offset is uniform over the *disc*, not over (bearing, distance).
 *   Picking a distance uniformly would bunch points towards the centre and
 *   leave the true location as the densest spot in the cloud; taking the square
 *   root of a uniform sample spreads them evenly. Hence `sqrt(u)`.
 *
 * This runs on the server on purpose. Jittering in the browser would show the
 * reporter a pin that jumps away from where they tapped, and a modified client
 * could simply not do it.
 */
export function fuzzCoordinates(
  lat: number,
  lng: number,
  meters: number,
): { lat: number; lng: number } {
  if (meters <= 0) return { lat, lng };

  // Two independent uniforms in [0, 1), drawn from the CSPRNG.
  const uniform = () => randomInt(0, 1_000_000) / 1_000_000;

  const bearing = uniform() * 2 * Math.PI;
  const distance = Math.sqrt(uniform()) * meters;

  const deltaLat = (distance * Math.cos(bearing)) / EARTH_RADIUS_M;
  const deltaLng =
    (distance * Math.sin(bearing)) /
    (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180));

  return {
    lat: clamp(lat + (deltaLat * 180) / Math.PI, -90, 90),
    lng: wrapLongitude(lng + (deltaLng * 180) / Math.PI),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function wrapLongitude(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Great-circle distance in metres. Used for sanity checks, not for querying. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
