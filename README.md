# claude-code-mods

Claude Code mods I use day to day.

Mods are Claude Code plugins of function hooks: they change what Claude Code
itself shows and does. They only run in Claude Code; for harness-agnostic
skills see [agent-skills](https://github.com/JanSuthacheeva/agent-skills).

## Mods

| Mod | What it does |
|---|---|
| [merge-status](merge-status/README.md) | Shows the open merge requests (GitLab) or pull requests (GitHub) of the current branch in a row under the prompt (merged and closed ones are left out): target branch, pipeline or checks and conflict signs, linked to their page. Refetches on git events, polls running pipelines, and asks Claude to investigate a pipeline that fails. Needs [glab](https://gitlab.com/gitlab-org/cli) or [gh](https://cli.github.com), logged in. |
| [skill-usage](skill-usage/README.md) | Counts how often each skill is invoked, split into invocations you typed (`/skill`) and ones Claude made through the Skill tool, against the number of sessions, prompts and turns. `/skill-usage` toggles a table above the prompt. The counts live in `~/.claude/skill-usage.json`. |
| [plan-progress](plan-progress/README.md) | Shows where you and Claude are in a markdown plan in a side pane: checkboxes grouped by heading, the item Claude is on, what is next and what is left. Claude reports through a small tool that ticks the checkboxes in the file. Remembered per project across sessions. `/plan-progress` toggles the pane. |
| [flows](flows/README.md) | Shows every feature flow you run in parallel in a tabbed board above the prompt: one card per flow with its state, phase, tasks and blocker, and a tab per flow with its timeline and decisions. Digits and vim keys move around. `/flows` toggles it. Experimental: needs the `flow` CLI, which is not published yet. |

## Install

This repository is a Claude Code plugin marketplace. In Claude Code:

```
/plugin marketplace add JanSuthacheeva/claude-code-mods
/plugin install merge-status@claude-code-mods
/plugin install skill-usage@claude-code-mods
/plugin install plan-progress@claude-code-mods
/plugin install flows@claude-code-mods
```

`/plugin marketplace update claude-code-mods` pulls new versions.

For development, clone the repo and link a mod into your skills directory
instead, so changes load without reinstalling. An installed copy of the same
mod takes precedence over the linked one:

```sh
git clone https://github.com/JanSuthacheeva/claude-code-mods.git
ln -s "$PWD/claude-code-mods/merge-status" ~/.claude/skills/merge-status
```

The mod API is in early access and may change between Claude Code releases.
Each mod's README names the version it was tested on.

## Tests

Each mod ships unit and end-to-end tests:

```sh
claude plugin validate merge-status
claude plugin test merge-status
```

## License

[MIT](LICENSE)
