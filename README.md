# claude-code-mods

Claude Code mods I use day to day.

Mods are Claude Code plugins of function hooks: they change what Claude Code
itself shows and does. They only run in Claude Code; for harness-agnostic
skills see [agent-skills](https://github.com/JanSuthacheeva/agent-skills).

## Mods

| Mod | What it does |
|---|---|
| [merge-status](merge-status/README.md) | Shows the open merge requests of the current branch in a row under the prompt (merged and closed ones are left out): target branch, pipeline and conflict signs, linked to GitLab. Refetches on git events, polls running pipelines, and asks Claude to investigate a pipeline that fails. Needs [glab](https://gitlab.com/gitlab-org/cli), logged in. |

## Install

Clone the repo and link a mod into your skills directory, so updates arrive
with `git pull`. Claude Code loads it on the next start:

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
