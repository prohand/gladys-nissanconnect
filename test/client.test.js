import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NissanConnectClient, isLeaf, parseVehicle } from '../src/nissan/client.js';
import { fillCallbacks } from '../src/nissan/auth.js';
import { NissanApiError, NissanAuthError } from '../src/nissan/errors.js';
import { NISSAN_EU } from '../src/nissan/settings.js';
import { ARIYA, LEAF, PASSWORD, USERNAME, createFakeNissan } from './helpers/fakeNissan.js';
import { createFakeClock } from './helpers/fakeClock.js';

function setup(options = {}, password = PASSWORD) {
  const nissan = createFakeNissan(options);
  const clock = createFakeClock();
  const client = new NissanConnectClient({
    username: USERNAME,
    password,
    fetchImpl: nissan.fetch,
    now: clock.now,
  });
  return { nissan, clock, client };
}

test('logs in through the three ForgeRock steps and lists the cars', async () => {
  const { client, nissan } = setup({ cars: [LEAF, ARIYA] });
  const vehicles = await client.getVehicles();
  assert.deepEqual(vehicles, [
    { vin: LEAF.vin, model: 'LEAF', name: 'My Leaf', canGeneration: 'GEN1' },
    { vin: ARIYA.vin, model: 'Ariya', name: 'Nissan Ariya', canGeneration: null },
  ]);
  const paths = nissan.calls.map((call) => new URL(call.url).pathname);
  assert.ok(paths[0].endsWith('/authenticate'));
  assert.ok(paths[1].endsWith('/authenticate'));
  assert.ok(paths[2].endsWith('/authorize'));
  assert.ok(paths[3].endsWith('/access_token'));
});

test('a wrong password is a NissanAuthError', async () => {
  const { client } = setup({}, 'wrong');
  await assert.rejects(client.getVehicles(), NissanAuthError);
});

test('the login form is filled by callback type, whatever the order', () => {
  const form = {
    callbacks: [
      { type: 'PasswordCallback', input: [{ value: '' }] },
      { type: 'NameCallback', input: [{ value: '' }] },
    ],
  };
  fillCallbacks(form, 'me', 'secret');
  assert.equal(form.callbacks[0].input[0].value, 'secret');
  assert.equal(form.callbacks[1].input[0].value, 'me');
  assert.throws(() => fillCallbacks({}, 'me', 'secret'), NissanApiError);
});

test('an expired token is renewed with the refresh token, without a new login', async () => {
  const { client, clock, nissan } = setup();
  await client.getVehicles();
  const logins = () => nissan.calls.filter((c) => c.url.endsWith('/authenticate')).length;
  assert.equal(logins(), 2);
  clock.advance(2 * 3600 * 1000);
  await client.getBatteryStatus({ vin: LEAF.vin, model: 'LEAF' });
  assert.equal(logins(), 2, 'no new login');
  const refresh = nissan.calls.filter((c) => String(c.init.body).includes('refresh_token'));
  assert.equal(refresh.length, 1);
});

test('a token revoked server-side is replaced and the call retried once', async () => {
  const { client, nissan } = setup();
  await client.getVehicles();
  nissan.revokeTokens();
  const attributes = await client.getCockpit({ vin: LEAF.vin, model: 'LEAF' });
  assert.equal(attributes.totalMileage, 12345.6);
});

test('an HTTP error names the path, never the token', async () => {
  const { client, nissan } = setup();
  nissan.fail('battery-status', 503);
  await assert.rejects(client.getBatteryStatus({ vin: LEAF.vin, model: 'LEAF' }), (err) => {
    assert.ok(err instanceof NissanApiError);
    assert.equal(err.status, 503);
    assert.match(err.message, /battery-status: HTTP 503/);
    assert.doesNotMatch(err.message, /access-/);
    return true;
  });
});

test('the battery read carries the CAN generation when the car has one', async () => {
  const { client, nissan } = setup();
  await client.getBatteryStatus(parseVehicle(LEAF));
  assert.ok(nissan.calls.at(-1).url.endsWith('/battery-status?canGen=GEN1'));
});

test('the LEAF commands go to the NCI back-end, the others to the car adapter', async () => {
  const { client, nissan } = setup({ cars: [LEAF, ARIYA] });
  await client.setClimate(parseVehicle(LEAF), true, 22);
  await client.setClimate(parseVehicle(ARIYA), false, 21);
  await client.setCharging(parseVehicle(ARIYA), true);
  const [leafClimate, ariyaClimate, ariyaCharge] = nissan.commands;
  assert.equal(leafClimate.base, NISSAN_EU.userBaseUrl);
  assert.deepEqual(leafClimate.body, {
    data: { type: 'HvacStart', attributes: { action: 'start', targetTemperature: 22 } },
  });
  assert.equal(ariyaClimate.base, NISSAN_EU.carAdapterBaseUrl);
  assert.equal(ariyaClimate.body.data.attributes.action, 'cancel');
  assert.deepEqual(ariyaCharge.body, {
    data: { type: 'ChargingStart', attributes: { action: 'start' } },
  });
  assert.equal(nissan.calls.at(-1).init.headers['Content-Type'], 'application/vnd.api+json');
});

test('wake-up, position refresh and horn/lights requests', async () => {
  const { client, nissan } = setup();
  const leaf = parseVehicle(LEAF);
  await client.refreshBatteryStatus(leaf);
  await client.refreshLocation(leaf);
  await client.hornLights(leaf, 'horn_lights');
  assert.deepEqual(
    nissan.commands.map((c) => [c.path, c.body.data.type]),
    [
      ['actions/refresh-battery-status', 'RefreshBatteryStatus'],
      ['actions/refresh-location', 'RefreshLocation'],
      ['actions/horn-lights', 'HornLights'],
    ],
  );
  assert.equal(nissan.commands[2].body.data.attributes.target, 'horn_lights');
});

test('parseVehicle and isLeaf', () => {
  assert.equal(parseVehicle({ vin: ' X ', modelName: 'Juke' }).name, 'Nissan Juke');
  assert.equal(isLeaf({ model: 'LEAF e+' }), true);
  assert.equal(isLeaf({ model: 'Ariya' }), false);
});
