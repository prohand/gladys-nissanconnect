# Nissan Connect for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that brings your
**Nissan electric car** (LEAF, Ariya…) into Gladys through the **NissanConnect Services**
cloud: battery, range, charge, climate, odometer, doors — with remote commands, scene
triggers, scene actions and a dashboard widget.

- **Transport**: cloud only (NissanConnect Services, Europe).
- **Requires**: Gladys **5.3.0** or later, a NissanConnect Services account with the car
  activated in the mobile app.
- **Languages**: English, French, German, Spanish.

> Nissan offers no public API. This integration speaks the same language as the official
> mobile app (like the Home Assistant `nissan_connect` integration). Nissan may change it
> without notice; not every model answers every request.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) · [Deutsch](docs/de.md) ·
[Español](docs/es.md)

## What you get

| In Gladys             | Details                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| One device per car    | Battery (%), range (km/mi), plugged in, charging, climate, climate temperature, cabin temperature, odometer, locked |
| Commands              | Climate on/off (and its temperature), charge on/off — from the device card, scenes or the widget                    |
| Scene triggers        | **A car starts or stops charging**, **a car is plugged in or unplugged**                                            |
| Scene actions         | Climate control, charge control, read the status (battery, range, plugged, charging), horn and lights               |
| Dashboard widget      | **Nissan car**: live battery and range, plug, charge, climate, doors, last update, quick buttons                    |
| Configuration actions | Test the connection, wake up a car, identify a car (flash the lights)                                               |
| Transport badge       | `cloud`, `unreachable`, or degraded when the car has been silent for 24 h                                           |

## Project structure

```
.
├─ index.js                          # SDK bootstrap + graceful shutdown
├─ src/
│  ├─ app.js                         # every Gladys handler -> NissanService
│  ├─ service.js                     # cars, reads, wake-ups, commands, scene events, badge
│  ├─ config.js                      # defaults (mirror the manifest) + normalization
│  ├─ messages.js / i18n.js          # user-facing texts in en/fr/de/es
│  ├─ nissan/                        # NissanConnect Services client
│  │  ├─ settings.js                 #   endpoints + public app OAuth client
│  │  ├─ auth.js                     #   ForgeRock login, token refresh
│  │  ├─ client.js                   #   reads and remote commands
│  │  ├─ status.js                   #   answers -> plain status
│  │  └─ errors.js
│  ├─ devices/vehicle.js             # Gladys device of a car (features, states)
│  └─ capabilities/                  # Gladys 5.1+ scene triggers/actions and widget
├─ docs/{en,fr,de,es}.md             # user documentation (linked from Gladys)
├─ test/                             # node --test, fake Nissan cloud + SDK fake Gladys
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs, non-root
├─ CHANGELOG.md · SECURITY.md · CLAUDE.md
└─ .github/                          # CI, build, release, GitHub releases, Dependabot
```

## Development

```bash
npm install
npm test               # unit and integration tests, no network
npm run lint           # ESLint
npm run format:check   # Prettier (npm run format to fix)
```

Run it against a Gladys instance (developer mode):

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="nissan-connect" \
LOG_LEVEL=debug \
npm start
```

Check the store rules locally before a release:

```bash
npx github:GladysAssistant/integration-store .
```

## Continuous integration and release

Same workflows as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`): Prettier, ESLint and tests on Node 22 and 24 for every push to `main`
  and every pull request; on pull requests, the store admission checks and a Docker build.
- **Release** (`release.yml`): **Actions → Release → Run workflow**, pick `patch`, `minor`
  or `major`. It bumps `package.json` and the manifest (`version`, `docker_image`), rolls
  `CHANGELOG.md`, commits, tags `vX.Y.Z`, builds the `linux/amd64` + `linux/arm64` image to
  `ghcr.io/prohand/gladys-nissanconnect`, publishes the GitHub Release and runs the full
  store checks.
- **Build** (`build.yml`): manual test builds of any branch, hand-pushed `v*` tags.
- **GitHub releases** (`github-release.yml`): back-fills a GitHub Release for every tag.
- **Dependabot**: weekly npm, monthly GitHub Actions and Docker base image.

The repository starts at version `0.0.0`: run **Release → major** to publish `1.0.0`.
Before the first release, add the GitHub topic `gladys-assistant-integration` and turn on
**Private vulnerability reporting** (see [SECURITY.md](SECURITY.md)).

## License

Apache-2.0. Nissan, NissanConnect, LEAF and Ariya are trademarks of Nissan. This project is
not affiliated with or endorsed by Nissan.
