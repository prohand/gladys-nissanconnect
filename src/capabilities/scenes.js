// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+, manifest `scene_actions`).
//
// The scene TRIGGERS are fired by NissanService.fireEvents, on the transitions
// it reads (charge started/stopped, plugged/unplugged).
//
// The rules that matter:
//   - `fields` arrive RESOLVED (scene variables substituted, defaults applied);
//     `device` is the chosen car's device external id;
//   - a Nissan refusal is an OUTPUT (`accepted: false`), never a thrown error:
//     a scene action is not a condition, the scene author gates on the output.
//     Only a car that does not exist (configuration problem) throws;
//   - no action ever fires a scene event itself: a scene bound to that event
//     would loop through the integration. The events come from reads only.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { SCENE_ACTION_KEYS } from './keys.js';
import { toDistanceUnit } from '../nissan/status.js';

const logger = createLogger({ name: 'scenes' });

/** Run a command, and turn a Nissan refusal into `{ accepted: false }`. */
async function attempt(label, run) {
  try {
    await run();
    return { accepted: true };
  } catch (err) {
    logger.warn(`${label} refused: ${err.message}`);
    return { accepted: false };
  }
}

export const SCENE_ACTIONS = {
  /** Start or stop the climate, optionally at a given temperature. */
  async [SCENE_ACTION_KEYS.CLIMATE_CONTROL](service, { fields }) {
    const vehicle = service.requireVehicle(fields.device);
    const on = fields.action !== 'stop';
    return attempt('climate_control', () => service.setClimate(vehicle, on, fields.temperature));
  },

  /** Start or stop the charge. */
  async [SCENE_ACTION_KEYS.CHARGING_CONTROL](service, { fields }) {
    const vehicle = service.requireVehicle(fields.device);
    const on = fields.action !== 'stop';
    return attempt('charging_control', () => service.setCharging(vehicle, on));
  },

  /**
   * Read the car now (optionally waking it first) and hand its status to the
   * following actions of the scene: "if battery_level < 30, notify me".
   */
  async [SCENE_ACTION_KEYS.REFRESH_STATUS](service, { fields }) {
    const vehicle = service.requireVehicle(fields.device);
    if (fields.wake === true) {
      await service.wakeVehicle(vehicle).catch((err) => logger.warn(`wake-up: ${err.message}`));
    }
    const status = (await service.safeRead(vehicle)) ?? service.statuses.get(vehicle.vin) ?? {};
    await service.publishTransports();
    // Booleans as such, unknown values as null: never a made-up 0.
    return {
      battery_level: status.batteryLevel ?? null,
      range: toDistanceUnit(status.range, service.config.distance_unit),
      plugged: typeof status.plugged === 'boolean' ? status.plugged : null,
      charging: typeof status.charging === 'boolean' ? status.charging : null,
    };
  },

  /** Flash the lights, or flash and sound the horn. */
  async [SCENE_ACTION_KEYS.HORN_LIGHTS](service, { fields }) {
    const vehicle = service.requireVehicle(fields.device);
    const target = fields.target === 'horn_lights' ? 'horn_lights' : 'lights';
    return attempt('horn_lights', () => service.hornLights(vehicle, target));
  },
};
