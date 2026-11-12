// -----------------------------------------------------------------------------
// Client of the NissanConnect Services cloud.
//
// One instance per account. It logs in lazily, renews the tokens (refresh
// token first, full login as a fallback), retries a call once after a 401, and
// turns the JSON:API answers of the Kamereon platform into plain objects.
//
// Two families of cars answer on different paths: the LEAF keeps the older
// "NCI" back-end for its remote commands, the newer cars (Ariya, Qashqai and
// Juke e-POWER, Micra…) use the Alliance car adapter. `commandBaseUrl` picks
// the right one, in one place.
//
// `fetchImpl` is injectable: the tests hand it a fake Nissan cloud, nothing
// here ever touches the network in `npm test`.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { login, refreshTokens } from './auth.js';
import { NissanApiError, NissanAuthError } from './errors.js';
import { NISSAN_EU, REQUEST_TIMEOUT_MS } from './settings.js';

const logger = createLogger({ name: 'nissan-client' });

const JSON_API = 'application/vnd.api+json';

/** Whether the car is a LEAF, which keeps the older command back-end. */
export function isLeaf(vehicle) {
  return /leaf/i.test(vehicle.model ?? '');
}

/**
 * Plain vehicle from an entry of `GET /v5/users/{id}/cars`.
 * @returns {{ vin: string, name: string, model: string, canGeneration: string|null }}
 */
export function parseVehicle(raw) {
  const vin = String(raw.vin ?? '').trim();
  const model = String(raw.modelName ?? raw.modelCode ?? 'Nissan').trim();
  return {
    vin,
    model,
    name: String(raw.nickname ?? '').trim() || `Nissan ${model}`,
    canGeneration: raw.canGeneration ?? null,
  };
}

export class NissanConnectClient {
  /**
   * @param {object} options
   * @param {string} options.username NissanConnect Services login (e-mail)
   * @param {string} options.password its password
   * @param {typeof fetch} [options.fetchImpl]
   * @param {typeof NISSAN_EU} [options.settings]
   * @param {() => number} [options.now]
   */
  constructor({ username, password, fetchImpl = fetch, settings = NISSAN_EU, now = Date.now }) {
    this.username = username;
    this.password = password;
    this.fetchImpl = fetchImpl;
    this.settings = settings;
    this.now = now;
    this.tokens = null;
    this.userId = null;
  }

  /** Log in (again) with the login and password. */
  async login() {
    logger.info('Logging in to NissanConnect Services');
    const { fetchImpl, settings, username, password, now } = this;
    this.tokens = await login({ fetchImpl, settings, username, password, now });
  }

  /** A valid access token: the current one, a refreshed one, or a new login. */
  async accessToken() {
    if (this.tokens && this.now() < this.tokens.expiresAt) {
      return this.tokens.accessToken;
    }
    if (this.tokens?.refreshToken) {
      try {
        const { fetchImpl, settings, now } = this;
        this.tokens = await refreshTokens({
          fetchImpl,
          settings,
          refreshToken: this.tokens.refreshToken,
          now,
        });
        return this.tokens.accessToken;
      } catch (err) {
        // A refused refresh token is not a refused password: log in again.
        logger.debug(`Token refresh failed (${err.message}), logging in again`);
      }
    }
    await this.login();
    return this.tokens.accessToken;
  }

