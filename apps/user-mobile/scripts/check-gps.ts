// Run: npx tsx scripts/check-gps.ts  (from apps/user-mobile)
import assert from "node:assert/strict";
import {
  TrackAccumulator, decodePolyline, encodePolyline, encodeRouteWithinLimit, haversineM, judgeFix, simplifyRoute,
  paceSecPerKm, routeToSvgPath, type LatLon,
} from "../src/lib/gpsTrack";

// haversine: 1 degree latitude ~ 111.2 km; London->Paris ~ 343.5 km
assert.ok(Math.abs(haversineM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 111195) < 100);
const lp = haversineM({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 });
assert.ok(Math.abs(lp - 343500) < 2000, `london-paris ${lp}`);

// Google's documented polyline example
const ref: LatLon[] = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
const refEnc = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
assert.equal(encodePolyline(ref), refEnc);
assert.deepEqual(decodePolyline(refEnc), ref);

// round trip on a synthetic walk
let la = 12.97;
let lo = 77.59;
const walk: LatLon[] = [];
for (let i = 0; i < 500; i++) {
  la += Math.sin(i / 7) * 0.0002;
  lo += 0.0003;
  walk.push([Math.round(la * 1e5) / 1e5, Math.round(lo * 1e5) / 1e5]);
}
assert.deepEqual(decodePolyline(encodePolyline(walk)), walk);

// jump / quality filter
const f0 = { lat: 12.97, lon: 77.59, t: 0, accuracy: 5 };
assert.equal(judgeFix(f0, { ...f0, lon: 77.5905, t: 5000 }, "run").accepted, true);
assert.equal(judgeFix(f0, { ...f0, lon: 77.5905, t: 5000, accuracy: 50 }, "run").reason, "accuracy");
assert.equal(judgeFix(f0, { ...f0, lat: 13.5, t: 2000 }, "run").reason, "speed");
assert.equal(judgeFix(f0, { ...f0, t: 0 }, "run").reason, "time");
assert.equal(judgeFix(f0, { ...f0, lat: 12.970001, t: 3000 }, "run").reason, "jitter");

// accumulator: steady ~3.3 m/s, a teleport spike is dropped, +20 m climb counted
const acc = new TrackAccumulator("run");
for (let i = 0; i < 100; i++) {
  acc.add({ lat: 12.97 + i * 0.00003, lon: 77.59, t: i * 1000, accuracy: 5, altitude: 900 + (i > 50 ? 20 : 0) });
}
const before = acc.snapshot().distanceM;
assert.equal(acc.add({ lat: 13.2, lon: 77.59, t: 100_000, accuracy: 5 }).accepted, false);
const s = acc.snapshot();
assert.equal(s.distanceM, before);
assert.ok(Math.abs(s.distanceM - 99 * 0.00003 * 111195) < 5, `dist ${s.distanceM}`);
assert.ok(s.elevationGainM >= 10 && s.elevationGainM <= 25, `gain ${s.elevationGainM}`);
assert.equal(Math.round(paceSecPerKm(5000, 1500) ?? 0), 300);

// simplification + size limit
const big: LatLon[] = [];
for (let i = 0; i < 40000; i++) big.push([12 + i * 1e-5 + Math.sin(i / 50) * 1e-4, 77 + Math.cos(i / 80) * 1e-3 + i * 2e-6]);
const lim = encodeRouteWithinLimit(big, 20_000);
assert.ok(lim.length <= 20_000, `len ${lim.length}`);
assert.ok(decodePolyline(lim).length > 10);
assert.ok(simplifyRoute(big, 10).length < big.length);
assert.ok(routeToSvgPath(walk, 300, 200)?.d.startsWith("M"));
console.log("gps checks OK");
