// -----------------------------------------------------------------------------
// Dashboard widget "Nissan car" (Gladys 5.1+, manifest `widgets`).
//
// The battery and range tiles are bound to the car's features: they
// are LIVE, the core updates them from the published states. The status rows
// and the buttons are computed here from the last read, and the service nudges
// the widget (requestWidgetRefresh) after every read.
//
// The buttons send what this content declared (`params`, never user input):
// a dashboard can hang on a wall, so the climate and the charge ask for a
// confirmation, and the map link is off unless the user turned it on.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURES, vehicleIds } from '../devices/vehicle.js';
import { localize, pick } from '../i18n.js';
import { chargingSent, climateSent, MESSAGES, wakeSent } from '../messages.js';
import { VEHICLE_WIDGET } from './keys.js';

const logger = createLogger({ name: 'widget' });

export const WIDGET_ACTIONS = Object.freeze({
  WAKE: 'wake',
  CLIMATE_ON: 'climate_on',
  CLIMATE_OFF: 'climate_off',
  CHARGE_ON: 'charge_on',
  CHARGE_OFF: 'charge_off',
});

const T = {
  noVehicle: {
    en: 'No car yet: fill in your NissanConnect account in the integration configuration.',
    fr: 'Aucune voiture pour l’instant : renseignez votre compte NissanConnect dans la configuration de l’intégration.',
    de: 'Noch kein Auto: Gib dein NissanConnect-Konto in der Konfiguration der Integration ein.',
    es: 'Todavía no hay coche: indique su cuenta NissanConnect en la configuración de la integración.',
  },
  battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  range: { en: 'Range', fr: 'Autonomie', de: 'Reichweite', es: 'Autonomía' },
  plugged: { en: 'Plugged in', fr: 'Branchée', de: 'Angesteckt', es: 'Enchufado' },
  charging: { en: 'Charging', fr: 'En charge', de: 'Lädt', es: 'Cargando' },
  climate: { en: 'Climate', fr: 'Climatisation', de: 'Klimatisierung', es: 'Climatización' },
  doors: { en: 'Doors', fr: 'Portes', de: 'Türen', es: 'Puertas' },
  lastUpdate: {
    en: 'Car data from',
    fr: 'Données de la voiture du',
    de: 'Fahrzeugdaten vom',
    es: 'Datos del coche del',
  },
  yes: { en: 'Yes', fr: 'Oui', de: 'Ja', es: 'Sí' },
  no: { en: 'No', fr: 'Non', de: 'Nein', es: 'No' },
  on: { en: 'On', fr: 'En marche', de: 'Ein', es: 'Encendida' },
  off: { en: 'Off', fr: 'Arrêtée', de: 'Aus', es: 'Apagada' },
  locked: { en: 'Locked', fr: 'Verrouillées', de: 'Verriegelt', es: 'Cerradas' },
  unlocked: { en: 'Unlocked', fr: 'Déverrouillées', de: 'Entriegelt', es: 'Abiertas' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  wake: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  climateOn: {
    en: 'Start climate',
    fr: 'Lancer la clim',
    de: 'Klima starten',
    es: 'Encender clima',
  },
  climateOff: {
    en: 'Stop climate',
    fr: 'Arrêter la clim',
    de: 'Klima stoppen',
    es: 'Apagar clima',
  },
  chargeOn: {
    en: 'Start charge',
    fr: 'Lancer la charge',
    de: 'Laden starten',
    es: 'Iniciar carga',
  },
  chargeOff: {
    en: 'Stop charge',
    fr: 'Arrêter la charge',
    de: 'Laden stoppen',
    es: 'Detener carga',
  },
  map: { en: 'Show on map', fr: 'Voir sur la carte', de: 'Auf Karte zeigen', es: 'Ver en el mapa' },
};

/** "Yes", or "Yes — 2 h 10 left" while charging with a known end. */
function chargingValue(status) {
  if (typeof status.charging !== 'boolean') {
    return T.unknown;
  }
  const minutes = status.chargeRemainingMinutes;
  if (!status.charging || !(minutes > 0)) {
    return status.charging ? T.yes : T.no;
  }
  const h = Math.floor(minutes / 60);
  const left = h > 0 ? `${h} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
  return localize((language) =>
    pick(language, {
      en: `Yes — ${left} left`,
      fr: `Oui — reste ${left}`,
      de: `Ja — noch ${left}`,
      es: `Sí — faltan ${left}`,
    }),
  );
}

function yesNo(value, yes = T.yes, no = T.no) {
  return typeof value === 'boolean' ? (value ? yes : no) : T.unknown;
}

function lastUpdateValue(iso) {
  if (!iso) {
    return T.unknown;
  }
  return localize((language) =>
    new Date(iso).toLocaleString(language, { dateStyle: 'short', timeStyle: 'short' }),
  );
}

/** The car a widget instance shows: the chosen one, or the first of the account. */
function widgetVehicle(service, settings) {
  return settings?.device ? service.findVehicle(settings.device) : (service.vehicles[0] ?? null);
}

/** Widget content (`onWidgetGet`). */
export function vehicleWidgetContent(service, { settings = {} } = {}) {
  const vehicle = widgetVehicle(service, settings);
  if (!vehicle) {
    return { ttl_seconds: 300, components: [{ type: 'text', text: T.noVehicle }] };
  }
  const ids = vehicleIds(service.gladys, vehicle.vin);
  const status = service.statuses.get(vehicle.vin) ?? {};
  const params = { device: ids.device };

  const buttons = [
    {
      type: 'button',
      label: T.wake,
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: WIDGET_ACTIONS.WAKE, params },
    },
    status.climateOn
      ? {
          type: 'button',
          label: T.climateOff,
          icon: 'wind',
          style: 'secondary',
          action: { key: WIDGET_ACTIONS.CLIMATE_OFF, params, confirm: true },
        }
      : {
          type: 'button',
          label: T.climateOn,
          icon: 'wind',
          style: 'primary',
          action: { key: WIDGET_ACTIONS.CLIMATE_ON, params, confirm: true },
        },
  ];
  // The charge can only be driven on a plugged car.
  if (status.charging === true) {
    buttons.push({
      type: 'button',
      label: T.chargeOff,
      icon: 'battery',
      style: 'danger',
      action: { key: WIDGET_ACTIONS.CHARGE_OFF, params, confirm: true },
    });
  } else if (status.plugged === true) {
    buttons.push({
      type: 'button',
      label: T.chargeOn,
      icon: 'battery-charging',
      style: 'primary',
      action: { key: WIDGET_ACTIONS.CHARGE_ON, params, confirm: true },
    });
  }
  if (settings.show_location === true && typeof status.latitude === 'number') {
    const { latitude: lat, longitude: lon } = status;
    buttons.push({
      type: 'button',
      label: T.map,
      icon: 'map-pin',
      style: 'secondary',
      link: { url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}` },
    });
  }

  return {
    ttl_seconds: 300,
    components: [
      { type: 'text', variant: 'heading', text: vehicle.name.slice(0, 40) },
      {
        type: 'gauge',
        label: T.battery,
        device_feature: ids.feature(FEATURES.BATTERY_LEVEL),
        color: WIDGET_COLORS.SUCCESS,
      },
      {
        type: 'value',
        label: T.range,
        icon: 'navigation',
        device_feature: ids.feature(FEATURES.RANGE),
      },
      {
        type: 'status',
        items: [
          {
            label: T.plugged,
            icon: 'power',
            value: yesNo(status.plugged),
            color: status.plugged ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: T.charging,
            icon: 'battery-charging',
            value: chargingValue(status),
            color: status.charging ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: T.climate,
            icon: 'wind',
            value: yesNo(status.climateOn, T.on, T.off),
            color: status.climateOn ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: T.doors,
            icon: 'lock',
            value: yesNo(status.locked, T.locked, T.unlocked),
            color: status.locked === false ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
          },
          {
            label: T.lastUpdate,
            icon: 'clock',
            value: lastUpdateValue(status.lastUpdate),
            color:
              service.reachable.get(vehicle.vin) === false
                ? WIDGET_COLORS.DANGER
                : WIDGET_COLORS.NEUTRAL,
          },
        ],
      },
      ...buttons,
    ],
  };
}

