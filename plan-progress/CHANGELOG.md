# Changelog

All notable changes to plan-progress are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- `/plan-progress @file` tracks the mentioned file instead of reporting it as not found.

## [0.1.0] - 2026-10-11

### Added

- A side pane that shows a markdown plan's checkboxes grouped by heading, with a progress bar, the item Claude is on, the next item and the last three reports.
- A `report` tool Claude calls with `doing`, `done` or `blocked`. `done` ticks the checkbox in the plan file.
- The tracked plan is remembered per project across sessions, and the pane follows edits to the file.
- `/plan-progress` toggles the pane, `/plan-progress <file>` tracks a plan, `/plan-progress stop` stops tracking.
