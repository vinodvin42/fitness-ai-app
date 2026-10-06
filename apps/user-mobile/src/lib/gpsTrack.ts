/**
 * Pure GPS-track helpers (no React / expo imports) so they can be checked with
 * `npx tsx scripts/check-gps.ts`.
 */
export interface GpsFix {
  lat: number;
  lon: number;
  /** ms epoch */
  t: number;
  /** horizontal accuracy in metres, if known */
  accuracy?: number | null;
  /** altitude in metres, if known */
  altitude?: number | null;
}
export type LatLon = [number, number];

export const MAX_ACCURACY_M = 30;
/** Fastest plausible sustained speeds (m/s): ~43 km/h running, ~90 km/h riding. */
export const MAX_SPEED_MPS = { run: 12, ride: 25 } as const;
/** Ignore sub-metre GPS jitter. */
const MIN_STEP_M = 1;
/** Server limit for routePolyline is 200_000 chars; stay well inside it. */
export const MAX_POLYLINE_CHARS = 150_000;

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type RejectReason = "accuracy" | "time" | "speed" | "jitter" | "invalid";

export interface FixDecision {
  accepted: boolean;
  reason?: RejectReason;
}

/** Decide whether `fix` is a credible next point after `prev` (null = first fix). */
export function judgeFix(prev: GpsFix | null, fix: GpsFix, kind: "run" | "ride"): FixDecision {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon) || Math.abs(fix.lat) > 90 || Math.abs(fix.lon) > 180) {
    return { accepted: false, reason: "invalid" };
  }
  if (fix.accuracy != null && (fix.accuracy < 0 || fix.accuracy > MAX_ACCURACY_M)) return { accepted: false, reason: "accuracy" };
  if (!prev) return { accepted: true };
  const dt = (fix.t - prev.t) / 1000;
  if (dt <= 0) return { accepted: false, reason: "time" };
  const d = haversineM(prev, fix);
  if (d / dt > MAX_SPEED_MPS[kind]) return { accepted: false, reason: "speed" };
  if (d < MIN_STEP_M) return { accepted: false, reason: "jitter" };
  return { accepted: true };
}

export interface TrackSnapshot {
  distanceM: number;
  elevationGainM: number;
  points: number;
}

/** Accumulates accepted fixes: distance, smoothed elevation gain and the route. */
export class TrackAccumulator {
  private last: GpsFix | null = null;
  private route: LatLon[] = [];
  private distance = 0;
  private altWindow: number[] = [];
  private smoothedRef: number | null = null;
  private gain = 0;
  rejected = 0;

  constructor(private readonly kind: "run" | "ride") {}

  /** Call after a pause so the gap isn't counted as a jump. */
  breakSegment() {
    this.last = null;
  }

  add(fix: GpsFix): FixDecision {
    const decision = judgeFix(this.last, fix, this.kind);
    if (!decision.accepted) {
      this.rejected += 1;
      return decision;
    }
    if (this.last) this.distance += haversineM(this.last, fix);
    this.last = fix;
    this.route.push([fix.lat, fix.lon]);
    if (fix.altitude != null && Number.isFinite(fix.altitude)) this.addAltitude(fix.altitude);
    return decision;
  }

  // 5-sample moving average + 3 m hysteresis so GPS altitude noise doesn't inflate gain.
  private addAltitude(alt: number) {
    this.altWindow.push(alt);
    if (this.altWindow.length > 5) this.altWindow.shift();
    const avg = this.altWindow.reduce((s, v) => s + v, 0) / this.altWindow.length;
    if (this.smoothedRef == null) {
      this.smoothedRef = avg;
      return;
    }
    if (avg - this.smoothedRef >= 3) {
      this.gain += avg - this.smoothedRef;
      this.smoothedRef = avg;
    } else if (this.smoothedRef - avg >= 3) {
      this.smoothedRef = avg;
    }
  }

  snapshot(): TrackSnapshot {
    return { distanceM: this.distance, elevationGainM: Math.round(this.gain), points: this.route.length };
  }

  getRoute(): LatLon[] {
    return this.route.slice();
  }
}

