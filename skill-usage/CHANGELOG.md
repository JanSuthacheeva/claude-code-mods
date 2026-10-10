# Changelog

All notable changes to skill-usage are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.1] - 2026-10-10

### Fixed

- Skills you type as `/name` are now counted as yours. Before, they were not counted at all, as Claude Code does not raise the event the mod relied on for a typed skill.
- Other plugins' slash commands no longer show `+skill-usage` in their output, as in `merge-status+skill-usage: MRs hidden.`

## [0.1.0] - 2026-10-10

### Added

- Counts each skill invocation, split into ones you typed as `/name`, ones Claude made through the Skill tool, and preloads.
- Counts sessions, prompts and turns alongside, and keeps everything in `~/.claude/skill-usage.json`.
- `/skill-usage` shows or hides a band above the prompt with the ranked skills, a you/claude bar, invocations per 100 prompts and when each skill was last used.
