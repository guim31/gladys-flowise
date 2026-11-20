# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Scene action _Ask Flowise_: a question with scene variables sent to a
  chatflow or an agentflow (given by its id, its address or its name), an
  optional conversation that keeps the memory of the flow from one run to the
  next, and the longest answer; the answer, the flow, the conversation id, the
  answer time and whether the answer was cut are handed to the next actions.
  Every failure shows in red with its reason.
- A "Flowise" device: online, number of flows (with an API key), last answer.
- Scene triggers _Flowise is offline_ and _Flowise is back online_.
- Dashboard widget "Flowise": server, flows, last answer.
- _Test the connection_ lists the flows.
- English, French, German and Spanish everywhere.

[Unreleased]: https://github.com/guim31/gladys-flowise/commits/main
