const OSRM_BASE = "https://router.project-osrm.org";
const MAX_WAYPOINTS = 100;
const TIMEOUT_MS = 15000;

export type GpsPoint = {
  lat: number | string;
  lng: number | string;
  timestamp?: string | Date;
};

/**
 * Snaps an ordered GPS trace to actual roads using the OSRM public routing engine
 * (OpenStreetMap data, global coverage including India).
 *
 * Approach: sends the GPS waypoints to the OSRM /route endpoint, which finds
 * the road-following path through each waypoint in order. This produces a
 * polyline that follows actual roads instead of straight lines between points.
 *
 * For large traces (>100 points) the input is sampled down to 100 evenly-
 * spaced waypoints (first + last always preserved) so the OSRM request stays
 * within a reasonable size while retaining all major direction changes.
 *
 * Returns [lat, lng] pairs suitable for Leaflet. Falls back to raw GPS
 * coordinates (straight-line) on any error so the map never goes blank.
 */
export async function snapToRoads(points: GpsPoint[]): Promise<[number, number][]> {
  if (points.length < 2) {
    return points.map(p => [Number(p.lat), Number(p.lng)]);
  }

  try {
    const sorted = [...points].sort((a, b) => {
      if (!a.timestamp || !b.timestamp) return 0;
      return (
        new Date(a.timestamp as string).getTime() -
        new Date(b.timestamp as string).getTime()
      );
    });

    const sampled = sampleWaypoints(sorted, MAX_WAYPOINTS);

    const coordStr = sampled
      .map(p => `${Number(p.lng).toFixed(7)},${Number(p.lat).toFixed(7)}`)
      .join(";");

    const url =
      `${OSRM_BASE}/route/v1/driving/${coordStr}` +
      `?geometries=geojson&overview=full&steps=false`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) throw new Error(`OSRM responded with HTTP ${res.status}`);

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error(`OSRM code: ${data.code}`);
    }

    return (data.routes[0].geometry.coordinates as [number, number][]).map(
      ([lng, lat]) => [lat, lng]
    );
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError";
    console.warn(
      isTimeout
        ? "[OSRM] Request timed out — falling back to straight-line polyline"
        : `[OSRM] Road snapping failed (${err?.message ?? err}) — falling back to straight-line polyline`
    );
    return points.map(p => [Number(p.lat), Number(p.lng)]);
  }
}

function sampleWaypoints(points: GpsPoint[], maxCount: number): GpsPoint[] {
  if (points.length <= maxCount) return points;
  const result: GpsPoint[] = [points[0]];
  const step = (points.length - 2) / (maxCount - 2);
  for (let i = 1; i < maxCount - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}
