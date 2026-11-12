# Security policy

## Supported versions

Only the latest release of the Nissan Connect integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-nissanconnect](https://github.com/prohand/gladys-nissanconnect/security),
then **Report a vulnerability**.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove e-mail addresses, VINs, tokens and positions first).

You should get a first answer within 7 days. A fix is released as a new version of
the integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), the
NissanConnect Services cloud and mobile app (report to Nissan), and the cars themselves.

## How the integration handles your data

- **Credentials**: the NissanConnect login and password are stored by Gladys (the
  password in a `secret` field) and only sent to the Nissan identity server
  (`prod.eu2.auth.kamereon.org`) over HTTPS.
- **Tokens**: the access and refresh tokens obtained at login stay in memory. Nothing is
  written to disk; a restart logs in again.
- **Logs**: no password, token or full HTTP request is ever logged. Error lines name the
  API path, which contains the car VIN.
- **Network**: the integration only calls the Nissan cloud (`*.kamereon.org`,
  `*.kamereon.io`). It opens no port and never reaches the car on the local network
  (manifest `transports: ["cloud"]`).
- **Position**: the car's GPS position is read to offer the optional map button of the
  widget. It is off by default, and never published as a Gladys state.
- **Remote commands**: the integration can start the climate and the charge, and flash the
  lights. It never locks or unlocks the doors, and never asks for the car PIN.
- The OAuth client id and secret in `src/nissan/settings.js` are those of the public
  NissanConnect mobile app, shipped in every copy of it: they identify the app, not you.

## Good practices for users

- Use a strong, unique password for your NissanConnect account.
- Keep the map button off on a dashboard other people can see.
- Keep Gladys and the integration up to date.
