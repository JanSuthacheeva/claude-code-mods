# skill-usage

A Claude Code mod that counts how often each skill is invoked, and by whom, so you can see that across 50 sessions and 5,000 turns a skill was invoked 100 times.

`/skill-usage` toggles a table above the prompt; run it again to hide it:

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ Skill usage   12 sessions   340 prompts   1,204 turns   since 2026-10-08       │
│                                                                              │
│      skill            you  claude  total                     /100p      last │
│   1. commit            12      30     42  ████████████████████  12.4   2h ago │
│   2. brainstorming      3      11     14  ███████▍──────────────  4.1   1d ago │
│   3. code-review        5       0      5  ███──────────────────  1.5   3d ago │
│                                                                              │
│                                  ■ you  ■ claude   /100p per 100 prompts     │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## What it counts

- **you**: a skill you invoked by typing `/name`.
- **claude**: a skill Claude invoked through the Skill tool, in the main conversation or a subagent.
- **preload**: a skill whose prompt was expanded without either, such as one preloaded into a subagent. Recorded in the file, left out of the table.
- **sessions**: each Claude Code session the mod ran in, once, however often it reloads.
- **prompts**: the messages you sent, at the terminal or through Remote Control.
- **turns**: the model turns, including the ones that continue without a new prompt.

`/100p` is a skill's invocations per 100 prompts.

## Storage

The counts are kept in `~/.claude/skill-usage.json`, shared by every session and project:

```json
{
  "since": "2026-10-08T04:50:54.943Z",
  "sessions": 12,
  "prompts": 340,
  "turns": 1204,
  "skills": {
    "commit": {
      "user": 12,
      "claude": 30,
      "preload": 0,
      "lastUsed": "2026-10-08T09:12:03.120Z"
    }
  }
}
```

Delete the file to start counting afresh.

## Tests

```sh
claude plugin validate skill-usage
claude plugin test skill-usage
```

Tested on Claude Code 2.1.293.
