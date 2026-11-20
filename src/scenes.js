// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Ask Flowise" sends a question (scene variables included, the core resolves
// them before the call) to a chatflow or an agentflow, and hands its answer
// to the next actions as an output (`{{<column>.<row>.response}}`): the scene
// then sends it by message, reads it aloud or tests it, with the core's own
// actions. A conversation name keeps the memory of the flow from one run to
// the next. The answer is also kept on the "Last answer" feature.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async ask(hub, { fields = {} }) {
    return hub.ask({
      question: fields.question,
      flow: fields.flow,
      session: fields.conversation,
      maxCharacters: fields.max_characters,
    });
  },
};
