# merge-status

A Claude Code mod that shows the GitLab merge requests of your current branch in a row under the prompt:

```
󰮠  !3609 open → develop ✓ ⚠ · !3610 draft → sprint-33-2 ○
```

## Requirements

- **Claude Code with function-hook plugins (mods)**, tested on 2.1.291. The mod API is in early access and may change between releases.
- **[glab](https://gitlab.com/gitlab-org/cli)**, the GitLab CLI, on your `PATH` (tested with 1.80).
  See its [installation guide](https://gitlab.com/gitlab-org/cli#installation), for example:
  ```sh
  brew install glab          # macOS, Linux (Homebrew)
  winget install GLab.GLab   # Windows
  ```
- **glab logged in to your GitLab host**, for example a self-hosted instance:
  ```sh
  glab auth login --hostname git.example.com
  glab auth status
  ```
- **An `origin` remote on that GitLab host.** Repositories on github.com, or without an `origin` remote, are ignored.
- **A [Nerd Font](https://www.nerdfonts.com)** in your terminal for the GitLab icon.
- **macOS, Linux or Windows.** `/mr` opens links with `open` on macOS, `xdg-open` on Linux
  and the system URL handler on Windows. Developed and verified on macOS; Linux and Windows are covered by tests only.

If glab is missing or not logged in, the row says so and tells you how to fix it.

## The row

| Sign             | Meaning                                             |
| ---------------- | --------------------------------------------------- |
| `!3609`          | MR number, linked to its page                       |
| `open` / `draft` | MR state; only open MRs are shown, otherwise `none` |
| `→ develop`      | Target branch                                       |
| `✓` `⟳` `✗` `○`  | Pipeline passed, running, failed, none              |
| `⚠`              | Merge conflict                                      |

MRs are ordered by target branch: feature and bugfix branches first, then `develop`, `sprint-*` and `main`.
Colors follow your Claude Code theme.

## Commands

- `/mrs` hides or shows the row.
- `/mr` opens the first MR in the browser, `/mr 2` the second, `/mr 3609` a specific one.

## What it fetches, and when

Everything runs through `glab` and local `git`; nothing reaches the model or costs tokens, except failure investigations.

- **Full refresh** on session start and after a checkout, switch, push, pull or `glab mr create`,
  whether Claude runs it or you do (a local git check runs every 15 seconds).
- **Open MRs** are re-listed every 2 minutes, so MRs merged or closed elsewhere disappear.
- **Pipelines** are polled every 30 seconds while running and every 2 minutes after failing, and never once passed.
  Right after a push, the previous pipeline counts as running until GitLab starts the new one.
- **Failed pipelines** you saw running start one Claude turn that investigates the failure and reports the cause,
  without changing code. This turn costs tokens.

## Development

```sh
claude plugin validate .
claude plugin test .
```
