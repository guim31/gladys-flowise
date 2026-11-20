// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, scene action
// errors. Four languages, the four of the Gladys interface; German says "du",
// Spanish "usted". test/i18n.test.js checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './flowise/client.js';

/**
 * A failure shown in red by Gladys (a returned value is shown in green, a
 * thrown one in red), its message in every language.
 */
export class ActionFailure extends Error {
  constructor(text, options) {
    super(text.en, options);
    this.name = 'ActionFailure';
    this.message = text;
  }
}

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Flowise server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Flowise dans la configuration.",
    de: 'Gib die Adresse deines Flowise-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Flowise en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.20:3000',
    fr: 'Adresse incomprise, ex. http://192.168.1.20:3000',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.20:3000',
    es: 'Dirección no válida, p. ej. http://192.168.1.20:3000',
  },
};

// One short explanation per error kind (src/flowise/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Flowise does not answer: check the address and the port',
    fr: "Flowise ne répond pas : vérifiez l'adresse et le port",
    de: 'Flowise antwortet nicht: Prüfe die Adresse und den Port',
    es: 'Flowise no responde: compruebe la dirección y el puerto',
  },
  [ERROR_KINDS.TIMEOUT]: {
    en: 'Flowise took too long to answer',
    fr: 'Flowise a mis trop de temps à répondre',
    de: 'Flowise hat zu lange für die Antwort gebraucht',
    es: 'Flowise ha tardado demasiado en responder',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'access refused: check the API key',
    fr: "accès refusé : vérifiez la clé d'API",
    de: 'Zugriff verweigert: Prüfe den API-Schlüssel',
    es: 'acceso denegado: compruebe la clave de API',
  },
  [ERROR_KINDS.NOT_FLOWISE]: {
    en: 'no Flowise server at this address',
    fr: 'aucun serveur Flowise à cette adresse',
    de: 'kein Flowise-Server unter dieser Adresse',
    es: 'no hay ningún servidor Flowise en esta dirección',
  },
  [ERROR_KINDS.FLOW_NOT_FOUND]: {
    en: 'flow not found: copy its id from the Flowise address bar',
    fr: "flux introuvable : copiez son identifiant depuis la barre d'adresse de Flowise",
    de: 'Flow nicht gefunden: Kopiere seine ID aus der Adresszeile von Flowise',
    es: 'flujo no encontrado: copie su identificador desde la barra de direcciones de Flowise',
  },
  [ERROR_KINDS.FLOW_FAILED]: {
    en: 'the flow failed in Flowise: open it there to see which node',
    fr: 'le flux a échoué dans Flowise : ouvrez-le pour voir quel nœud',
    de: 'der Flow ist in Flowise fehlgeschlagen: Öffne ihn dort, um den Knoten zu sehen',
    es: 'el flujo ha fallado en Flowise: ábralo allí para ver qué nodo',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'Flowise refused the request, see the logs',
    fr: 'Flowise a refusé la requête, voir les logs',
    de: 'Flowise hat die Anfrage abgelehnt, sieh in den Protokollen nach',
    es: 'Flowise ha rechazado la solicitud, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version) => (version ? `Flowise ${version} answers.` : 'Flowise answers.'),
    flows: (count) => `${count} flow(s)`,
    none: 'No flow yet: create one in Flowise.',
    noKey: 'Without API key, the list of flows is not read: scenes need the id of a flow.',
  },
  fr: {
    ok: (version) => (version ? `Flowise ${version} répond.` : 'Flowise répond.'),
    flows: (count) => `${count} flux`,
    none: "Aucun flux pour l'instant : créez-en un dans Flowise.",
    noKey:
      "Sans clé d'API, la liste des flux n'est pas lue : les scènes ont besoin de l'identifiant d'un flux.",
  },
  de: {
    ok: (version) => (version ? `Flowise ${version} antwortet.` : 'Flowise antwortet.'),
    flows: (count) => `${count} Flow(s)`,
    none: 'Noch kein Flow: Erstelle einen in Flowise.',
    noKey:
      'Ohne API-Schlüssel wird die Liste der Flows nicht gelesen: Szenen brauchen die ID eines Flows.',
  },
  es: {
    ok: (version) => (version ? `Flowise ${version} responde.` : 'Flowise responde.'),
    flows: (count) => `${count} flujo(s)`,
    none: 'Todavía ningún flujo: cree uno en Flowise.',
    noKey:
      'Sin clave de API, no se lee la lista de flujos: las escenas necesitan el identificador de un flujo.',
  },
};

// Errors of the scene action (shown in red in Gladys).
export const ACTION_TEXT = {
  noFlow: {
    en: 'Which flow? Type its id in the action, or a default flow in the configuration.',
    fr: "Quel flux ? Saisissez son identifiant dans l'action, ou un flux par défaut dans la configuration.",
    de: 'Welcher Flow? Gib seine ID in der Aktion ein oder einen Standard-Flow in der Konfiguration.',
    es: '¿Qué flujo? Escriba su identificador en la acción o un flujo predeterminado en la configuración.',
  },
  nameNeedsKey: {
    en: 'A flow given by its name needs the API key in the configuration; or type its id.',
    fr: "Un flux donné par son nom demande la clé d'API dans la configuration ; sinon saisissez son identifiant.",
    de: 'Ein Flow, der über seinen Namen angegeben wird, braucht den API-Schlüssel in der Konfiguration; oder gib seine ID ein.',
    es: 'Un flujo indicado por su nombre necesita la clave de API en la configuración; o escriba su identificador.',
  },
  unknownName: {
    en: 'No flow of this name in Flowise.',
    fr: 'Aucun flux de ce nom dans Flowise.',
    de: 'Kein Flow mit diesem Namen in Flowise.',
    es: 'Ningún flujo con este nombre en Flowise.',
  },
  ambiguousName: {
    en: 'Several flows have this name in Flowise: type the id of the one to use.',
    fr: "Plusieurs flux portent ce nom dans Flowise : saisissez l'identifiant de celui à utiliser.",
    de: 'Mehrere Flows tragen diesen Namen in Flowise: Gib die ID des gewünschten ein.',
    es: 'Varios flujos tienen este nombre en Flowise: escriba el identificador del que desea usar.',
  },
  noQuestion: {
    en: 'The question is empty.',
    fr: 'La question est vide.',
    de: 'Die Frage ist leer.',
    es: 'La pregunta está vacía.',
  },
  emptyAnswer: {
    en: 'Flowise returned an empty answer.',
    fr: 'Flowise a renvoyé une réponse vide.',
    de: 'Flowise hat eine leere Antwort geliefert.',
    es: 'Flowise ha devuelto una respuesta vacía.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A text of every language, built from a function of the language. */
export const everyLanguage = (render) =>
  Object.fromEntries(['en', 'fr', 'de', 'es'].map((language) => [language, render(language)]));
