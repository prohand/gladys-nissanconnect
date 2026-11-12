import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LEAF } from './helpers/fakeNissan.js';
import { setup } from './helpers/setup.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const outputsOf = (key) =>
  manifest.scene_actions
    .find((action) => action.key === key)
    .outputs.map((o) => o.key)
    .sort();

async function connected(options) {
  const context = setup(options);
  await context.gladys.connect();
  context.device = context.gladys.fake.discoveredDevices[0].external_id;
  return context;
}

test('climate_control starts the climate at the asked temperature', async () => {
  const { gladys, nissan, device } = await connected();
  const ack = await gladys.fake.sceneAction('climate_control', {
    device,
    action: 'start',
    temperature: 19,
  });
  assert.deepEqual(ack, { success: true, data: { outputs: { accepted: true } } });
  assert.deepEqual(nissan.commands.at(-1).body.data.attributes, {
    action: 'start',
    targetTemperature: 19,
  });
  assert.deepEqual(Object.keys(ack.data.outputs).sort(), outputsOf('climate_control'));
});

test('a Nissan refusal is an output, not a failed scene action', async () => {
  const { gladys, nissan, device } = await connected();
  nissan.fail('charging-start', 409);
  const ack = await gladys.fake.sceneAction('charging_control', { device, action: 'start' });
  assert.deepEqual(ack, { success: true, data: { outputs: { accepted: false } } });
});

test('an unknown car fails the action: that is a configuration problem', async () => {
  const { gladys } = await connected();
  const ack = await gladys.fake.sceneAction('horn_lights', {
    device: 'ext:test-integration:vehicle:UNKNOWN',
    target: 'lights',
  });
  assert.equal(ack.success, false);
});

test('refresh_status hands the declared outputs to the scene', async () => {
  const { gladys, nissan, device } = await connected();
  nissan.state.battery[LEAF.vin].plugStatus = 1;
  const ack = await gladys.fake.sceneAction('refresh_status', { device, wake: true });
  assert.deepEqual(ack.data.outputs, {
    battery_level: 80,
    range: 200,
    plugged: true,
    charging: false,
  });
  assert.deepEqual(Object.keys(ack.data.outputs).sort(), outputsOf('refresh_status'));
  assert.ok(nissan.commands.some((c) => c.path.endsWith('refresh-battery-status')));
});

test('horn_lights sends the chosen signal', async () => {
  const { gladys, nissan, device } = await connected();
  const ack = await gladys.fake.sceneAction('horn_lights', { device, target: 'horn_lights' });
  assert.deepEqual(ack.data.outputs, { accepted: true });
  assert.equal(nissan.commands.at(-1).body.data.attributes.target, 'horn_lights');
});

test('scene event data only carries keys the triggers declare', async () => {
  const { gladys, nissan, clock, device } = await connected();
  Object.assign(nissan.state.battery[LEAF.vin], { plugStatus: 1, chargeStatus: 1 });
  clock.advance(15 * 60_000);
  await gladys.fake.poll(gladys.fake.discoveredDevices[0]);
  assert.equal(gladys.fake.sceneEvents.length, 2);
  for (const event of gladys.fake.sceneEvents) {
    const trigger = manifest.scene_triggers.find((t) => t.key === event.key);
    const declared = new Set([
      ...trigger.fields.map((f) => f.key),
      ...trigger.variables.map((v) => v.key),
    ]);
    for (const key of Object.keys(event.data)) {
      assert.ok(declared.has(key), `${event.key}: "${key}" is not declared`);
    }
    assert.equal(event.data.device, device);
  }
});
