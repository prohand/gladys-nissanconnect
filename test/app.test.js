import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, vehicleIds } from '../src/devices/vehicle.js';
import { ARIYA, LEAF } from './helpers/fakeNissan.js';
import { setup } from './helpers/setup.js';

const MINUTE = 60_000;

test('on connection: logs in, publishes the car, reads it and reports connected', async () => {
  const { gladys } = setup();
  await gladys.connect();

  const [device] = gladys.fake.discoveredDevices;
  const ids = vehicleIds(gladys, LEAF.vin);
  assert.equal(device.external_id, ids.device);
  assert.equal(device.name, 'My Leaf');
  assert.equal(device.poll_frequency, 60000);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.BATTERY_LEVEL)), 80);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.RANGE)), 200);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.PLUGGED)), 0);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.CLIMATE)), 0);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.INDOOR_TEMPERATURE)), 18);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.ODOMETER)), 12346);
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.TARGET_TEMPERATURE)), 21);
  // No lock status on this car: nothing published rather than a made-up value.
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.LOCK)), undefined);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.deepEqual(gladys.fake.transports, [
    { device_external_id: ids.device, transport: 'cloud' },
  ]);
});

test('without an account: no device, and the status says what to fill in', async () => {
  const { gladys, nissan } = setup({ config: {} });
  await gladys.connect();
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /identifiant et le mot de passe/);
  assert.equal(nissan.calls.length, 0);
});

test('a refused password is reported as such', async () => {
  const { gladys } = setup({ config: { username: 'driver@example.com', password: 'nope' } });
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the login or password/);
});

test('the distance unit converts range and odometer', async () => {
  const { gladys } = setup({
    config: { username: 'driver@example.com', password: 'correct horse', distance_unit: 'mile' },
  });
  await gladys.connect();
  const ids = vehicleIds(gladys, LEAF.vin);
  const range = gladys.fake.discoveredDevices[0].features.find(
    (f) => f.external_id === ids.feature(FEATURES.RANGE),
  );
  assert.equal(range.unit, 'mile');
  assert.equal(gladys.fake.lastState(ids.feature(FEATURES.RANGE)), 124);
});

test('polls read at the configured pace, not at every Gladys tick', async () => {
  const { gladys, nissan, clock } = setup();
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  const reads = () => nissan.calls.filter((c) => c.url.includes('/battery-status')).length;
  assert.equal(reads(), 1);

  clock.advance(MINUTE);
  await gladys.fake.poll(device);
  assert.equal(reads(), 1, 'not due yet');

  clock.advance(14 * MINUTE);
  await gladys.fake.poll(device);
  assert.equal(reads(), 2, 'due after poll_frequency (900 s)');
});

test('wake-ups follow wake_interval, and never by default', async () => {
  const { gladys, nissan, clock } = setup();
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  const wakes = () =>
    nissan.commands.filter((c) => c.path.endsWith('refresh-battery-status')).length;
  clock.advance(60 * MINUTE);
  await gladys.fake.poll(device);
  assert.equal(wakes(), 0);

  await gladys.fake.configUpdated({
    username: 'driver@example.com',
    password: 'correct horse',
    wake_interval: 60,
  });
  await gladys.fake.poll(device);
  assert.equal(wakes(), 1);
  clock.advance(30 * MINUTE);
  await gladys.fake.poll(device);
  assert.equal(wakes(), 1, 'not due yet');
  clock.advance(30 * MINUTE);
  await gladys.fake.poll(device);
  assert.equal(wakes(), 2);
});

test('charge and plug transitions fire one scene event each, never on the first read', async () => {
  const { gladys, nissan, clock } = setup();
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  assert.deepEqual(gladys.fake.sceneEvents, []);

  Object.assign(nissan.state.battery[LEAF.vin], {
    plugStatus: 1,
    chargeStatus: 1,
    batteryLevel: 81,
  });
  clock.advance(15 * MINUTE);
  await gladys.fake.poll(device);
  const events = gladys.fake.sceneEvents.map((e) => [e.key, e.data.event]);
  assert.deepEqual(events.sort(), [
    ['charging_changed', 'started'],
    ['plug_changed', 'plugged'],
  ]);
  const charging = gladys.fake.sceneEvents.find((e) => e.key === 'charging_changed');
  assert.deepEqual(charging.data, {
    device: device.external_id,
    device_name: 'My Leaf',
    battery_level: 81,
    range: 200,
    event: 'started',
  });

  // Same values at the next read: no new event.
  clock.advance(15 * MINUTE);
  await gladys.fake.poll(device);
  assert.equal(gladys.fake.sceneEvents.length, 2);
});

