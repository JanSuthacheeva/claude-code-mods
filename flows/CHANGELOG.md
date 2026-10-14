# Changelog

All notable changes to flows are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A tabbed board above the prompt that shows every flow from `flow status --json`: one card per flow on `All`, and a tab per flow with its phases, blocker, timeline and decisions.
- Digits jump between tabs from an empty prompt; with the band focused `h`/`l` switch tabs, `j`/`k` move over cards or the timeline, Enter opens a card, `g` goes to the top and `o` opens the flow's merge request.
- `/flows` toggles the board and is remembered across sessions; `/flows <name>` opens that flow's tab.
- The board stacks above whatever another mod draws in the band and steps aside for surveys.
- A `flowPath` setting for the `flow` binary, and clear messages when it is missing, fails or speaks another contract version.
