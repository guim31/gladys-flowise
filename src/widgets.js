// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `flowise`.
//
// The use cases: is the server up (the scenes that ask it depend on it), how
// many flows it holds, and what the last question of a scene got back,
// readable on a tablet without opening the scene history.
//
// Budget (8 components, 2 texts): one value (flows, with an API key only),
// one status list (the server, then the last answer: its flow and time) and
// one text (the answer itself, hidden by the `show_answer` setting).
// Nothing here is bound to device features: the widget works before the
// device is added to Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { shortAnswer } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { ERROR_KINDS } from './flowise/client.js';
import { pick } from './texts.js';

// The text block shows the beginning of a long answer.
export const WIDGET_ANSWER_MAX = 300;

export const TEXT = {
  noUrl: {
    en: 'Enter the address of your Flowise server in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Flowise dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Flowise-Servers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Flowise en la configuración de la integración.',
  },
  flows: { en: 'Flows', fr: 'Flux', de: 'Flows', es: 'Flujos' },
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  lastAnswer: {
    en: 'Last answer',
    fr: 'Dernière réponse',
    de: 'Letzte Antwort',
    es: 'Última respuesta',
  },
  noAnswer: {
    en: 'No question asked yet',
    fr: 'Aucune question posée',
    de: 'Noch keine Frage gestellt',
    es: 'Ninguna pregunta todavía',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** "14:05" today, "19/10 14:05" another day, in the time zone of Gladys (TZ). */
export function formatTime(at, now) {
  const date = new Date(at);
  const pad = (n) => String(n).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return new Date(now).toDateString() === date.toDateString()
    ? time
    : `${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${time}`;
}

function serverRow(state, language) {
  if (state.error && (state.down || state.online === null)) {
    const unreachable = [ERROR_KINDS.UNREACHABLE, ERROR_KINDS.TIMEOUT].includes(state.error.kind);
    return {
      label: 'Flowise',
      icon: 'alert-triangle',
      value: t(unreachable ? TEXT.unreachable : TEXT.error, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (state.online) {
    return {
      label: 'Flowise',
      icon: 'git-merge',
      value: fit(
        state.version ? `${t(TEXT.online, language)} · ${state.version}` : t(TEXT.online, language),
        40,
      ),
      color: state.error ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    };
  }
  return {
    label: 'Flowise',
    icon: 'clock',
    value: t(TEXT.waiting, language),
    color: WIDGET_COLORS.NEUTRAL,
  };
}

async function get(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.client) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: t(TEXT.noUrl, language) }],
    };
  }
  const { state, lastAnswer } = hub;
  const components = [];
  if (state.flows) {
    components.push({
      type: 'value',
      value: state.flows.length,
      label: t(TEXT.flows, language),
      icon: 'git-merge',
    });
  }
  const items = [serverRow(state, language)];
  items.push(
    lastAnswer
      ? {
          label: fit(lastAnswer.flow, 40),
          icon: 'message-square',
          value: formatTime(lastAnswer.at, hub.now()),
          color: WIDGET_COLORS.PRIMARY,
        }
      : {
          label: t(TEXT.lastAnswer, language),
          icon: 'message-square',
          value: t(TEXT.noAnswer, language),
          color: WIDGET_COLORS.NEUTRAL,
        },
  );
  components.push({ type: 'status', items });
  if (lastAnswer && settings.show_answer !== false && settings.show_answer !== 'false') {
    components.push({
      type: 'text',
      variant: 'body',
      text: fit(shortAnswer(lastAnswer.text), WIDGET_ANSWER_MAX),
    });
  }
  return { ttl_seconds: 60, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get },
};
