// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest, but nothing there knows which
// handlers the code registers — these tests keep both sides in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { SCENE_ACTIONS } from '../src/capabilities/scenes.js';
import {
  CHARGING_EVENTS,
  PLUG_EVENTS,
  SCENE_ACTION_KEYS,
  SCENE_TRIGGERS,
  VEHICLE_WIDGET,
} from '../src/capabilities/keys.js';
import { LANGUAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const serviceSource = await readFile(new URL('../src/service.js', import.meta.url), 'utf8');

const keysOf = (list) => (list ?? []).map((entry) => entry.key).sort();

const allFields = [
  ...manifest.config_schema,
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

test('every manifest action is registered in src/app.js', () => {
  for (const action of manifest.actions) {
    assert.match(appSource, new RegExp(`onAction\\('${action.key}'`), `action "${action.key}"`);
  }
});

test('every scene action is handled, and every handler declared', () => {
  assert.deepEqual(keysOf(manifest.scene_actions), Object.keys(SCENE_ACTIONS).sort());
  assert.deepEqual(keysOf(manifest.scene_actions), Object.values(SCENE_ACTION_KEYS).sort());
});

test('the scene triggers the code fires are the ones the manifest declares', () => {
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(SCENE_TRIGGERS).sort());
  for (const key of Object.keys(SCENE_TRIGGERS)) {
    assert.match(serviceSource, new RegExp(`SCENE_TRIGGERS\\.${key}`), `${key} is never fired`);
  }
  const options = (key) =>
    manifest.scene_triggers
      .find((trigger) => trigger.key === key)
      .fields.find((field) => field.key === 'event')
      .options.map((option) => option.value)
      .sort();
  assert.deepEqual(options(SCENE_TRIGGERS.CHARGING_CHANGED), Object.values(CHARGING_EVENTS).sort());
  assert.deepEqual(options(SCENE_TRIGGERS.PLUG_CHANGED), Object.values(PLUG_EVENTS).sort());
});

test('the widget is declared and handled', () => {
  assert.deepEqual(keysOf(manifest.widgets), [VEHICLE_WIDGET]);
  assert.match(appSource, /onWidgetGet\(VEHICLE_WIDGET/);
  assert.match(appSource, /onWidgetAction\(VEHICLE_WIDGET/);
  assert.ok(manifest.widgets.length <= 5);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      assert.ok(!(field.key in DEFAULT_CONFIG), `section "${field.key}" stores no value`);
      continue;
    }
    assert.ok(field.key in DEFAULT_CONFIG, `config key "${field.key}" missing in DEFAULT_CONFIG`);
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
    }
  }
});

test('the password is a secret field', () => {
  const password = manifest.config_schema.find((field) => field.key === 'password');
  assert.equal(password.type, 'secret');
  assert.equal(password.default, undefined);
});

// The store schema is the admission authority.
const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];

test('every field uses a type and a shape the store accepts', () => {
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/, `field key "${field.key}" must be snake_case`);
    if (field.placeholder !== undefined) {
      assert.equal(typeof field.placeholder, 'object', `field "${field.key}": placeholder object`);
      assert.ok(['string', 'number', 'secret'].includes(field.type), `field "${field.key}"`);
    }
    if (field.min !== undefined || field.max !== undefined) {
      assert.equal(field.type, 'number', `field "${field.key}": min/max are number-only`);
    }
    if (field.source !== undefined) {
      assert.equal(field.source, 'devices');
      assert.equal(field.options, undefined, `field "${field.key}": source and options`);
    }
    if (field.type === 'section') {
      assert.equal(field.required, undefined);
      assert.equal(field.default, undefined);
      for (const link of field.links ?? []) {
        assert.match(link.url, /^https:\/\//);
      }
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-nissanconnect:${manifest.version}`);
});

test('the name and description fit what the store allows', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${language}: ${text.length}`);
  }
});

const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('the categories stay inside the vocabulary the store indexes', () => {
  const { categories } = manifest;
  assert.ok(categories.length >= 1 && categories.length <= 3);
  assert.equal(new Set(categories).size, categories.length);
  for (const category of categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
});

test('the Gladys floor covers every field the manifest declares', () => {
  // `categories` needs 4.86, widgets and scene declarations 5.1, `keywords` 5.3.
  const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 3), `got ${manifest.gladys_version}`);
});

test('the search keywords follow the store rules', () => {
  const { keywords } = manifest;
  assert.ok(keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('the integration is tagged cloud only: it never talks to the car on the LAN', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text of the manifest carries en, fr, de and es', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 50, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the per-language length limits of the store hold in every language', () => {
  const within = (text, min, max, where) => {
    for (const language of LANGUAGES) {
      const { length } = text[language];
      assert.ok(length >= min && length <= max, `${where}.${language}: ${length} characters`);
    }
  };
  for (const widget of manifest.widgets) {
    within(widget.label, 3, 30, `widget ${widget.key} label`);
    within(widget.description, 1, 100, `widget ${widget.key} description`);
  }
  for (const section of allFields.filter((field) => field.type === 'section')) {
    within(section.description, 1, 1000, `section ${section.key} description`);
  }
});

test('the user documentation exists in every language', async () => {
  for (const language of LANGUAGES) {
    const text = await readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
    assert.ok(text.length > 1000, `docs/${language}.md is too short`);
  }
});

test('the catalog countries: Europe, which needs Gladys >= 5.3.0', () => {
  // Only the European NissanConnect Services cloud is supported: its 20 main markets (the field takes 20 codes at most).
  // Declared, the catalog of an instance located elsewhere hides the
  // integration from its browse views (the search still finds it).
  assert.deepEqual(manifest.countries, [
    'GB',
    'IE',
    'FR',
    'BE',
    'LU',
    'NL',
    'DE',
    'AT',
    'CH',
    'IT',
    'ES',
    'PT',
    'NO',
    'SE',
    'DK',
    'FI',
    'PL',
    'CZ',
    'HU',
    'SK',
  ]);
  const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
  assert.ok(major > 5 || (major === 5 && minor >= 3), 'countries needs Gladys 5.3.0');
});
