// -----------------------------------------------------------------------------
// Endpoints of the NissanConnect Services cloud (Europe).
//
// Nissan publishes no public API: these are the endpoints and the OAuth client
// of the official NissanConnect Services mobile app (Alliance "Kamereon"
// platform), the same ones the community clients use (Home Assistant
// `nissan_connect`, `dartnissanconnect`). The client id and secret are the
// app's own, shipped in every copy of it: they identify the app, not the user,
// and are not secrets of this integration. The user's own secrets are the
// login and password of the configuration, and the tokens obtained with them.
//
// Nissan can change any of this without notice: everything lives here so a
// fix is a one-file change.
// -----------------------------------------------------------------------------

export const NISSAN_EU = Object.freeze({
  clientId: 'a-ncb-nc-android-prod',
  clientSecret: '6GKIax7fGT5yPHuNmWNVOc4q5POBw1WRSW39ubRA8WPBmQ7MOxhm75EsmKMKENem',
  scope: 'openid profile vehicles',
  realm: 'a-ncb-prod',
  redirectUri: 'org.kamereon.service.nci:/oauth2redirect',
  authBaseUrl: 'https://prod.eu2.auth.kamereon.org/kauth/',
  carAdapterBaseUrl: 'https://alliance-platform-caradapter-prod.apps.eu2.kamereon.io/car-adapter/',
  userAdapterBaseUrl:
    'https://alliance-platform-usersadapter-prod.apps.eu2.kamereon.io/user-adapter/',
  userBaseUrl: 'https://nci-bff-web-prod.apps.eu2.kamereon.io/bff-web/',
});

// Every API call is aborted past this delay: a hung request must not hold a
// Gladys poll or a scene action forever.
export const REQUEST_TIMEOUT_MS = 20_000;
