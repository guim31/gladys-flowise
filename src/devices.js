// -----------------------------------------------------------------------------
// One Gladys device: the Flowise server.
//
// Identity: a fixed id. One server per integration: changing its address (an
// IP for a name, a port, a proxy) keeps the device and its history.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - online: input/binary, 1 when the server answers, 0 once it failed two
//     readings in a row (a blip is not an outage);
//   - flows: counter-sensor/integer, the chatflows and agentflows of the
//     instance; only with an API key (Flowise lists them only with one);
//   - last answer: text/text, the last answer a scene received, so a
//     dashboard shows it (cut at LAST_ANSWER_MAX characters).
//
// should_poll: false: the hub reads the server on its own timer, at the
// interval chosen in the configuration (see src/hub.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'server';
export const DEVICE_ID = 'flowise';
export const URL_PARAM = 'FLOWISE_URL';

// The dashboard shows a text feature on one row: a long answer stays in the
// scene, the device keeps its beginning.
export const LAST_ANSWER_MAX = 500;

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  FLOWS: 'flows',
  LAST_ANSWER: 'last_answer',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.FLOWS]: 'Flows',
    [FEATURE_KEYS.LAST_ANSWER]: 'Last answer',
  },
  fr: {
    [FEATURE_KEYS.ONLINE]: 'En ligne',
    [FEATURE_KEYS.FLOWS]: 'Flux',
    [FEATURE_KEYS.LAST_ANSWER]: 'Dernière réponse',
  },
  de: {
    [FEATURE_KEYS.ONLINE]: 'Online',
    [FEATURE_KEYS.FLOWS]: 'Flows',
    [FEATURE_KEYS.LAST_ANSWER]: 'Letzte Antwort',
  },
  es: {
    [FEATURE_KEYS.ONLINE]: 'En línea',
    [FEATURE_KEYS.FLOWS]: 'Flujos',
    [FEATURE_KEYS.LAST_ANSWER]: 'Última respuesta',
  },
};

/** The answer as the device keeps it: one line, cut at LAST_ANSWER_MAX. */
export function shortAnswer(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > LAST_ANSWER_MAX ? `${line.slice(0, LAST_ANSWER_MAX - 1).trimEnd()}…` : line;
}

// Order = display order in Gladys. A value of null publishes nothing.
const FEATURES = [
  {
    key: FEATURE_KEYS.ONLINE,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.INPUT,
      type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      max: 1,
    },
    value: (state) => (state.online === null ? null : state.online ? 1 : 0),
  },
  {
    key: FEATURE_KEYS.FLOWS,
    withKeyOnly: true,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
      type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
      read_only: true,
      has_feedback: false,
      keep_history: true,
      min: 0,
      // Display bound only, the core never applies it on write.
      max: 10_000,
    },
    value: (state) => state.flows?.length ?? null,
  },
  {
    key: FEATURE_KEYS.LAST_ANSWER,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: 0,
    },
    // Gladys ignores an empty text.
    value: (state) => (state.lastAnswer?.text ? shortAnswer(state.lastAnswer.text) : null),
  },
];

/** External ids of the device and its features. */
export const deviceIds = (gladys) => gladys.externalIds(DEVICE_TYPE, DEVICE_ID);

const featuresFor = (withKey) => FEATURES.filter((feature) => withKey || !feature.withKeyOnly);

/**
 * The discovery payload of the server.
 * @param {object} gladys SDK client
 * @param {string} url base URL of the server
 * @param {object} [options]
 * @param {string} [options.language] feature names language
 * @param {boolean} [options.withKey] an API key is set: the flows are counted
 */
export function buildDevice(gladys, url, { language = 'en', withKey = false } = {}) {
  const ids = deviceIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'Flowise',
    external_id: ids.device,
    should_poll: false,
    params: [{ name: URL_PARAM, value: url }],
    features: featuresFor(withKey).map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature for a server state (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null }>}
 */
export function featureValues(gladys, state, withKey) {
  const ids = deviceIds(gladys);
  return featuresFor(withKey).map(({ key, value }) => ({
    key,
    externalId: ids.feature(key),
    value: value(state),
  }));
}
