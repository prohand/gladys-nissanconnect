// -----------------------------------------------------------------------------
// Login to the NissanConnect Services account.
//
// The Nissan identity server is a ForgeRock AM: there is no "password" OAuth
// grant, so the login replays what the mobile app does, in three requests:
//
//   1. `json/.../authenticate`: the server answers a callback form (login,
//      password), filled in and posted back -> a session `tokenId`;
//   2. `oauth2/.../authorize` with that session as a cookie -> a redirect to
//      the app's custom scheme, carrying an authorization `code`;
//   3. `oauth2/.../access_token` -> the access and refresh tokens.
//
// The tokens only live in memory: nothing is written to disk, and a restart
// simply logs in again.
// -----------------------------------------------------------------------------

import { NissanApiError, NissanAuthError } from './errors.js';
import { REQUEST_TIMEOUT_MS } from './settings.js';

// The headers ForgeRock expects on its authentication tree.
const AUTHENTICATE_HEADERS = {
  'Accept-Api-Version': 'protocol=1.0,resource=2.0',
  'X-Username': 'anonymous',
  'X-Password': 'anonymous',
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

function realmPath(settings) {
  return `realms/root/realms/${settings.realm}`;
}

async function send(fetchImpl, url, init) {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new NissanApiError(`Nissan login unreachable: ${err.message}`);
  }
}

/**
 * Fill the login and password into the callback form of step 1. The
 * callbacks are found by type, falling back on their usual order.
 */
export function fillCallbacks(form, username, password) {
  const callbacks = Array.isArray(form?.callbacks) ? form.callbacks : [];
  const byType = (type, index) => callbacks.find((cb) => cb.type === type) ?? callbacks[index];
  const name = byType('NameCallback', 0);
  const secret = byType('PasswordCallback', 1);
  if (!name?.input?.[0] || !secret?.input?.[0]) {
    throw new NissanApiError('Unexpected answer from the Nissan login server');
  }
  name.input[0].value = username;
  secret.input[0].value = password;
  return form;
}

/** Step 1: login + password -> ForgeRock session token. */
async function authenticate(fetchImpl, settings, username, password) {
  const url = `${settings.authBaseUrl}json/${realmPath(settings)}/authenticate`;
  const first = await send(fetchImpl, url, { method: 'POST', headers: AUTHENTICATE_HEADERS });
  if (!first.ok) {
    throw new NissanApiError(`Nissan login failed (HTTP ${first.status})`, first.status);
  }
  const form = fillCallbacks(await first.json(), username, password);
  const second = await send(fetchImpl, url, {
    method: 'POST',
    headers: AUTHENTICATE_HEADERS,
    body: JSON.stringify(form),
  });
  if (second.status === 401) {
    throw new NissanAuthError('Nissan refused the login or password');
  }
  if (!second.ok) {
    throw new NissanApiError(`Nissan login failed (HTTP ${second.status})`, second.status);
  }
  const { tokenId } = await second.json();
  if (!tokenId) {
    throw new NissanAuthError('Nissan refused the login or password');
  }
  return tokenId;
}

/** Step 2: session token -> authorization code (read from the redirect). */
async function authorize(fetchImpl, settings, tokenId) {
  const params = new URLSearchParams({
    client_id: settings.clientId,
    redirect_uri: settings.redirectUri,
    response_type: 'code',
    scope: settings.scope,
    nonce: 'gladys',
    state: 'gladys',
  });
  const url = `${settings.authBaseUrl}oauth2/${realmPath(settings)}/authorize?${params}`;
  const response = await send(fetchImpl, url, {
    method: 'GET',
    redirect: 'manual',
    headers: { Cookie: `i18next=en-UK; amlbcookie=05; kauthSession=${tokenId}` },
  });
  const location = response.headers.get('location') ?? '';
  const code = new URL(location, settings.authBaseUrl).searchParams.get('code');
  if (!code) {
    throw new NissanApiError(
      `Nissan authorization failed (HTTP ${response.status})`,
      response.status,
    );
  }
  return code;
}

/** Steps 3 and refresh: exchange a code or a refresh token for fresh tokens. */
async function fetchToken(fetchImpl, settings, grant, now) {
  const url = `${settings.authBaseUrl}oauth2/${realmPath(settings)}/access_token`;
  const body = new URLSearchParams({
    ...grant,
    client_id: settings.clientId,
    client_secret: settings.clientSecret,
    redirect_uri: settings.redirectUri,
  });
  const response = await send(fetchImpl, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!response.ok) {
    const Err =
      response.status === 400 || response.status === 401 ? NissanAuthError : NissanApiError;
    throw new Err(`Nissan token request failed (HTTP ${response.status})`, response.status);
  }
  const token = await response.json();
  if (!token.access_token) {
    throw new NissanApiError('Nissan token answer without an access token');
  }
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? grant.refresh_token ?? null,
    // Renewed a minute early: a token that expires in flight is a failed call.
    expiresAt: now() + (Number(token.expires_in) || 3600) * 1000 - 60_000,
  };
}

/**
 * Full login: login + password -> tokens.
 * @returns {Promise<{ accessToken: string, refreshToken: string|null, expiresAt: number }>}
 */
export async function login({ fetchImpl, settings, username, password, now = Date.now }) {
  const tokenId = await authenticate(fetchImpl, settings, username, password);
  const code = await authorize(fetchImpl, settings, tokenId);
  return fetchToken(fetchImpl, settings, { grant_type: 'authorization_code', code }, now);
}

/** Renew the tokens with the refresh token (no password involved). */
export async function refreshTokens({ fetchImpl, settings, refreshToken, now = Date.now }) {
  return fetchToken(
    fetchImpl,
    settings,
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    now,
  );
}
