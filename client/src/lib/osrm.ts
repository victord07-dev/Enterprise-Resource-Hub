const OSRM_BASE = "https://router.project-osrm.org";
const CHUNK_SIZE = 100;   // OSRM map-matching limit per request
const GPS_RADIUS_M = 50;  // max GPS accuracy tolerance for snapping (metres)
const TIMEOUT_MS = 15_000;

export type GpsPoint = {
  lat: number | string;
  lng: number | string;
  timestamp?: string | Date;
};

/**
 * Snaps an ordered GPS trace to actual roads using the OSRM map-matching API
 * (`/match/v1/driving`). GPS coordinates are matched against the road network
 * using a Hidden Markov Model, producing a polyline that follows real roads.
 *
 * Large traces (>100 points) are processed in overlapping chunks of 100 so no
 * GPS point is dropped. Each chunk shares its last coordinate with the first
 * coordinate of the next chunk to avoid gaps in the stitched result.
 *
 * Returns Leaflet-ready [lat, lng] pairs. Falls back to raw straight-line
 * coordinates on any network or API error so the map is never blank.
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

    if (sorted.length <= CHUNK_SIZE) {
      return await matchChunk(sorted);
    }

    // Process in overlapping chunks: each chunk's last point is the first point
    // of the next chunk, avoiding gaps between stitched segments.
    const result: [number, number][] = [];
    for (let i = 0; i < sorted.length; i += CHUNK_SIZE - 1) {
      const chunk = sorted.slice(i, i + CHUNK_SIZE);
      const snapped = await matchChunk(chunk);
      if (i === 0) {
        result.push(...snapped);
      } else {
        // Drop the first coord — it is the overlap shared with the end of the
        // previous chunk so we never duplicate a point in the stitched result.
        result.push(...snapped.slice(1));
      }
      if (chunk.length < CHUNK_SIZE) break;
    }
    return result;
  } catch (err: unknown) {
    const isAbort =
      err instanceof Error && err.name === "AbortError";
    console.warn(
      isAbort
        ? "[OSRM] Request timed out — falling back to straight-line polyline"
        : `[OSRM] Map-matching failed (${err instanceof Error ? err.message : String(err)}) — falling back to straight-line polyline`
    );
    return points.map(p => [Number(p.lat), Number(p.lng)]);
  }
}

/** Calls the OSRM map-matching endpoint for a single chunk (≤100 points). */
async function matchChunk(chunk: GpsPoint[]): Promise<[number, number][]> {
  const coordStr = chunk
    .map(p => `${Number(p.lng).toFixed(7)},${Number(p.lat).toFixed(7)}`)
    .join(";");

  const radiuses = chunk.map(() => GPS_RADIUS_M).join(";");

  const params = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    annotations: "false",
    radiuses,
  });

  // Include Unix timestamps when available — OSRM uses them to improve matching.
  const timestamps = chunk
    .map(p => (p.timestamp ? Math.round(new Date(p.timestamp as string).getTime() / 1000) : null))
    .filter((t): t is number => t !== null);

  if (timestamps.length === chunk.length) {
    params.set("timestamps", timestamps.join(";"));
  }

  const url = `${OSRM_BASE}/match/v1/driving/${coordStr}?${params.toString()}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(`OSRM responded with HTTP ${res.status}`);
  }

  const data = await res.json() as {
    code: string;
    matchings?: Array<{ geometry: { coordinates: [number, number][] } }>;
  };

  if (data.code !== "Ok" || !data.matchings?.length) {
    throw new Error(`OSRM code: ${data.code}`);
  }

  // Each matching is a contiguous segment of the trace. Concatenate all
  // segments; GeoJSON coords are [lng, lat] — convert to Leaflet [lat, lng].
  const coords: [number, number][] = [];
  for (const matching of data.matchings) {
    for (const [lng, lat] of matching.geometry.coordinates) {
      coords.push([lat, lng]);
    }
  }
  return coords;
}
