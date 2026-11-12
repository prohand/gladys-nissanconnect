import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeStatus,
  parseBattery,
  parseCockpit,
  parseHvac,
  parseLocation,
  parseLock,
  toDistanceUnit,
} from '../src/nissan/status.js';

test('battery status of a recent car', () => {
  assert.deepEqual(
    parseBattery({
      batteryLevel: 57,
      batteryAutonomy: 151,
      plugStatus: 1,
      chargeStatus: 1.0,
      chargingRemainingTime: 95,
      lastUpdateTime: '2026-11-12T08:30:00Z',
    }),
    {
      batteryLevel: 57,
      range: 151,
      plugged: true,
      charging: true,
      chargeRemainingMinutes: 95,
      lastUpdate: '2026-11-12T08:30:00.000Z',
    },
  );
});

test('the oldest LEAF only give the 12 bars of the gauge', () => {
  assert.equal(parseBattery({ batteryBarLevel: 9 }).batteryLevel, 75);
});

test('negative plug and charge statuses mean unknown, not false', () => {
  const status = parseBattery({ plugStatus: -1, chargeStatus: -1 });
  assert.equal(status.plugged, null);
  assert.equal(status.charging, null);
});

test('missing fields are null and the range falls back to rangeHvacOff', () => {
  const status = parseBattery({ rangeHvacOff: 120 });
  assert.equal(status.batteryLevel, null);
  assert.equal(status.range, 120);
  assert.equal(status.lastUpdate, null);
});

test('climate, cockpit, lock and location', () => {
  assert.deepEqual(parseHvac({ hvacStatus: 'ON', internalTemperature: '19.5' }), {
    climateOn: true,
    indoorTemperature: 19.5,
  });
  assert.deepEqual(parseHvac({}), { climateOn: null, indoorTemperature: null });
  assert.deepEqual(parseCockpit({ totalMileage: 1000 }), { odometer: 1000 });
  assert.deepEqual(parseLock({ lockStatus: 'unlocked' }), { locked: false });
  assert.deepEqual(parseLock({}), { locked: null });
  assert.deepEqual(parseLocation({ gpsLatitude: 1, gpsLongitude: 2 }), {
    latitude: 1,
    longitude: 2,
    locationUpdate: null,
  });
  assert.deepEqual(parseLocation({ gpsLatitude: 1 }), {});
});

test('a value missing now keeps the one known before', () => {
  const merged = mergeStatus(
    { batteryLevel: 50, climateOn: true },
    { batteryLevel: 55, climateOn: null },
  );
  assert.deepEqual(merged, { batteryLevel: 55, climateOn: true });
});

test('distances are converted to miles on demand', () => {
  assert.equal(toDistanceUnit(160.9344, 'mile'), 100);
  assert.equal(toDistanceUnit(100.4, 'km'), 100);
  assert.equal(toDistanceUnit(null, 'km'), null);
});