/** Seconds per km, or null when there's no usable distance. */
export function paceSecPerKm(distanceM: number, movingSeconds: number): number | null {
  if (distanceM < 10 || movingSeconds <= 0) return null;
  return movingSeconds / (distanceM / 1000);
}
export function speedKmh(distanceM: number, movingSeconds: number): number | null {
  if (distanceM < 10 || movingSeconds <= 0) return null;
  return distanceM / 1000 / (movingSeconds / 3600);
}

// ---- Google encoded polyline (precision 5) ----

function encodeValue(v: number, out: string[]) {
  let n = v < 0 ? ~(v << 1) : v << 1;
  while (n >= 0x20) {
    out.push(String.fromCharCode((0x20 | (n & 0x1f)) + 63));
    n >>= 5;
  }
  out.push(String.fromCharCode(n + 63));
}

export function encodePolyline(points: LatLon[]): string {
  const out: string[] = [];
  let pLat = 0;
  let pLon = 0;
  for (const [lat, lon] of points) {
    const la = Math.round(lat * 1e5);
    const lo = Math.round(lon * 1e5);
    encodeValue(la - pLat, out);
    encodeValue(lo - pLon, out);
    pLat = la;
    pLon = lo;
  }
  return out.join("");
}

export function decodePolyline(str: string): LatLon[] {
  const pts: LatLon[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= str.length) return null;
      b = str.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    const dLat = next();
    const dLon = next();
    if (dLat == null || dLon == null) break;
    lat += dLat;
    lon += dLon;
    pts.push([lat / 1e5, lon / 1e5]);
  }
  return pts;
}

// ---- Douglas-Peucker (tolerance in metres, local equirectangular projection) ----

export function simplifyRoute(points: LatLon[], toleranceM: number): LatLon[] {
  if (points.length < 3 || toleranceM <= 0) return points.slice();
  const lat0 = rad(points[0][0]);
  const xy = points.map(([la, lo]) => [R * rad(lo) * Math.cos(lat0), R * rad(la)] as const);
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop() as [number, number];
    let maxD = 0;
    let idx = -1;
    const [x1, y1] = xy[s];
    const [x2, y2] = xy[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    for (let k = s + 1; k < e; k++) {
      const [x, y] = xy[k];
      let t = len2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return points.filter((_, k) => keep[k] === 1);
}

/** Encode a route, simplifying with growing tolerance until it fits `maxChars`. */
export function encodeRouteWithinLimit(points: LatLon[], maxChars: number = MAX_POLYLINE_CHARS): string {
  let encoded = encodePolyline(points);
  if (encoded.length <= maxChars) return encoded;
  let tol = 1;
  let pts = points;
  while (encoded.length > maxChars && tol < 5000) {
    pts = simplifyRoute(points, tol);
    encoded = encodePolyline(pts);
    tol *= 2;
  }
  if (encoded.length > maxChars) {
    // Last resort: uniform decimation (always keep the final point).
    const step = Math.ceil(pts.length / Math.floor(maxChars / 12));
    const dec = pts.filter((_, k) => k % step === 0 || k === pts.length - 1);
    encoded = encodePolyline(dec);
  }
  return encoded;
}

/** Normalize points into an SVG path within a width x height box (padding in px). Null if < 2 points. */
export function routeToSvgPath(
  points: LatLon[],
  width: number,
  height: number,
  pad = 12,
): { d: string; start: [number, number]; end: [number, number] } | null {
  if (points.length < 2) return null;
  const lat0 = rad(points.reduce((s, p) => s + p[0], 0) / points.length);
  const proj = points.map(([la, lo]) => [rad(lo) * Math.cos(lat0), -rad(la)] as [number, number]);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of proj) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const w = maxX - minX || 1e-9;
  const h = maxY - minY || 1e-9;
  const scale = Math.min((width - 2 * pad) / w, (height - 2 * pad) / h);
  const offX = (width - w * scale) / 2;
  const offY = (height - h * scale) / 2;
  const sp = proj.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale] as [number, number]);
  const d = sp.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return { d, start: sp[0], end: sp[sp.length - 1] };
}
