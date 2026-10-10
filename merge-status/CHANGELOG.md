# Changelog

All notable changes to merge-status are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-10-10

### Added

- `icons` setting: `text` shows `MR` or `PR` instead of the GitLab or GitHub logo, for terminals without a Nerd Font.

### Fixed

- The row comes back right after `/clear` instead of staying empty until the next git change.
- A row hidden with `/mrs` stays hidden after `/clear`.

## [0.2.0] - 2026-10-06

### Added

- GitHub pull requests through `gh`, picked from the `origin` remote, GitHub Enterprise hosts included. All checks of the head commit count as its pipeline.

## [0.1.0] - 2026-10-06

### Added

- A row under the prompt with the open GitLab merge requests of the current branch, through `glab`: number, draft or open, target branch, pipeline sign and conflict sign, each number linked to its page.
- Refreshes after a checkout, switch, push, pull or new MR, re-lists open MRs every 2 minutes and polls running or failed pipelines.
- Waits for the new pipeline after a push instead of showing the previous one as passed.
- Starts one Claude turn that investigates a pipeline seen running when it fails, without changing code.
- `/mrs` hides or shows the row, `/mr` opens an MR in the browser on macOS, Linux and Windows.
- Setup hints when `glab` is missing or not logged in.
