# Changelog

All notable changes to skill-usage are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-10

### Added

- Counts each skill invocation, split into ones you typed as `/name`, ones Claude made through the Skill tool, and preloads.
- Counts sessions, prompts and turns alongside, and keeps everything in `~/.claude/skill-usage.json`.
- `/skill-usage` shows or hides a band above the prompt with the ranked skills, a you/claude bar, invocations per 100 prompts and when each skill was last used.
