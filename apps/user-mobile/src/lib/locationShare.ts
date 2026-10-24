/**
 * "Share my location" during a run or ride (Figma train/21 Safety, 24 Oct
 * 2026). Decision: a one-off map link sent through the phone's share sheet
 * to whoever the member picks. Not live tracking (that would need a server
 * that keeps the member's position and a privacy decision); the message says
 * so. Pure (tests/locationShare.check.cjs).
 */
export function mapLink(lat: number, lon: number): string {
  return `https://maps.google.com/?q=${lat.toFixed(5)},${lon.toFixed(5)}`;
}

export function locationShareMessage(activity: string, lat: number, lon: number, time: string): string {
  return `I'm out on a ${activity.toLowerCase()}. Here's where I was at ${time}: ${mapLink(lat, lon)} (this link doesn't update as I move)`;
}
