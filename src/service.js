// -----------------------------------------------------------------------------
// The integration's state and behaviour, independent of the SDK wiring.
//
// One NissanService per process. It holds the Nissan client, the cars of the
// account and their last known status, and does everything Gladys asks:
// discovery, polls, commands, wake-ups, the scene events and the transport
// badge. src/app.js plugs it into the SDK handlers.
//
// Two kinds of "refresh", on purpose:
//   - a READ asks the Nissan cloud what the car last reported. Cheap, the car
//     is not involved: it follows `poll_frequency`;
//   - a WAKE-UP asks the car itself to report again. It goes through the
//     mobile network and draws on the car's 12 V battery: only on demand, or
//     every `wake_interval` minutes when the user chose to.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { hasCredentials, normalizeConfig } from './config.js';
import {
  buildVehicleDevice,
  featureKey,
  FEATURES,
  vehicleIds,
  vehicleStates,
  vinFromExternalId,
} from './devices/vehicle.js';
import {
  CHARGING_EVENTS,
  PLUG_EVENTS,
  SCENE_TRIGGERS,
  VEHICLE_WIDGET,
} from './capabilities/keys.js';
import { NissanConnectClient } from './nissan/client.js';
import { NissanAuthError } from './nissan/errors.js';
import {
  mergeStatus,
  parseBattery,
  parseCockpit,
  parseHvac,
  parseLocation,
  parseLock,
  toDistanceUnit,
} from './nissan/status.js';
import { connectedWith, MESSAGES, staleData, unreachable } from './messages.js';

const logger = createLogger({ name: 'nissan' });

// Gladys' poll ticks drift by a few milliseconds: a read due within the next
// half-minute runs now, so a 900 s interval does not slip to 960 s.
const POLL_TOLERANCE_MS = 30_000;
// A wake-up or a command is carried out by the car, then reported to the
// cloud: read again once it had the time to.
const CONFIRM_DELAY_MS = 90_000;
// Unchanged values are re-sent this often, so they stay recently dated.
const HEARTBEAT_MS = 30 * 60 * 1000;
// Car data older than this flags the transport badge as degraded.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

function defaultCreateClient(config) {
  return new NissanConnectClient({ username: config.username, password: config.password });
}