test('climate from the device card: command sent, state shown, then confirmed by a read', async () => {
  const { gladys, nissan, clock } = setup();
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  const climate = device.features.find((f) => f.external_id.endsWith(':climate'));
  const target = device.features.find((f) => f.external_id.endsWith(':target-temperature'));

  assert.deepEqual(await gladys.fake.setValue(device, target, 23.5), { success: true });
  assert.deepEqual(await gladys.fake.setValue(device, climate, 1), { success: true });
  assert.deepEqual(nissan.commands.at(-1).body.data.attributes, {
    action: 'start',
    targetTemperature: 23.5,
  });
  assert.equal(gladys.fake.lastState(climate.external_id), 1);

  nissan.state.hvac[LEAF.vin].hvacStatus = 'on';
  const before = nissan.calls.length;
  clock.advance(2 * MINUTE);
  await clock.runDue();
  assert.ok(nissan.calls.length > before, 'confirmation read');
  assert.equal(gladys.fake.lastState(climate.external_id), 1);
});

test('a read-only feature cannot be controlled', async () => {
  const { gladys } = setup();
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  const battery = device.features.find((f) => f.external_id.endsWith(':battery-level'));
  const ack = await gladys.fake.setValue(device, battery, 50);
  assert.equal(ack.success, false);
});

test('a failed read turns the badge unreachable, and old car data degraded', async () => {
  const { gladys, nissan, clock } = setup();
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  for (const path of ['battery-status', 'hvac-status', 'cockpit', 'lock-status', 'location']) {
    nissan.fail(path, 503);
  }
  clock.advance(15 * MINUTE);
  await gladys.fake.poll(device);
  assert.equal(gladys.fake.transports.at(-1).transport, 'unreachable');

  nissan.state.battery[LEAF.vin].lastUpdateTime = new Date(
    clock.now() - 30 * 3600 * 1000,
  ).toISOString();
  clock.advance(15 * MINUTE);
  await gladys.fake.poll(device);
  const last = gladys.fake.transports.at(-1);
  assert.equal(last.transport, 'cloud');
  assert.equal(last.degraded, true);
  assert.match(last.message.en, /no data for 30 h/);
});

test('a device created in Gladys is served even when the account cannot be listed', async () => {
  const { gladys, nissan, service } = setup({ nissan: { cars: [LEAF] } });
  nissan.fail('/cars', 503, 1);
  await gladys.connect();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  const external_id = vehicleIds(gladys, LEAF.vin).device;
  const device = {
    external_id,
    name: 'My Leaf',
    params: [
      { name: 'vin', value: LEAF.vin },
      { name: 'model', value: 'LEAF' },
    ],
  };
  assert.equal(service.findVehicle(device).vin, LEAF.vin);
  assert.equal(await service.pollDevice(device), true);
  assert.equal(gladys.fake.connectionStatus.connected, true, 'a working read reconnects');
});

test('the test_connection action lists the cars of the account', async () => {
  const { gladys } = setup({
    nissan: { cars: [LEAF, ARIYA], battery: {}, hvac: {}, cockpit: {}, location: {} },
  });
  await gladys.connect();
  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.en, /2 cars — My Leaf \(SJNFAAZE1U0000001\), Nissan Ariya/);
  assert.match(ack.data.message.de, /2 Autos/);
  assert.match(ack.data.message.es, /2 coches/);
});

test('wake_vehicle and identify actions', async () => {
  const { gladys, nissan } = setup();
  await gladys.connect();
  const device = gladys.fake.discoveredDevices[0].external_id;

  const wake = await gladys.fake.action('wake_vehicle', { device });
  assert.match(wake.data.message.fr, /My Leaf a reçu la demande/);
  const identify = await gladys.fake.action('identify', { device });
  assert.match(identify.data.message.en, /flashing its lights/);
  assert.deepEqual(
    nissan.commands.map((c) => c.path),
    ['actions/refresh-battery-status', 'actions/refresh-location', 'actions/horn-lights'],
  );

  const unknown = await gladys.fake.action('identify', {
    device: 'ext:test-integration:vehicle:NOPE',
  });
  assert.match(unknown.data.message.en, /not \(or no longer\)/);
});

test('shutdown clears the pending confirmations', async () => {
  const { gladys, clock, service } = setup();
  gladys.handleShutdown(() => service.stop());
  await gladys.connect();
  const [device] = gladys.fake.discoveredDevices;
  const climate = device.features.find((f) => f.external_id.endsWith(':climate'));
  await gladys.fake.setValue(device, climate, 1);
  assert.equal(clock.pending, 1);
  await gladys.fake.shutdown('SIGTERM');
  assert.equal(clock.pending, 0);
});
