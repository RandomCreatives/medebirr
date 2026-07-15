/**
 * Geo helpers for the delivery geofence handshake.
 * Distances use the haversine formula on the WGS84 sphere.
 */

function toRad(deg) {
  return (Number(deg) * Math.PI) / 180;
}

/**
 * Great-circle distance between two coordinates in kilometres.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Returns true when the two points are within `radiusMeters`.
 * If either coordinate set is missing/invalid, returns true (cannot check → allow),
 * so the geofence only blocks when we actually have both positions.
 */
function withinRadius(lat1, lon1, lat2, lon2, radiusMeters = 200) {
  const coords = [lat1, lon1, lat2, lon2].map(Number);
  if (coords.some((v) => !isFinite(v))) return true;
  return haversineKm(coords[0], coords[1], coords[2], coords[3]) * 1000 <= radiusMeters;
}

module.exports = { haversineKm, withinRadius };