export class NissanService {
  /**
   * @param {object} options
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
   * @param {(config: object) => NissanConnectClient} [options.createClient]
   * @param {() => number} [options.now]
   * @param {typeof setTimeout} [options.setTimer]
   * @param {typeof clearTimeout} [options.clearTimer]
   */
  constructor({
    gladys,
    createClient = defaultCreateClient,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    this.gladys = gladys;
    this.createClient = createClient;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;

    this.config = normalizeConfig();
    this.client = null;
    this.clientKey = null;
    this.vehicles = [];
    this.statuses = new Map(); // VIN -> merged status
    this.reachable = new Map(); // VIN -> last read succeeded
    this.targetTemperatures = new Map(); // VIN -> °C asked for the climate
    this.lastReads = new Map(); // VIN -> ms
    this.lastWakes = new Map(); // VIN -> ms
    this.timers = new Set();
    this.connected = false;
  }

  // --- Account ---------------------------------------------------------------

  /**
   * (Re)start from a configuration: log in, list the cars, publish them and
   * read them. Called on every connection to Gladys and config update.
   */
  async start(rawConfig) {
    this.config = normalizeConfig(rawConfig);
    if (!hasCredentials(this.config)) {
      this.client = null;
      this.clientKey = null;
      this.vehicles = [];
      await this.publishDevices();
      await this.setConnected(false, MESSAGES.notConfigured);
      return;
    }
    // Same account: keep the client and its tokens, no new login.
    const key = `${this.config.username}\n${this.config.password}`;
    if (key !== this.clientKey) {
      this.client = this.createClient(this.config);
      this.clientKey = key;
    }
    try {
      this.vehicles = await this.client.getVehicles();
      logger.info(`${this.vehicles.length} car(s) in the NissanConnect account`);
      await this.publishDevices();
      await this.setConnected(true);
      await Promise.all(this.vehicles.map((vehicle) => this.safeRead(vehicle)));
    } catch (err) {
      await this.reportFailure(err);
    }
    await this.publishTransports();
  }

  async setConnected(connected, message) {
    this.connected = connected;
    await this.gladys.setConnectionStatus(connected, message).catch((err) => {
      logger.warn(`Could not report the connection status: ${err.message}`);
    });
  }

  async reportFailure(err) {
    // Never the raw error object: it could carry a request with a token.
    logger.error(`NissanConnect Services: ${err.message}`);
    const message =
      err instanceof NissanAuthError ? MESSAGES.badCredentials : unreachable(err.message);
    await this.setConnected(false, message);
  }

  /** "Test the connection": log in and list the cars, and say what was found. */
  async testConnection() {
    if (!hasCredentials(this.config)) {
      return MESSAGES.notConfigured;
    }
    try {
      const client = this.client ?? this.createClient(this.config);
      const vehicles = await client.getVehicles();
      await this.setConnected(true);
      if (vehicles.length === 0) {
        return MESSAGES.noVehicle;
      }
      // A car added to the account since the start shows up in discovery now.
      this.client = client;
      this.vehicles = vehicles;
      await this.publishDevices();
      return connectedWith(vehicles);
    } catch (err) {
      await this.reportFailure(err);
      return err instanceof NissanAuthError ? MESSAGES.badCredentials : unreachable(err.message);
    }
  }

  // --- Devices ---------------------------------------------------------------

  buildDevices() {
    return this.vehicles.map((vehicle) => buildVehicleDevice(this.gladys, vehicle, this.config));
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(this.buildDevices());
  }

  /**
   * The car behind a VIN, a device external id or a device. A device created
   * in Gladys is still served when the account could not be listed (Nissan
   * down at start-up): its params carry what the commands need.
   */
  findVehicle(target) {
    const externalId = typeof target === 'string' ? target : target?.external_id;
    const vin = vinFromExternalId(this.gladys, externalId) ?? externalId;
    const known = this.vehicles.find(
      (vehicle) => vehicle.vin.toUpperCase() === String(vin).toUpperCase(),
    );
    if (known) {
      return known;
    }
    const device =
      typeof target === 'object'
        ? target
        : this.gladys.devices?.find((d) => d.external_id === externalId);
    if (!device || vinFromExternalId(this.gladys, device.external_id) === null) {
      return null;
    }
    const param = (name) => device.params?.find((p) => p.name === name)?.value;
    return {
      vin: param('vin') ?? vinFromExternalId(this.gladys, device.external_id),
      model: param('model') ?? 'Nissan',
      name: device.name ?? 'Nissan',
      canGeneration: null,
    };
  }

  /** Like findVehicle, but throws a user-readable error when there is none. */
  requireVehicle(target) {
    const vehicle = this.findVehicle(target);
    if (!vehicle) {
      throw new Error(MESSAGES.unknownVehicle.en);
    }
    if (!this.client) {
      throw new Error(MESSAGES.notConfigured.en);
    }
    return vehicle;
  }

  // --- Reads -----------------------------------------------------------------

  /**
   * Read everything the cloud knows about a car, publish what changed and
   * fire the scene events. Every endpoint is optional: a car that does not
   * answer one (no lock status on a LEAF) still gets the others. Throws only
   * when none answered.
   */
  async readVehicle(vehicle) {
    const { client } = this;
    const parts = await Promise.allSettled([
      client.getBatteryStatus(vehicle).then(parseBattery),
      client.getHvacStatus(vehicle).then(parseHvac),
      client.getCockpit(vehicle).then(parseCockpit),
      client.getLockStatus(vehicle).then(parseLock),
      client.getLocation(vehicle).then(parseLocation),
    ]);
    const read = parts.filter((part) => part.status === 'fulfilled').map((part) => part.value);
    for (const part of parts.filter((p) => p.status === 'rejected')) {
      logger.debug(`${vehicle.name}: ${part.reason.message}`);
    }
    if (read.length === 0) {
      throw parts[0].reason;
    }

    const previous = this.statuses.get(vehicle.vin);
    const status = mergeStatus(previous, ...read);
    this.statuses.set(vehicle.vin, status);
    this.reachable.set(vehicle.vin, true);
    this.lastReads.set(vehicle.vin, this.now());

    await this.gladys.publishChangedStates(
      vehicleStates(this.gladys, vehicle.vin, status, this.config, this.targetTemperature(vehicle)),
      { heartbeat: HEARTBEAT_MS },
    );
    await this.fireEvents(vehicle, previous, status);
    this.gladys.requestWidgetRefresh(VEHICLE_WIDGET);
    if (!this.connected) {
      await this.setConnected(true);
    }
    return status;
  }

  /** readVehicle that reports its failure instead of throwing. */
  async safeRead(vehicle) {
    try {
      return await this.readVehicle(vehicle);
    } catch (err) {
      this.reachable.set(vehicle.vin, false);
      this.lastReads.set(vehicle.vin, this.now());
      if (err instanceof NissanAuthError) {
        await this.reportFailure(err);
      } else {
        logger.warn(`${vehicle.name}: read failed (${err.message})`);
      }
      return null;
    }
  }

  /**
   * One event per transition, never on the first read: an integration that
   * restarts while the car charges must not fire "charging started" again.
   */
  async fireEvents(vehicle, previous, status) {
    if (!previous) {
      return;
    }
    const device = vehicleIds(this.gladys, vehicle.vin).device;
    const common = {
      device,
      device_name: vehicle.name,
      battery_level: status.batteryLevel ?? null,
      range: toDistanceUnit(status.range, this.config.distance_unit),
    };
    const events = [];
    if (
      typeof status.charging === 'boolean' &&
      typeof previous.charging === 'boolean' &&
      status.charging !== previous.charging
    ) {
      events.push([
        SCENE_TRIGGERS.CHARGING_CHANGED,
        { ...common, event: status.charging ? CHARGING_EVENTS.STARTED : CHARGING_EVENTS.STOPPED },
      ]);
    }
    if (
      typeof status.plugged === 'boolean' &&
      typeof previous.plugged === 'boolean' &&
      status.plugged !== previous.plugged
    ) {
      events.push([
        SCENE_TRIGGERS.PLUG_CHANGED,
        { ...common, event: status.plugged ? PLUG_EVENTS.PLUGGED : PLUG_EVENTS.UNPLUGGED },
      ]);
    }
    for (const [key, data] of events) {
      try {
        await this.gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Scene event ${key} refused: ${err.message}`);
      }
    }
  }

  /**
   * Gladys' poll of a car (once a minute): read when `poll_frequency` is
   * due, wake the car when `wake_interval` is. Resolves whether it read.
   */
  async pollDevice(device) {
    const vehicle = this.findVehicle(device);
    if (!vehicle || !this.client) {
      return false;
    }
    const now = this.now();
    if (this.config.wake_interval > 0) {
      const lastWake = this.lastWakes.get(vehicle.vin);
      if (
        lastWake === undefined ||
        now - lastWake >= this.config.wake_interval * 60_000 - POLL_TOLERANCE_MS
      ) {
        await this.wakeVehicle(vehicle).catch((err) =>
          logger.warn(`${vehicle.name}: wake-up failed (${err.message})`),
        );
      }
    }
    const lastRead = this.lastReads.get(vehicle.vin);
    if (
      lastRead !== undefined &&
      now - lastRead < this.config.poll_frequency * 1000 - POLL_TOLERANCE_MS
    ) {
      return false;
    }
    await this.safeRead(vehicle);
    await this.publishTransports();
    return true;
  }

  // --- Commands --------------------------------------------------------------

  /** Read again once the car had the time to carry out a request. */
  scheduleConfirmation(vehicle) {
    const timer = this.setTimer(async () => {
      this.timers.delete(timer);
      await this.safeRead(vehicle);
      await this.publishTransports();
    }, CONFIRM_DELAY_MS);
    timer?.unref?.();
    this.timers.add(timer);
  }

  /** Ask the car to report fresh data (battery and position). */
  async wakeVehicle(vehicle) {
    this.lastWakes.set(vehicle.vin, this.now());
    logger.info(`${vehicle.name}: waking the car up`);
    await this.client.refreshBatteryStatus(vehicle);
    // The position is a bonus: a car without the service must not fail the wake-up.
    await this.client
      .refreshLocation(vehicle)
      .catch((err) => logger.debug(`${vehicle.name}: ${err.message}`));
    this.scheduleConfirmation(vehicle);
  }

  targetTemperature(vehicle) {
    return this.targetTemperatures.get(vehicle.vin) ?? this.config.climate_temperature;
  }

  /** Publish one state at once: a command must show without waiting for the next read. */
  async publishFeature(vehicle, key, value) {
    await this.gladys.publishState(vehicleIds(this.gladys, vehicle.vin).feature(key), value);
  }

  /**
   * Start or stop the climate. The car carries it out a little later: the
   * requested state is shown at once, and confirmed by a read afterwards.
   */
  async setClimate(vehicle, on, temperature) {
    if (temperature !== undefined && temperature !== null && temperature !== '') {
      await this.setTargetTemperature(vehicle, temperature);
    }
    const target = this.targetTemperature(vehicle);
    logger.info(`${vehicle.name}: climate ${on ? `on at ${target} °C` : 'off'}`);
    await this.client.setClimate(vehicle, on, target);
    this.statuses.set(vehicle.vin, mergeStatus(this.statuses.get(vehicle.vin), { climateOn: on }));
    await this.publishFeature(vehicle, FEATURES.CLIMATE, on ? 1 : 0);
    this.scheduleConfirmation(vehicle);
  }

  /** Start or stop the charge of a plugged car. */
  async setCharging(vehicle, on) {
    logger.info(`${vehicle.name}: charge ${on ? 'start' : 'stop'}`);
    await this.client.setCharging(vehicle, on);
    this.statuses.set(vehicle.vin, mergeStatus(this.statuses.get(vehicle.vin), { charging: on }));
    await this.publishFeature(vehicle, FEATURES.CHARGING, on ? 1 : 0);
    this.scheduleConfirmation(vehicle);
  }

  /** The cabin temperature of the next climate start (Nissan has no setting for it). */
  async setTargetTemperature(vehicle, value) {
    const temperature = Math.min(30, Math.max(16, Math.round(Number(value) * 2) / 2));
    if (!Number.isFinite(temperature)) {
      throw new Error(`Invalid temperature: ${value}`);
    }
    this.targetTemperatures.set(vehicle.vin, temperature);
    await this.publishFeature(vehicle, FEATURES.TARGET_TEMPERATURE, temperature);
  }

  async hornLights(vehicle, target) {
    logger.info(`${vehicle.name}: ${target === 'horn_lights' ? 'horn and lights' : 'lights'}`);
    await this.client.hornLights(vehicle, target);
  }

  /** A command from a Gladys device card. */
  async setValue(device, feature, value) {
    const vehicle = this.requireVehicle(device);
    switch (featureKey(feature.external_id)) {
      case FEATURES.CLIMATE:
        return this.setClimate(vehicle, Number(value) === 1);
      case FEATURES.CHARGING:
        return this.setCharging(vehicle, Number(value) === 1);
      case FEATURES.TARGET_TEMPERATURE:
        return this.setTargetTemperature(vehicle, value);
      default:
        throw new Error(`${feature.external_id} cannot be controlled`);
    }
  }

  // --- Transport badge -------------------------------------------------------

  /**
   * One badge per car: `cloud` when the last read worked, `unreachable`
   * otherwise, and degraded when the car itself has been silent for a day —
   * the cloud answers, but with old news.
   */
  transportEntries() {
    return this.vehicles.map((vehicle) => {
      const external_id = vehicleIds(this.gladys, vehicle.vin).device;
      if (this.reachable.get(vehicle.vin) === false) {
        return { external_id, transport: DEVICE_TRANSPORTS.UNREACHABLE };
      }
      const lastUpdate = this.statuses.get(vehicle.vin)?.lastUpdate;
      const age = lastUpdate ? this.now() - new Date(lastUpdate).getTime() : 0;
      if (age > STALE_AFTER_MS) {
        return {
          external_id,
          transport: DEVICE_TRANSPORTS.CLOUD,
          degraded: true,
          message: staleData(Math.floor(age / 3_600_000)),
        };
      }
      return { external_id, transport: DEVICE_TRANSPORTS.CLOUD };
    });
  }

  async publishTransports() {
    const entries = this.transportEntries();
    if (entries.length > 0) {
      await this.gladys.publishTransports(entries).catch((err) => {
        logger.warn(`Could not publish the transport badges: ${err.message}`);
      });
    }
  }

  stop() {
    for (const timer of this.timers) {
      this.clearTimer(timer);
    }
    this.timers.clear();
  }
}
