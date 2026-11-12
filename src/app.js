// -----------------------------------------------------------------------------
// SDK wiring: every Gladys handler, registered on a GladysIntegration, routed
// to the NissanService. No Nissan logic here.
//
// Kept out of index.js so the tests run the very same wiring against the
// SDK's fake Gladys (`@gladysassistant/integration-sdk/testing`).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { NissanService } from './service.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { VEHICLE_WIDGET } from './capabilities/keys.js';
import { vehicleWidgetAction, vehicleWidgetContent } from './capabilities/widget.js';
import { lightsFlashed, MESSAGES, unreachable, wakeSent } from './messages.js';

const logger = createLogger({ name: 'app' });

/** Turn a failed manual action into the message shown under its button. */
async function answer(run) {
  try {
    return await run();
  } catch (err) {
    logger.warn(`Action failed: ${err.message}`);
    // The service's own "fix the setup" errors keep their translated text.
    const known = [MESSAGES.unknownVehicle, MESSAGES.notConfigured].find(
      (message) => message.en === err.message,
    );
    return known ?? unreachable(err.message);
  }
}

/**
 * Register every handler on `gladys` and return the service behind them.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {ConstructorParameters<typeof NissanService>[0]} [options] service options (tests)
 */
export function registerHandlers(gladys, options = {}) {
  const service = new NissanService({ gladys, ...options });

  // --- Discovery ---------------------------------------------------------------
  gladys.onScanRequest(async () => {
    await service.publishDevices();
  });

  // --- Commands from the device cards ------------------------------------------
  gladys.onSetValue(async (device, feature, value) => {
    logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
    await service.setValue(device, feature, value);
  });

  // --- Polling (once a minute; the service applies the configured pace) -------
  gladys.onPoll(async (device) => {
    if (!(await service.pollDevice(device))) {
      logger.debug(`onPoll skipped (not due) for ${device.external_id}`);
    }
  });

  // --- Manifest actions (Configuration screen) ---------------------------------
  gladys.onAction('test_connection', () => service.testConnection());

  gladys.onAction('wake_vehicle', (fields) =>
    answer(async () => {
      const vehicle = service.requireVehicle(fields.device);
      await service.wakeVehicle(vehicle);
      return wakeSent(vehicle.name);
    }),
  );

  gladys.onAction('identify', (fields) =>
    answer(async () => {
      const vehicle = service.requireVehicle(fields.device);
      await service.hornLights(vehicle, 'lights');
      return lightsFlashed(vehicle.name);
    }),
  );

  // --- Scene actions -------------------------------------------------------------
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(service, { fields }));
  }

  // --- Dashboard widget ----------------------------------------------------------
  gladys.onWidgetGet(VEHICLE_WIDGET, (request) => vehicleWidgetContent(service, request));
  gladys.onWidgetAction(VEHICLE_WIDGET, (actionKey, params, { settings }) =>
    vehicleWidgetAction(service, { actionKey, params, settings }),
  );

  // --- Configuration and connection lifecycle ----------------------------------
  gladys.onConfigUpdated(async (config) => {
    logger.info('onConfigUpdated -> new configuration received');
    await service.start(config);
  });

  gladys.on('connected', async () => {
    try {
      await service.start(await gladys.getConfig());
    } catch (err) {
      logger.error(`Post-connection initialization failed: ${err.message}`);
    }
  });

  return service;
}
