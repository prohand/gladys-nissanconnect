# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [0.0.3] - 2026-11-16

- Update `@gladysassistant/integration-sdk` to 0.16.1 (security update).

## [0.0.2] - 2026-11-16

- Maintenance release, no functional change.

## [0.0.1] - 2026-11-12

### Added

- First version of the Nissan Connect integration for Gladys Assistant (cloud,
  NissanConnect Services Europe): one Gladys device per car of the account.
- Battery level, range, plugged in, charging, climate, climate temperature, cabin
  temperature, odometer and door lock, using the Gladys electric-vehicle categories.
- Remote commands: start/stop the climate (with a target temperature), start/stop the
  charge, wake the car up, flash the lights (and sound the horn).
- Configurable refresh interval (cloud reads) and car wake-up interval (off by default to
  spare the 12 V battery), km or miles.
- Transport badge per car: cloud, unreachable, or degraded when the car has been silent for
  a day.
- Scene triggers: a car starts or stops charging, a car is plugged in or unplugged.
- Scene actions: climate control, charge control, read the status (outputs battery, range,
  plugged, charging), horn and lights.
- "Nissan car" dashboard widget: live battery and range, plug, charge, climate, doors and
  last update, buttons to refresh, drive the climate and the charge, optional map link.
- Configuration screen actions: test the connection, wake up a car, identify a car.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/prohand/gladys-nissanconnect/compare/v0.0.3...HEAD
[0.0.3]: https://github.com/prohand/gladys-nissanconnect/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/prohand/gladys-nissanconnect/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/prohand/gladys-nissanconnect/releases/tag/v0.0.1
