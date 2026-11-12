# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and to human contributors
working in this repository.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Nissan electric cars** through the
**NissanConnect Services** cloud (Europe, Alliance "Kamereon" platform): LEAF, Ariya and
the other connected Nissan models. Started from the official template
(`GladysAssistant/integration-template-js`), CI/release workflows identical to
`prohand/gladys-devmel`. Requires Gladys 5.3+ (`keywords`, scene and widget declarations).

**Cloud only** (manifest `transports: ["cloud"]`): the car is never reached on the LAN.

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/client.test.js             # one file
node --test --test-name-pattern "wake"      # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, plus the store checks and a
Docker build on pull requests. Releases: **Actions → Release** only (bumps `package.json`,
manifest `version` + `docker_image`, rolls `CHANGELOG.md`, tags, builds, GitHub Release).

## Architecture

```
index.js                  SDK bootstrap + shutdown only
src/app.js                every SDK handler, routed to the service (tested with the fake Gladys)
src/service.js            NissanService: account, cars, reads, wake-ups, commands, events, badge
src/config.js             DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/messages.js           user-facing messages { en, fr, de, es }
src/i18n.js               LANGUAGES, pick, localize
src/nissan/settings.js    Nissan endpoints + public app OAuth client (one place to fix)
src/nissan/auth.js        ForgeRock login (authenticate -> authorize -> access_token), refresh
src/nissan/client.js      NissanConnectClient: token renewal, 401 retry, reads, commands
src/nissan/status.js      Nissan answers -> plain status, merge, km/miles
src/nissan/errors.js      NissanAuthError (fix the config) vs NissanApiError (wait)
src/devices/vehicle.js    discovery payload of a car, states, external ids
src/capabilities/keys.js  scene trigger / action and widget keys (stored by users)
src/capabilities/scenes.js scene action handlers
src/capabilities/widget.js "Nissan car" widget content + button actions
test/helpers/             fake Nissan cloud (fetch), fake clock, full setup with the fake Gladys
```

### Invariants worth knowing

- **No public API.** Endpoints and the OAuth client come from the official mobile app,
  like the Home Assistant `nissan_connect` integration. Nissan can change them: keep them
  in `src/nissan/settings.js`, and the per-model routing in `NissanConnectClient`
  (`commandBaseUrl`: LEAF commands go to the NCI back-end, the others to the car adapter).
  This has not been checked against every model: treat a model-specific 404 as expected.
- **Read ≠ wake-up.** A read asks the cloud what the car last reported (cheap, every
  `poll_frequency` seconds). A wake-up (`refresh-battery-status`) asks the car to report
  again: it uses the mobile network and the 12 V battery. Only on demand, or every
  `wake_interval` minutes when the user chose to (default 0 = never).
- **Polling**: Gladys `poll_frequency` is an enum in ms; the car is published with
  `EVERY_MINUTES` and the configured seconds are applied by skipping polls. Never publish
  the configured value as is (the whole discovery batch would be refused).
- **Every endpoint is optional**: a car that does not answer one (no lock status on a LEAF)
  still gets the others; `mergeStatus` never overwrites a known value with null.
- **Commands are asynchronous car-side**: the requested state is published at once, then a
  read 90 s later confirms it (`scheduleConfirmation`).
- **Scene events**: one per transition, never on the first read after a start (no
  "charging started" at every restart), never as a consequence of a scene action.
- **Scene actions never throw on a Nissan refusal**: they output `accepted: false`. Only an
  unknown car throws.
- **Transport badge**: `cloud`, `unreachable` after a failed read, degraded when the car
  data is more than 24 h old.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys).
- **Secrets**: the password and the tokens are never logged, never written to disk.
  Error messages carry the API path (with the VIN), never a header.
- External ids are `ext:<selector>:vehicle:<VIN>` (+ `:<feature>`): forever. Feature,
  trigger, action and widget keys are stored by users: never rename them.

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or
  the manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js` checks they
  agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading.
- **Manifest.** Every text is `{ en, fr, de, es }` (labels, descriptions, placeholders).
  `test/manifest.test.js` ties it to the code: change both sides together.
- **User-facing text** in four languages: `src/messages.js`, the widget texts and
  `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
- **Tests never touch the network**: use `test/helpers/fakeNissan.js` and the SDK's
  `createFakeGladys()`.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
