import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasCredentials, normalizeConfig } from '../src/config.js';

test('an empty config gets the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(hasCredentials(normalizeConfig()), false);
});

test('numbers typed as strings are converted and kept within bounds', () => {
  const config = normalizeConfig({
    poll_frequency: '60',
    wake_interval: '99999',
    climate_temperature: 'warm',
  });
  assert.equal(config.poll_frequency, 300);
  assert.equal(config.wake_interval, 1440);
  assert.equal(config.climate_temperature, 21);
});

test('the login is trimmed, the password kept as typed', () => {
  const config = normalizeConfig({ username: '  me@example.com ', password: ' p ' });
  assert.equal(config.username, 'me@example.com');
  assert.equal(config.password, ' p ');
  assert.equal(hasCredentials(config), true);
});

test('only "mile" switches the distance unit', () => {
  assert.equal(normalizeConfig({ distance_unit: 'mile' }).distance_unit, 'mile');
  assert.equal(normalizeConfig({ distance_unit: 'parsec' }).distance_unit, 'km');
});
