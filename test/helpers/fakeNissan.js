// -----------------------------------------------------------------------------
// A fake NissanConnect Services cloud, as a `fetch` implementation.
//
// It plays the three login steps (ForgeRock callbacks, authorize redirect,
// token), the account and car reads, and records the commands, so the tests
// never touch the network. Tokens can be expired or revoked to exercise the
// renewal paths, and any path can be made to fail.
// -----------------------------------------------------------------------------

import { NISSAN_EU } from '../../src/nissan/settings.js';

export const USERNAME = 'driver@example.com';
export const PASSWORD = 'correct horse';

export const LEAF = {
  vin: 'SJNFAAZE1U0000001',
  modelName: 'LEAF',
  nickname: 'My Leaf',
  canGeneration: 'GEN1',
};
export const ARIYA = { vin: 'SJNFAAFE0U0000002', modelName: 'Ariya', nickname: '' };

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

/**
 * @param {object} [options]
 * @param {object[]} [options.cars] entries of the cars list
 * @param {Record<string, object>} [options.battery] VIN -> battery-status attributes
 * @param {Record<string, object>} [options.hvac] VIN -> hvac-status attributes
 * @param {Record<string, object>} [options.cockpit] VIN -> cockpit attributes
 * @param {Record<string, object>} [options.lock] VIN -> lock-status attributes
 * @param {Record<string, object>} [options.location] VIN -> location attributes
 */
export function createFakeNissan(options = {}) {
  const state = {
    password: PASSWORD,
    cars: options.cars ?? [LEAF],
    battery: options.battery ?? {
      [LEAF.vin]: {
        batteryLevel: 80,
        batteryAutonomy: 200,
        plugStatus: 0,
        chargeStatus: 0,
        lastUpdateTime: new Date().toISOString(),
      },
    },
    hvac: options.hvac ?? { [LEAF.vin]: { hvacStatus: 'off', internalTemperature: 18 } },
    cockpit: options.cockpit ?? { [LEAF.vin]: { totalMileage: 12345.6 } },
    lock: options.lock ?? {},
    location: options.location ?? {
      [LEAF.vin]: {
        gpsLatitude: 48.85,
        gpsLongitude: 2.35,
        lastUpdateTime: '2026-11-12T10:00:00Z',
      },
    },
    validTokens: new Set(),
    tokenCount: 0,
    failures: [], // [{ match: string, status: number, times: number }]
  };
  const calls = [];
  const commands = [];

  function issueToken() {
    state.tokenCount += 1;
    const access = `access-${state.tokenCount}`;
    state.validTokens.add(access);
    return { access_token: access, refresh_token: `refresh-${state.tokenCount}`, expires_in: 3600 };
  }

  function failure(url) {
    const found = state.failures.find((f) => url.includes(f.match) && f.times > 0);
    if (found) {
      found.times -= 1;
      return json({ errors: [{ status: found.status }] }, found.status);
    }
    return null;
  }

  function authorized(init) {
    const header = init?.headers?.Authorization ?? '';
    return state.validTokens.has(header.replace(/^Bearer /, ''));
  }

  function attributesOf(table, vin) {
    const attributes = table[vin];
    return attributes ? json({ data: { type: 'Status', id: vin, attributes } }) : json({}, 404);
  }

  async function fetch(input, init = {}) {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ method, url, init });
    const failed = failure(url);
    if (failed) {
      return failed;
    }
    const auth = NISSAN_EU.authBaseUrl;
    const realm = 'realms/root/realms/a-ncb-prod';

    // --- Login ---------------------------------------------------------------
    if (url === `${auth}json/${realm}/authenticate`) {
      if (!init.body) {
        return json({
          authId: 'auth-1',
          callbacks: [
            { type: 'NameCallback', input: [{ name: 'IDToken1', value: '' }] },
            { type: 'PasswordCallback', input: [{ name: 'IDToken2', value: '' }] },
          ],
        });
      }
      const form = JSON.parse(init.body);
      const [name, secret] = form.callbacks.map((cb) => cb.input[0].value);
      if (name !== USERNAME || secret !== state.password) {
        return json({ code: 401, reason: 'Unauthorized' }, 401);
      }
      return json({ tokenId: 'session-1' });
    }
    if (url.startsWith(`${auth}oauth2/${realm}/authorize?`)) {
      if (!String(init.headers?.Cookie).includes('kauthSession=session-1')) {
        return json({}, 400);
      }
      return new Response(null, {
        status: 302,
        headers: { Location: `${NISSAN_EU.redirectUri}?code=code-1&state=gladys` },
      });
    }
    if (url === `${auth}oauth2/${realm}/access_token`) {
      const body = new URLSearchParams(String(init.body));
      if (body.get('client_secret') !== NISSAN_EU.clientSecret) {
        return json({ error: 'invalid_client' }, 401);
      }
      const ok =
        (body.get('grant_type') === 'authorization_code' && body.get('code') === 'code-1') ||
        (body.get('grant_type') === 'refresh_token' &&
          /^refresh-\d+$/.test(body.get('refresh_token')));
      return ok ? json(issueToken()) : json({ error: 'invalid_grant' }, 400);
    }

    // --- Authenticated API ---------------------------------------------------
    if (!authorized(init)) {
      return json({ errors: [{ status: 401 }] }, 401);
    }
    if (url === `${NISSAN_EU.userAdapterBaseUrl}v1/users/current`) {
      return json({ userId: 'user-1' });
    }
    if (url === `${NISSAN_EU.userBaseUrl}v5/users/user-1/cars`) {
      return json({ data: state.cars });
    }
    const car = url.match(/v1\/cars\/([^/]+)\/([^?]+)/);
    if (car) {
      const [, vin, path] = car;
      if (method === 'POST') {
        commands.push({
          vin,
          path,
          base: url.slice(0, url.indexOf('v1/cars')),
          body: JSON.parse(init.body),
        });
        return json({ data: { type: path, id: 'command-1' } });
      }
      const table = {
        'battery-status': state.battery,
        'hvac-status': state.hvac,
        cockpit: state.cockpit,
        'lock-status': state.lock,
        location: state.location,
      }[path];
      if (table) {
        return attributesOf(table, vin);
      }
    }
    return json({ errors: [{ status: 404 }] }, 404);
  }

  return {
    fetch,
    state,
    calls,
    commands,
    /** Make the next `times` calls whose URL contains `match` answer `status`. */
    fail(match, status = 500, times = 1) {
      state.failures.push({ match, status, times });
    },
    /** Invalidate every access token already issued (server-side revocation). */
    revokeTokens() {
      state.validTokens.clear();
    },
  };
}
