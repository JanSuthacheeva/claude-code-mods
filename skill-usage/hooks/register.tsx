import { atom, read, update } from "claude-code";
import type { EngineInterface as Engine, Register } from "claude-code";

import type { Source, Usage } from "../types";

const isSessionCounted = atom(
  { plugin: "skill-usage", key: "isSessionCounted" } as const,
  false,
);
const cached = atom({ plugin: "skill-usage", key: "usage" } as const, null);
const isOpen = atom({ plugin: "skill-usage", key: "isOpen" } as const, false);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const EIGHTHS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

let queue: Promise<unknown> = Promise.resolve();
let skillCalls = 0;
let isSkillCallCounted = false;
let lastSlash: string | undefined;

function empty(): Usage {
  return {
    since: new Date().toISOString(),
    sessions: 0,
    prompts: 0,
    turns: 0,
    skills: {},
  };
}

function baseName(skill: string) {
  return skill.replace(/^\//, "").split(":").pop() ?? skill;
}

async function usageFile($: Engine) {
  return `${await $.env.get("HOME")}/.claude/skill-usage.json`;
}

async function load($: Engine): Promise<Usage> {
  const file = await usageFile($);
  if (!(await $.fs.exists(file))) return empty();
  try {
    return { ...empty(), ...(JSON.parse(await $.fs.read(file)) as Usage) };
  } catch {
    return empty();
  }
}

function mutate($: Engine, change: (usage: Usage) => void) {
  queue = queue
    .then(async () => {
      const usage = await load($);
      change(usage);
      await $.fs.write(
        await usageFile($),
        `${JSON.stringify(usage, null, 2)}\n`,
      );
      await update($, cached, () => usage);
    })
    .catch(() => undefined);
  return queue;
}

function count($: Engine, skill: string, source: Source) {
  return mutate($, (usage) => {
    const stats = (usage.skills[skill] ??= {
      user: 0,
      claude: 0,
      preload: 0,
      lastUsed: "",
    });
    stats[source] += 1;
    stats.lastUsed = new Date().toISOString();
  });
}

function ago(iso: string) {
  const elapsed = Date.now() - Date.parse(iso);
  if (Number.isNaN(elapsed)) return "-";
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return iso.slice(0, 10);
}

function thousands(n: number) {
  return n.toLocaleString("en-US");
}

function stack(user: number, claude: number, max: number, width: number) {
  const scale = max > 0 ? width / max : 0;
  const you = Math.round(user * scale);
  const rest = Math.max(0, (user + claude) * scale - you);
  const full = Math.floor(rest);
  const tail =
    claude > 0
      ? (EIGHTHS[Math.max(full === 0 ? 1 : 0, Math.round((rest - full) * 8))] ??
        "")
      : "";
  const them = "█".repeat(full) + tail;
  return {
    you: "█".repeat(you),
    claude: them,
    track: "─".repeat(Math.max(0, width - you - them.length)),
  };
}

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({
      name: "skill-usage",
      description: "Toggle skill usage stats above the prompt",
    });
    const isFirstLoad = !(await read($, isSessionCounted));
    await update($, isSessionCounted, () => true);
    void mutate($, (usage) => {
      if (isFirstLoad) usage.sessions += 1;
    });
    return next(e);
  });

  on("prompt.submit", async ($, e, next) => {
    if (e.origin.kind === "composer" || e.origin.kind === "bridge") {
      lastSlash = /^\/(\S+)/.exec(e.text.trim())?.[1];
      void mutate($, (usage) => {
        usage.prompts += 1;
      });
    }
    return next(e);
  }).catch(($, e, next) => next(e));

  on("turn.start", async ($, e, next) => {
    void mutate($, (usage) => {
      usage.turns += 1;
    });
    return next(e);
  });

  on("command.run", async ($, e, next) => {
    if (e.command === "skill-usage") {
      await queue;
      const shown = await update($, isOpen, (open) => !open);
      return {
        text: shown
          ? "Skill usage shown above the prompt."
          : "Skill usage hidden.",
      };
    }
    lastSlash = e.command;
    return next(e);
  }).catch(($, e, next) => next(e));

  on("tool.call", { tool: "Skill" }, async ($, e, next) => {
    skillCalls += 1;
    isSkillCallCounted = false;
    try {
      return await next(e);
    } finally {
      skillCalls -= 1;
      if (!isSkillCallCounted) void count($, e.skill, "claude");
    }
  }).catch(($, e, next) => next(e));

  on("skill.prompt", async ($, e, next) => {
    if (skillCalls > 0) {
      isSkillCallCounted = true;
      void count($, e.skill, "claude");
    } else if (lastSlash && baseName(lastSlash) === baseName(e.skill)) {
      lastSlash = undefined;
      void count($, e.skill, "user");
    } else {
      void count($, e.skill, "preload");
    }
    return next(e);
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const usage = await read($, cached);
    if (e.props.hasSurvey || !usage || !(await read($, isOpen))) return next(e);

    const { Box, Button, Text } = $.ui.resolve(e);
    const rows = Object.entries(usage.skills)
      .map(([name, stats]) => ({
        name,
        ...stats,
        total: stats.user + stats.claude,
      }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const inner = e.props.bodyColumns - 4;
    const room = Math.max(1, e.props.maxRows - 7);
    const shown = rows.slice(0, room);
    const hidden = rows.length - shown.length;

    const widths = { rank: 3, you: 5, claude: 6, total: 6, rate: 6, last: 9 };
    const nameWidth = Math.min(
      26,
      Math.max(5, ...shown.map((row) => row.name.length)),
    );
    const fixed =
      Object.values(widths).reduce((sum, w) => sum + w, 0) + nameWidth + 7;
    const barWidth = Math.max(6, Math.min(32, inner - fixed));
    const max = Math.max(1, ...shown.map((row) => row.total));
    const rate = (n: number) =>
      usage.prompts ? ((n / usage.prompts) * 100).toFixed(1) : "-";

    const stat = (value: number, label: string) => (
      <Text>
        <Text bold>{thousands(value)}</Text>
        <Text dimColor> {label}</Text>
      </Text>
    );

    return (
      <Box
        flexDirection="column"
        width={e.props.bodyColumns}
        borderStyle="round"
        borderColor="subtle"
        paddingX={1}
      >
        <Box justifyContent="space-between">
          <Box gap={3}>
            <Text bold color="claude">
              Skill usage
            </Text>
            {stat(usage.sessions, "sessions")}
            {stat(usage.prompts, "prompts")}
            {stat(usage.turns, "turns")}
            <Text dimColor>since {usage.since.slice(0, 10)}</Text>
          </Box>
          <Button
            key="close"
            label="Close"
            onPress={() => update($, isOpen, () => false)}
          />
        </Box>

        <Box gap={1} marginTop={1}>
          <Box width={widths.rank} />
          <Box width={nameWidth}>
            <Text dimColor>skill</Text>
          </Box>
          <Box width={widths.you} justifyContent="flex-end">
            <Text color="suggestion">you</Text>
          </Box>
          <Box width={widths.claude} justifyContent="flex-end">
            <Text color="claude">claude</Text>
          </Box>
          <Box width={widths.total} justifyContent="flex-end">
            <Text dimColor>total</Text>
          </Box>
          <Box width={barWidth} />
          <Box width={widths.rate} justifyContent="flex-end">
            <Text dimColor>/100p</Text>
          </Box>
          <Box width={widths.last} justifyContent="flex-end">
            <Text dimColor>last</Text>
          </Box>
        </Box>

        {shown.length === 0 && (
          <Text dimColor>
            No skill invocations yet. Type a /skill or let Claude use one.
          </Text>
        )}

        {shown.map((row, index) => {
          const bar = stack(row.user, row.claude, max, barWidth);
          return (
            <Box key={row.name} gap={1}>
              <Box width={widths.rank} justifyContent="flex-end">
                <Text dimColor>{index + 1}.</Text>
              </Box>
              <Box width={nameWidth}>
                <Text wrap="truncate-end">{row.name}</Text>
              </Box>
              <Box width={widths.you} justifyContent="flex-end">
                <Text color="suggestion" dimColor={row.user === 0}>
                  {thousands(row.user)}
                </Text>
              </Box>
              <Box width={widths.claude} justifyContent="flex-end">
                <Text color="claude" dimColor={row.claude === 0}>
                  {thousands(row.claude)}
                </Text>
              </Box>
              <Box width={widths.total} justifyContent="flex-end">
                <Text bold>{thousands(row.total)}</Text>
              </Box>
              <Box width={barWidth}>
                <Text wrap="truncate">
                  <Text color="suggestion">{bar.you}</Text>
                  <Text color="claude">{bar.claude}</Text>
                  <Text color="subtle">{bar.track}</Text>
                </Text>
              </Box>
              <Box width={widths.rate} justifyContent="flex-end">
                <Text dimColor>{rate(row.total)}</Text>
              </Box>
              <Box width={widths.last} justifyContent="flex-end">
                <Text dimColor>{ago(row.lastUsed)}</Text>
              </Box>
            </Box>
          );
        })}

        <Box justifyContent="space-between" marginTop={1}>
          <Text dimColor>{hidden > 0 ? `+${hidden} more` : ""}</Text>
          <Text dimColor>
            <Text color="suggestion">■</Text> you <Text color="claude">■</Text>{" "}
            claude /100p per 100 prompts
          </Text>
        </Box>
      </Box>
    );
  });
};
