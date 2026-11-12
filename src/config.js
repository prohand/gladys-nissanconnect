// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`; the SDK fetches it (`getConfig()`) and
// pushes every change (`onConfigUpdated`). This module only applies the
// defaults and forces the types, so the rest of the code never deals with
// `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (checked by test/manifest.test.js).
export const DEFAULT_CONFIG = {
  // NissanConnect Services account (the one of the mobile app).
  username: '',
  password: '',
  // Seconds between two reads of the data the Nissan cloud keeps for the car.
  // Gladys polls once a minute at most; slower paces skip polls (see
  // NissanService.pollDevice). Reading the cloud does not wake the car up.
  poll_frequency: 900,
  // Minutes between two wake-ups of the car (it then sends fresh data to the
  // cloud). 0 = only on demand: every wake-up draws on the 12 V battery.
  wake_interval: 0,
  // Unit of the range and the odometer (the API answers in kilometres).
  distance_unit: 'km',
  // Cabin temperature asked for when the climate is started without one.
  climate_temperature: 21,
};

// Bounds of the numeric fields, the same as the manifest `min` / `max`.
const BOUNDS = {
  poll_frequency: [300, 86400],
  wake_interval: [0, 1440],
  climate_temperature: [16, 30],
};

function clamp(key, raw) {
  const [min, max] = BOUNDS[key];
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return DEFAULT_CONFIG[key];
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Merge the user config with the defaults and force the types.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    username: String(raw.username ?? '').trim(),
    password: String(raw.password ?? ''),
    poll_frequency: clamp('poll_frequency', raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency),
    wake_interval: Math.round(
      clamp('wake_interval', raw.wake_interval ?? DEFAULT_CONFIG.wake_interval),
    ),
    distance_unit: raw.distance_unit === 'mile' ? 'mile' : 'km',
    climate_temperature: clamp(
      'climate_temperature',
      raw.climate_temperature ?? DEFAULT_CONFIG.climate_temperature,
    ),
  };
}

/** Whether the account is filled in, i.e. whether there is anything to log in with. */
export function hasCredentials(config) {
  return config.username !== '' && config.password !== '';
}
