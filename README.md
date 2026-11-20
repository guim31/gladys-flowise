# Flowise for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
brings [Flowise](https://flowiseai.com), the visual builder of AI chatflows and
agents, to Gladys scenes: send a question with the scene information in it to a
chatflow or an agentflow, and hand its answer to the next actions (a message, a
speaker, a condition). It also follows the server.

## Features

- **Scene action _Ask Flowise_**: a question (with scene variables), a flow
  (its id, the address of its canvas copied from the browser, or its name with
  an API key; the default flow otherwise), an optional **conversation** name
  that keeps the memory of the flow from one run to the next (the Flowise
  `sessionId`), and a longest answer in characters. The outputs **Answer**,
  **Flow used**, **Conversation id**, **Answer time** and **Answer cut** are
  available to the following actions. Every failure (server unreachable, flow
  not found, key refused, flow in error, empty answer) is shown in red with its
  reason, in four languages.
- **One device "Flowise"**: online, number of flows (with an API key), last
  answer (text).
- **Scene triggers**: _Flowise is offline_ (two failed readings in a row, with
  the reason) and _Flowise is back online_ (with the length of the outage).
- **Dashboard widget** "Flowise": the server and its version, the number of
  flows, the flow and time of the last answer and its beginning (a setting
  hides it).
- A **Test the connection** button that lists the flows.
- English, French, German and Spanish everywhere.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions,
  action outputs).
- A **Flowise** server reachable from Gladys (port 3000 by default), with at
  least one chatflow or agentflow. An **API key** (Flowise → API Keys) is
  optional: it lists the flows, lets a scene name a flow by its name, and opens
  the flows protected by a key.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-flowise` (or
   install **Flowise** from the catalog once it is listed).
2. In **Configuration**, enter the address of the server (`192.168.1.20`,
   port 3000 added; `host:port`; or the URL of a reverse proxy), the API key
   and a default flow, then press **Test the connection**.
3. In the **Discovery** tab, add the **Flowise** device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- Every refresh interval (30 s to 5 min, 1 min by default), the server is read
  with `GET /api/v1/ping`, `GET /api/v1/version` and, with a key,
  `GET /api/v1/chatflows`. The device is published with `should_poll: false`:
  the container reads the server on its own timer, the interval goes beyond
  the list of the Gladys scheduler, and the scene events must fire even when
  the device was not added. Only the values that changed are sent, all of them
  again when the device is added, and every 12 hours.
- A question is `POST /api/v1/prediction/{id}` with `streaming: false` and,
  for a conversation, `overrideConfig.sessionId`. The key goes as a Bearer
  token. The wait is configurable (30 to 110 s; Gladys grants the action
  120 s).
- The server is "offline" after two failed readings in a row (the second 15 s
  after the first), counting only silence (refused connection, timeout): a
  refused key or a wrong address is a configuration problem, shown in the
  connection status.
- Nothing is stored under `/data`. The questions and the answers never reach
  the logs (only the flow, the time and the length of the answer); the API key
  neither.

## Checked on a real Flowise

On 20/11/2026 the integration was checked against a real Flowise server
(`flowiseai/flowise` 3.1.2, in Docker) with an agentflow without model (Start →
Direct Reply); its answers are the fixtures of the tests
(`test/fixtures/flowise/`): an answer, a conversation kept by `sessionId`, an
unknown flow (404), a malformed id (400), a flow protected by a key asked
without it (500 "Unauthorized"), a flow in error (500), a refused key on the
list (401). The Docker image of the integration was run with the Gladys
sandbox constraints (read-only root, all capabilities dropped, 256 MB, bridge
network) against that server. Not checked: the widget and the scene editor in
a real Gladys, a flow calling a real language model. Feedback welcome.

## Limitations

- One server per Gladys. Text only: no image or file upload, no streaming.
- Flowise variables (`overrideConfig.vars`) are not sent (Flowise refuses them
  unless the flow allows overrides): put the scene information in the
  question.
- Gladys waits two minutes at most for a scene action, and caps an output at
  10,000 characters.
- **Langflow** is not supported: its API (`/api/v1/run/{flow}`), its keys and
  its answers are different; it would be a separate integration.
- Names ending in `.local` do not resolve inside the integration container:
  use IP addresses or names your DNS resolves.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and a fake Flowise (`test/helpers/fakeFlowise.js`) built on answers recorded
from a real server. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Flowise](https://github.com/FlowiseAI/Flowise) (Apache-2.0): the API, and the
  logo on the cover (`images/flowise_white.svg` of the Flowise repository).
- The architecture follows [gladys-ollama](https://github.com/guim31/gladys-ollama),
  and the conformity tests [gladys-wled](https://github.com/guim31/gladys-wled).
- Home Assistant has no Flowise integration in its core; no code was copied
  from any project.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by FlowiseAI.
"Flowise" and the Flowise logo belong to their owners.

## License

Apache-2.0
