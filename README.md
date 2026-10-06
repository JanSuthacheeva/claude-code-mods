# claude-code-mods

Claude Code mods I use day to day.

Mods are Claude Code plugins of function hooks: they change what Claude Code
itself shows and does. They only run in Claude Code; for harness-agnostic
skills see [agent-skills](https://github.com/JanSuthacheeva/agent-skills).

## Mods

| Mod | What it does |
|---|---|
| [merge-status](merge-status/README.md) | Shows the open merge requests (GitLab) or pull requests (GitHub) of the current branch in a row under the prompt (merged and closed ones are left out): target branch, pipeline or checks and conflict signs, linked to their page. Refetches on git events, polls running pipelines, and asks Claude to investigate a pipeline that fails. Needs [glab](https://gitlab.com/gitlab-org/cli) or [gh](https://cli.github.com), logged in. |

## Install

This repository is a Claude Code plugin marketplace. In Claude Code:

```
/plugin marketplace add JanSuthacheeva/claude-code-mods
/plugin install merge-status@claude-code-mods
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
