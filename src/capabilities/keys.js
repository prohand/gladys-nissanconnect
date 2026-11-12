// -----------------------------------------------------------------------------
// Keys of the Gladys 5.1 capabilities declared in the manifest.
//
// Users store them in their scenes and dashboards: a published key is never
// renamed (a renamed key is a removed key for every scene using it).
// test/manifest.test.js checks that the manifest and the code agree.
// -----------------------------------------------------------------------------

/** Scene triggers: something happened to a car. */
export const SCENE_TRIGGERS = Object.freeze({
  CHARGING_CHANGED: 'charging_changed',
  PLUG_CHANGED: 'plug_changed',
});

/** Values of the `event` filter of each trigger. */
export const CHARGING_EVENTS = Object.freeze({ STARTED: 'started', STOPPED: 'stopped' });
export const PLUG_EVENTS = Object.freeze({ PLUGGED: 'plugged', UNPLUGGED: 'unplugged' });

/** Scene actions: operations a scene can run on a car. */
export const SCENE_ACTION_KEYS = Object.freeze({
  CLIMATE_CONTROL: 'climate_control',
  CHARGING_CONTROL: 'charging_control',
  REFRESH_STATUS: 'refresh_status',
  HORN_LIGHTS: 'horn_lights',
});

/** Dashboard widgets. */
export const VEHICLE_WIDGET = 'vehicle';
