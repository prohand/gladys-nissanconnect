import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { vehicleWidgetContent } from '../src/capabilities/widget.js';
import { LEAF } from './helpers/fakeNissan.js';
import { setup } from './helpers/setup.js';

async function connected(options) {
  const context = setup(options);
  await context.gladys.connect();
  context.device = context.gladys.fake.discoveredDevices[0];
  return context;
}

const getContent = (gladys, settings = {}) =>
  gladys.fake.widgetGet('vehicle', { settings, language: 'en', units: 'metric' });

test('the content is rendered exactly as sent', async () => {
  const { gladys } = await connected();
  const ack = await getContent(gladys);
  assert.equal(ack.success, true);
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
});

test('charging, plugged, located: still within the budget', async () => {
  const { gladys, nissan, service, device } = await connected();
  Object.assign(nissan.state.battery[LEAF.vin], {
    plugStatus: 1,
    chargeStatus: 1,
    chargingRemainingTime: 130,
  });
  nissan.state.lock[LEAF.vin] = { lockStatus: 'unlocked' };
  await service.readVehicle(service.vehicles[0]);
  const content = (await getContent(gladys, { device: device.external_id, show_location: true }))
    .data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const status = content.components.find((c) => c.type === 'status');
  const charging = status.items.find((item) => item.label.en === 'Charging');
  assert.equal(charging.value.en, 'Yes — 2 h 10 left');
  assert.equal(charging.value.fr, 'Oui — reste 2 h 10');
  const buttons = content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => b.action?.key ?? 'link'),
    ['wake', 'climate_on', 'charge_off', 'link'],
  );
  assert.match(buttons[3].link.url, /^https:\/\/www\.openstreetmap\.org\/\?mlat=48\.85&mlon=2\.35/);
});

test('the map button stays hidden unless the setting asks for it', async () => {
  const { gladys } = await connected();
  const content = (await getContent(gladys)).data.content;
  assert.ok(!content.components.some((c) => c.link));
});

test('without a car, an explanation instead of an empty card', async () => {
  const { gladys } = setup({ config: {} });
  await gladys.connect();
  const content = (await getContent(gladys)).data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.equal(content.components[0].type, 'text');
});

test('the live tiles are bound to features the car publishes', async () => {
  const { gladys, service, device } = await connected();
  const published = new Set(device.features.map((f) => f.external_id));
  const content = vehicleWidgetContent(service, { settings: {} });
  const bound = content.components.filter((c) => c.device_feature).map((c) => c.device_feature);
  assert.equal(bound.length, 2);
  for (const id of bound) {
    assert.ok(published.has(id), `${id} is not a published feature`);
  }
  assert.ok(gladys.fake.widgetRefreshes.includes('vehicle'), 'reads nudge the widget');
});

test('every button action is handled', async () => {
  const { gladys, nissan, service, device } = await connected();
  nissan.state.battery[LEAF.vin].plugStatus = 1;
  await service.readVehicle(service.vehicles[0]);
  const params = { device: device.external_id };
  for (const actionKey of ['wake', 'climate_on', 'climate_off', 'charge_on', 'charge_off']) {
    const ack = await gladys.fake.widgetAction('vehicle', actionKey, params, { settings: {} });
    assert.equal(ack.success, true, actionKey);
    assert.ok(ack.data.message.en, `${actionKey} answers a toast`);
  }
  const unknown = await gladys.fake.widgetAction('vehicle', 'self_destruct', params, {
    settings: {},
  });
  assert.equal(unknown.success, false);
});
