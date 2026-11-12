// -----------------------------------------------------------------------------
// From the Nissan answers to one plain vehicle status.
//
// Every car does not answer every endpoint (a LEAF has no lock status, an
// e-POWER no charge), and a field can be missing from one answer to the next:
// every parser returns only what it found, `null` never overwrites a known
// value (see mergeStatus).
// -----------------------------------------------------------------------------

/** A finite number, or null. */
function num(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A valid ISO date string, or null. */
function isoDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * `GET battery-status`.
 *
 * - `batteryLevel` is a percentage; the oldest LEAF only give
 *   `batteryBarLevel`, the 12 bars of the dashboard gauge;
 * - `plugStatus`: 0 unplugged, 1 plugged, negative = unknown;
 * - `chargeStatus`: 0 not charging, above 0 charging, negative = error.
 */
export function parseBattery(attributes = {}) {
  let batteryLevel = num(attributes.batteryLevel);
  const bars = num(attributes.batteryBarLevel);
  if (batteryLevel === null && bars !== null) {
    batteryLevel = Math.round((bars * 100) / 12);
  }
  const plug = num(attributes.plugStatus);
  const charge = num(attributes.chargeStatus);
  return {
    batteryLevel:
      batteryLevel === null ? null : Math.min(100, Math.max(0, Math.round(batteryLevel))),
    range: num(attributes.batteryAutonomy ?? attributes.rangeHvacOff),
    plugged: plug === null || plug < 0 ? null : plug > 0,
    charging: charge === null || charge < 0 ? null : charge > 0,
    chargeRemainingMinutes: num(attributes.chargingRemainingTime),
    lastUpdate: isoDate(attributes.lastUpdateTime ?? attributes.timestamp),
  };
}

/** `GET hvac-status`. */
export function parseHvac(attributes = {}) {
  const status = typeof attributes.hvacStatus === 'string' ? attributes.hvacStatus : null;
  return {
    climateOn: status === null ? null : status.toLowerCase() === 'on',
    indoorTemperature: num(attributes.internalTemperature),
  };
}

/** `GET cockpit`. */
export function parseCockpit(attributes = {}) {
  return { odometer: num(attributes.totalMileage) };
}

/** `GET lock-status`. */
export function parseLock(attributes = {}) {
  const status = typeof attributes.lockStatus === 'string' ? attributes.lockStatus : null;
  return { locked: status === null ? null : status.toLowerCase() === 'locked' };
}

/** `GET location`. */
export function parseLocation(attributes = {}) {
  const latitude = num(attributes.gpsLatitude);
  const longitude = num(attributes.gpsLongitude);
  if (latitude === null || longitude === null) {
    return {};
  }
  return { latitude, longitude, locationUpdate: isoDate(attributes.lastUpdateTime) };
}

/**
 * Merge the parts read now into the status known so far: a value read
 * replaces the old one, a missing (null) one keeps it.
 */
export function mergeStatus(previous = {}, ...parts) {
  const merged = { ...previous };
  for (const part of parts) {
    for (const [key, value] of Object.entries(part ?? {})) {
      if (value !== null && value !== undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

const KM_PER_MILE = 1.609344;

/** A distance in kilometres, in the unit of the configuration. */
export function toDistanceUnit(km, unit) {
  if (km === null || km === undefined) {
    return null;
  }
  return Math.round(unit === 'mile' ? km / KM_PER_MILE : km);
}