/** Widget button (`onWidgetAction`): resolves the toast shown to the user. */
export async function vehicleWidgetAction(service, { actionKey, params }) {
  logger.info(`onWidgetAction <- ${VEHICLE_WIDGET}.${actionKey}`);
  const vehicle = service.findVehicle(params?.device);
  if (!vehicle) {
    return MESSAGES.unknownVehicle;
  }
  service.requireVehicle(vehicle.vin);
  switch (actionKey) {
    case WIDGET_ACTIONS.WAKE:
      await service.wakeVehicle(vehicle);
      return wakeSent(vehicle.name);
    case WIDGET_ACTIONS.CLIMATE_ON:
    case WIDGET_ACTIONS.CLIMATE_OFF: {
      const on = actionKey === WIDGET_ACTIONS.CLIMATE_ON;
      await service.setClimate(vehicle, on);
      return climateSent(vehicle.name, on);
    }
    case WIDGET_ACTIONS.CHARGE_ON:
    case WIDGET_ACTIONS.CHARGE_OFF: {
      const on = actionKey === WIDGET_ACTIONS.CHARGE_ON;
      await service.setCharging(vehicle, on);
      return chargingSent(vehicle.name, on);
    }
    default:
      // Throwing acks the action as failed: the message reaches the user.
      throw new Error(`Unknown widget action: ${actionKey}`);
  }
}
