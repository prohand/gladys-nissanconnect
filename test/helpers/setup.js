// -----------------------------------------------------------------------------
// The integration as Gladys runs it — src/app.js wiring, the SDK's fake Gladys,
// a fake Nissan cloud and a fake clock — in one call.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { NissanConnectClient } from '../../src/nissan/client.js';
import { PASSWORD, USERNAME, createFakeNissan } from './fakeNissan.js';
import { createFakeClock } from './fakeClock.js';

export const CONFIG = { username: USERNAME, password: PASSWORD };

/**
 * @param {object} [options]
 * @param {object} [options.config] integration config (the account by default)
 * @param {object} [options.nissan] options of createFakeNissan
 * @param {object[]} [options.devices] devices already created in Gladys
 */
export function setup({ config = CONFIG, nissan: nissanOptions, devices } = {}) {
  const nissan = createFakeNissan(nissanOptions);
  const clock = createFakeClock();
  const gladys = createFakeGladys({ config, devices });
  const service = registerHandlers(gladys, {
    createClient: (cfg) =>
      new NissanConnectClient({
        username: cfg.username,
        password: cfg.password,
        fetchImpl: nissan.fetch,
        now: clock.now,
      }),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  return { gladys, nissan, clock, service };
}
