// -----------------------------------------------------------------------------
// Entry point of the Nissan Connect integration for Gladys Assistant.
//
// Environment variables provided by the Gladys supervisor to the container
// (read by the SDK, `new GladysIntegration()` is enough):
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
//
// The handlers live in src/app.js, the behaviour in src/service.js.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { registerHandlers } from './src/app.js';

const gladys = new GladysIntegration();
const service = registerHandlers(gladys);

// Graceful shutdown: the SDK disconnects cleanly and exits with code 0 when
// the supervisor stops the container (SIGTERM/SIGINT).
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
});

logger.info('Starting the Nissan Connect integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