  /**
   * One authenticated call. A 401 drops the tokens and retries once with
   * fresh ones: the server can revoke a token before its announced expiry.
   */
  async request(method, url, { body, retry = true } = {}) {
    const token = await this.accessToken();
    let response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': JSON_API } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new NissanApiError(`Nissan cloud unreachable: ${err.message}`);
    }
    if (response.status === 401 && retry) {
      this.tokens = null;
      return this.request(method, url, { body, retry: false });
    }
    if (response.status === 401) {
      throw new NissanAuthError('Nissan refused the session');
    }
    if (!response.ok) {
      // The path only: the VIN is in it, but no token or password ever is.
      const path = new URL(url).pathname;
      throw new NissanApiError(`${method} ${path}: HTTP ${response.status}`, response.status);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  /** The Kamereon id of the account, needed to list its cars. */
  async getUserId() {
    if (!this.userId) {
      const user = await this.request('GET', `${this.settings.userAdapterBaseUrl}v1/users/current`);
      if (!user.userId) {
        throw new NissanApiError('Nissan account without a user id');
      }
      this.userId = user.userId;
    }
    return this.userId;
  }

  /** The cars of the account. */
  async getVehicles() {
    const userId = await this.getUserId();
    const answer = await this.request(
      'GET',
      `${this.settings.userBaseUrl}v5/users/${encodeURIComponent(userId)}/cars`,
    );
    const list = Array.isArray(answer.data) ? answer.data : [];
    return list.map(parseVehicle).filter((vehicle) => vehicle.vin !== '');
  }

  carUrl(vehicle, path) {
    return `${this.settings.carAdapterBaseUrl}v1/cars/${encodeURIComponent(vehicle.vin)}/${path}`;
  }

  commandBaseUrl(vehicle) {
    return isLeaf(vehicle) ? this.settings.userBaseUrl : this.settings.carAdapterBaseUrl;
  }

  commandUrl(vehicle, action) {
    const vin = encodeURIComponent(vehicle.vin);
    return `${this.commandBaseUrl(vehicle)}v1/cars/${vin}/actions/${action}`;
  }

  /** `data.attributes` of a JSON:API read. */
  async readAttributes(vehicle, path) {
    const answer = await this.request('GET', this.carUrl(vehicle, path));
    return answer?.data?.attributes ?? {};
  }

  getBatteryStatus(vehicle) {
    const canGen = vehicle.canGeneration
      ? `?canGen=${encodeURIComponent(vehicle.canGeneration)}`
      : '';
    return this.readAttributes(vehicle, `battery-status${canGen}`);
  }

  getHvacStatus(vehicle) {
    return this.readAttributes(vehicle, 'hvac-status');
  }

  getCockpit(vehicle) {
    return this.readAttributes(vehicle, 'cockpit');
  }

  getLockStatus(vehicle) {
    return this.readAttributes(vehicle, 'lock-status');
  }

  getLocation(vehicle) {
    return this.readAttributes(vehicle, 'location');
  }

  /** Wake the car so it sends fresh battery data to the cloud (asynchronous, car-side). */
  refreshBatteryStatus(vehicle) {
    return this.request('POST', this.carUrl(vehicle, 'actions/refresh-battery-status'), {
      body: { data: { type: 'RefreshBatteryStatus' } },
    });
  }

  /** Ask the car for a fresh GPS position. */
  refreshLocation(vehicle) {
    return this.request('POST', this.carUrl(vehicle, 'actions/refresh-location'), {
      body: { data: { type: 'RefreshLocation' } },
    });
  }

  /**
   * Start or stop the climate (pre-conditioning).
   * @param {boolean} on
   * @param {number} temperature cabin target, °C
   */
  setClimate(vehicle, on, temperature) {
    const attributes = on
      ? { action: 'start', targetTemperature: temperature }
      : { action: 'cancel', targetTemperature: temperature };
    return this.request('POST', this.commandUrl(vehicle, 'hvac-start'), {
      body: { data: { type: 'HvacStart', attributes } },
    });
  }

  /** Start or stop the charge of a plugged car. */
  setCharging(vehicle, on) {
    return this.request('POST', this.commandUrl(vehicle, 'charging-start'), {
      body: { data: { type: 'ChargingStart', attributes: { action: on ? 'start' : 'stop' } } },
    });
  }

  /**
   * Flash the lights (and sound the horn) to find the car.
   * @param {'lights'|'horn_lights'} target
   */
  hornLights(vehicle, target = 'lights') {
    return this.request('POST', this.carUrl(vehicle, 'actions/horn-lights'), {
      body: { data: { type: 'HornLights', attributes: { action: 'start', duration: 5, target } } },
    });
  }
}
