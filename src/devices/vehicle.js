// -----------------------------------------------------------------------------
// Device type: one Nissan electric car.
//
// A car of the account is one Gladys device, keyed on its VIN (the only id
// that never changes: a nickname can). Its features use the Gladys
// "electrical vehicle" categories, so the standard device cards, charts and
// "device state" scene triggers apply to them as to any other device.
//
// Feature keys are stored by Gladys (history, scenes, dashboards): never
// rename one, add new ones instead.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
  DEVICE_POLL_FREQUENCIES,
} from '@gladysassistant/integration-sdk';
import { toDistanceUnit } from '../nissan/status.js';

export const DEVICE_TYPE = 'vehicle';

export const FEATURES = Object.freeze({
  BATTERY_LEVEL: 'battery-level',
  RANGE: 'range',
  PLUGGED: 'plugged',
  CHARGING: 'charging',
  CLIMATE: 'climate',
  TARGET_TEMPERATURE: 'target-temperature',
  INDOOR_TEMPERATURE: 'indoor-temperature',
  ODOMETER: 'odometer',
  LOCK: 'lock',
});

/** The device and feature external ids of a car. The VIN is upper case by norm. */
export function vehicleIds(gladys, vin) {
  return gladys.externalIds(DEVICE_TYPE, String(vin).toUpperCase());
}

/**
 * The VIN of a device of this integration, from its external id
 * (`ext:<selector>:vehicle:<VIN>`), or null for anything else.
 */
export function vinFromExternalId(gladys, externalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const vin = externalId.slice(prefix.length).split(':')[0];
  return vin || null;
}

/** The feature key (`charging`…) of a feature external id. */
export function featureKey(externalId) {
  return String(externalId).split(':').pop();
}

const distanceUnit = (config) => (config.distance_unit === 'mile' ? UNITS.MILE : UNITS.KM);

/**
 * Discovery payload of a car.
 * @param {{ vin: string, name: string, model: string }} vehicle
 */
export function buildVehicleDevice(gladys, vehicle, config) {
  const ids = vehicleIds(gladys, vehicle.vin);
  const feature = (key, name, spec) => ({
    name,
    external_id: ids.feature(key),
    has_feedback: false,
    keep_history: true,
    ...spec,
  });
  return {
    name: vehicle.name,
    external_id: ids.device,
    // Polled once a minute; the real pace (poll_frequency, in seconds) is
    // applied by skipping polls, so the user can change it at any time.
    should_poll: true,
    poll_frequency: DEVICE_POLL_FREQUENCIES.EVERY_MINUTES,
    params: [
      { name: 'vin', value: vehicle.vin },
      { name: 'model', value: vehicle.model },
    ],
    // Every feature declares min and max: they are NOT NULL in Gladys.
    features: [
      feature(FEATURES.BATTERY_LEVEL, 'Battery', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_BATTERY,
        type: TYPES.ELECTRICAL_VEHICLE_BATTERY.BATTERY_LEVEL,
        unit: UNITS.PERCENT,
        min: 0,
        max: 100,
        read_only: true,
      }),
      feature(FEATURES.RANGE, 'Range', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_BATTERY,
        type: TYPES.ELECTRICAL_VEHICLE_BATTERY.BATTERY_RANGE_ESTIMATE,
        unit: distanceUnit(config),
        min: 0,
        max: 1000,
        read_only: true,
      }),
      feature(FEATURES.PLUGGED, 'Plugged in', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPES.ELECTRICAL_VEHICLE_CHARGE.PLUGGED,
        min: 0,
        max: 1,
        read_only: true,
      }),
      feature(FEATURES.CHARGING, 'Charging', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
        type: TYPES.ELECTRICAL_VEHICLE_CHARGE.CHARGE_ON,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
      }),
      feature(FEATURES.CLIMATE, 'Climate', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_CLIMATE,
        type: TYPES.ELECTRICAL_VEHICLE_CLIMATE.CLIMATE_ON,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
      }),
      feature(FEATURES.TARGET_TEMPERATURE, 'Climate temperature', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_CLIMATE,
        type: TYPES.ELECTRICAL_VEHICLE_CLIMATE.TARGET_TEMPERATURE,
        unit: UNITS.CELSIUS,
        min: 16,
        max: 30,
        read_only: false,
        keep_history: false,
      }),
      feature(FEATURES.INDOOR_TEMPERATURE, 'Cabin temperature', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_CLIMATE,
        type: TYPES.ELECTRICAL_VEHICLE_CLIMATE.INDOOR_TEMPERATURE,
        unit: UNITS.CELSIUS,
        min: -40,
        max: 80,
        read_only: true,
      }),
      feature(FEATURES.ODOMETER, 'Odometer', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_STATE,
        type: TYPES.ELECTRICAL_VEHICLE_STATE.ODOMETER,
        unit: distanceUnit(config),
        min: 0,
        max: 2000000,
        read_only: true,
      }),
      // Read only: a remote lock needs the car PIN on most models, which this
      // integration never asks for.
      feature(FEATURES.LOCK, 'Locked', {
        category: CATEGORIES.ELECTRICAL_VEHICLE_COMMAND,
        type: TYPES.ELECTRICAL_VEHICLE_COMMAND.LOCK,
        min: 0,
        max: 1,
        read_only: true,
      }),
    ],
  };
}

const bit = (value) => (value === null || value === undefined ? null : value ? 1 : 0);

/**
 * The states of a car status, in the publishStates format. Unknown values
 * are left out: Gladys keeps the last one it had.
 */
export function vehicleStates(gladys, vin, status, config, targetTemperature) {
  const ids = vehicleIds(gladys, vin);
  const values = {
    [FEATURES.BATTERY_LEVEL]: status.batteryLevel,
    [FEATURES.RANGE]: toDistanceUnit(status.range, config.distance_unit),
    [FEATURES.PLUGGED]: bit(status.plugged),
    [FEATURES.CHARGING]: bit(status.charging),
    [FEATURES.CLIMATE]: bit(status.climateOn),
    [FEATURES.TARGET_TEMPERATURE]: targetTemperature,
    [FEATURES.INDOOR_TEMPERATURE]: status.indoorTemperature,
    [FEATURES.ODOMETER]: toDistanceUnit(status.odometer, config.distance_unit),
    [FEATURES.LOCK]: bit(status.locked),
  };
  return Object.entries(values)
    .filter(([, state]) => typeof state === 'number' && Number.isFinite(state))
    .map(([key, state]) => ({ device_feature_external_id: ids.feature(key), state }));
}
