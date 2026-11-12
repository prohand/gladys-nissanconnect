// -----------------------------------------------------------------------------
// User-facing messages: connection status, action answers, transport badge.
// Every one is a `{ en, fr, de, es }` object (see src/i18n.js): Gladys shows
// the reader's language and falls back to English.
// -----------------------------------------------------------------------------

import { localize, pick } from './i18n.js';

export const MESSAGES = {
  notConfigured: {
    en: 'Fill in the login and password of your NissanConnect Services account.',
    fr: 'Renseignez l’identifiant et le mot de passe de votre compte NissanConnect Services.',
    de: 'Gib die Anmeldedaten und das Passwort deines NissanConnect-Services-Kontos ein.',
    es: 'Indique el usuario y la contraseña de su cuenta NissanConnect Services.',
  },
  badCredentials: {
    en: 'Nissan refused the login or password: check them in the configuration.',
    fr: 'Nissan a refusé l’identifiant ou le mot de passe : vérifiez-les dans la configuration.',
    de: 'Nissan hat die Anmeldedaten oder das Passwort abgelehnt: Prüfe sie in der Konfiguration.',
    es: 'Nissan ha rechazado el usuario o la contraseña: compruébelos en la configuración.',
  },
  noVehicle: {
    en: 'Connected, but this NissanConnect account has no car.',
    fr: 'Connecté, mais ce compte NissanConnect n’a aucune voiture.',
    de: 'Verbunden, aber dieses NissanConnect-Konto hat kein Auto.',
    es: 'Conectado, pero esta cuenta NissanConnect no tiene ningún coche.',
  },
  unknownVehicle: {
    en: 'This car is not (or no longer) in the NissanConnect account.',
    fr: 'Cette voiture n’est pas (ou plus) dans le compte NissanConnect.',
    de: 'Dieses Auto ist nicht (mehr) im NissanConnect-Konto.',
    es: 'Este coche no está (o ya no está) en la cuenta NissanConnect.',
  },
};

/** The Nissan cloud could not be reached or answered an error. */
export function unreachable(reason) {
  return localize((language) =>
    pick(language, {
      en: `NissanConnect Services unreachable: ${reason}`,
      fr: `NissanConnect Services injoignable : ${reason}`,
      de: `NissanConnect Services nicht erreichbar: ${reason}`,
      es: `NissanConnect Services inaccesible: ${reason}`,
    }),
  );
}

/** Answer of "Test the connection". */
export function connectedWith(vehicles) {
  const names = vehicles.map((vehicle) => `${vehicle.name} (${vehicle.vin})`).join(', ');
  return localize((language) => {
    const count = vehicles.length;
    return pick(language, {
      en: `Connected to NissanConnect Services: ${count} car${count > 1 ? 's' : ''} — ${names}.`,
      fr: `Connecté à NissanConnect Services : ${count} voiture${count > 1 ? 's' : ''} — ${names}.`,
      de: `Mit NissanConnect Services verbunden: ${count} Auto${count > 1 ? 's' : ''} — ${names}.`,
      es: `Conectado a NissanConnect Services: ${count} coche${count > 1 ? 's' : ''} — ${names}.`,
    });
  });
}

/** Answer of "Wake up the car". */
export function wakeSent(name) {
  return localize((language) =>
    pick(language, {
      en: `${name} was asked to send fresh data: it shows up in Gladys within a few minutes.`,
      fr: `${name} a reçu la demande d’envoyer des données fraîches : elles arrivent dans Gladys d’ici quelques minutes.`,
      de: `${name} wurde gebeten, frische Daten zu senden: Sie erscheinen in wenigen Minuten in Gladys.`,
      es: `Se ha pedido a ${name} que envíe datos nuevos: aparecerán en Gladys en unos minutos.`,
    }),
  );
}

/** Answer of "Identify a car" (lights flashed). */
export function lightsFlashed(name) {
  return localize((language) =>
    pick(language, {
      en: `${name} is flashing its lights.`,
      fr: `${name} fait clignoter ses feux.`,
      de: `${name} lässt seine Lichter blinken.`,
      es: `${name} hace parpadear sus luces.`,
    }),
  );
}

/** Answer of a climate command sent from the widget. */
export function climateSent(name, on) {
  return localize((language) =>
    pick(
      language,
      on
        ? {
            en: `Climate starting in ${name}.`,
            fr: `Climatisation en cours de démarrage dans ${name}.`,
            de: `Klimatisierung in ${name} wird gestartet.`,
            es: `Climatización arrancando en ${name}.`,
          }
        : {
            en: `Climate stopping in ${name}.`,
            fr: `Arrêt de la climatisation dans ${name}.`,
            de: `Klimatisierung in ${name} wird gestoppt.`,
            es: `Climatización deteniéndose en ${name}.`,
          },
    ),
  );
}

/** Answer of a charge command sent from the widget. */
export function chargingSent(name, on) {
  return localize((language) =>
    pick(
      language,
      on
        ? {
            en: `Charge starting for ${name}.`,
            fr: `Démarrage de la charge de ${name}.`,
            de: `Ladevorgang für ${name} wird gestartet.`,
            es: `Iniciando la carga de ${name}.`,
          }
        : {
            en: `Charge stopping for ${name}.`,
            fr: `Arrêt de la charge de ${name}.`,
            de: `Ladevorgang für ${name} wird gestoppt.`,
            es: `Deteniendo la carga de ${name}.`,
          },
    ),
  );
}

/** Tooltip of the degraded transport badge: the car data is old. */
export function staleData(hours) {
  return localize((language) =>
    pick(language, {
      en: `The car has sent no data for ${hours} h (asleep or out of coverage).`,
      fr: `La voiture n’a pas envoyé de données depuis ${hours} h (en veille ou hors couverture).`,
      de: `Das Auto hat seit ${hours} h keine Daten gesendet (Ruhezustand oder kein Empfang).`,
      es: `El coche no ha enviado datos desde hace ${hours} h (en reposo o sin cobertura).`,
    }),
  );
}
