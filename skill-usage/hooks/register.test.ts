import type { On, RenderElement } from "claude-code";
import { expect, mock, test } from "claude-code/testing";

import type { Usage } from "../types";

const FILE = "/home/test/.claude/skill-usage.json";

function typed(command: string) {
  return {
    command,
    args: "",
    origin: { kind: "composer" },
    presentation: { isFullscreen: false, columns: 120 },
  } as const;
}

function memoryFs(on: On) {
  const files = new Map<string, string>();
  on("fs.exists", ($, e) => ({ value: files.has(e.path) }));
  on("fs.read", ($, e) => ({ value: files.get(e.path) ?? "" }));
  on("fs.write", ($, e) => {
    files.set(e.path, e.text);
    return { value: undefined };
  });
  on("skill.prompt", ($, e) => ({ text: e.text }));
  on("turn.start", ($, e) => ({ turnId: e.turnId }));
  return () => JSON.parse(files.get(FILE) ?? "{}") as Usage;
}

test("counts Claude invocations through the Skill tool", async ($, on) => {
  mock.env(on, { HOME: "/home/test" });
  const usage = memoryFs(on);
  on("tool.call", { tool: "Skill" }, async (_, e) => {
    await $.skill.prompt({ skill: e.skill, text: "body" });
    return { result: { success: true, commandName: e.skill } };
  });

  await $.tool.call({ tool: "Skill", skill: "commit" });
  await $.command.run(typed("skill-usage"));

  expect(usage().skills["commit"]).toEqual(
    expect.objectContaining({ user: 0, claude: 1, preload: 0 }),
  );
});

test("counts a typed slash command as a user invocation", async ($, on) => {
  mock.env(on, { HOME: "/home/test" });
  const usage = memoryFs(on);
  on("command.run", { command: "commit" }, async () => {
    await $.skill.prompt({ skill: "commit", text: "body" });
    return { text: "" };
  });

  await $.command.run(typed("commit"));
  await $.command.run(typed("skill-usage"));

  expect(usage().skills["commit"]).toEqual(
    expect.objectContaining({ user: 1, claude: 0, preload: 0 }),
  );
});

test("counts a skill expanded without an invocation as a preload", async ($, on) => {
  mock.env(on, { HOME: "/home/test" });
  const usage = memoryFs(on);

  await $.skill.prompt({ skill: "brainstorming", text: "body" });
  await $.command.run(typed("skill-usage"));

  expect(usage().skills["brainstorming"]).toEqual(
    expect.objectContaining({ user: 0, claude: 0, preload: 1 }),
  );
});

test("shows the counts above the prompt once toggled on", async ($, on) => {
  mock.env(on, { HOME: "/home/test" });
  memoryFs(on);
  on("tool.call", { tool: "Skill" }, async (_, e) => {
    await $.skill.prompt({ skill: e.skill, text: "body" });
    return { result: { success: true, commandName: e.skill } };
  });

  on("ui.render", { component: "AbovePrompt" }, (engine, e) => {
    const { Box } = engine.ui.resolve(e);
    return h(Box, {}) as RenderElement;
  });

  await $.turn.start({ text: "hi", turnId: "t1" });
  await $.tool.call({ tool: "Skill", skill: "commit" });
  await $.command.run(typed("skill-usage"));

  for (const [surface, bodyColumns] of [
    ["terminal", 100],
    ["terminal", 50],
    ["desktop", 140],
  ] as const) {
    const ui = await $.ui.mount({
      plugin: "skill-usage",
      surface,
      component: "AbovePrompt",
      props: {
        hasSurvey: false,
        isWorking: false,
        maxRows: 20,
        bodyColumns,
        scroll: { offset: 0, bodyRows: 20 },
        view: {},
      },
    });
    expect(await ui.find({ type: "Text", text: /1 turns/ })).toBeDefined();
    expect(await ui.find({ type: "Text", text: /commit/ })).toBeDefined();
    await ui.press({ key: "close" });
    expect(await ui.find({ type: "Text", text: /commit/ })).toBeUndefined();
    await ui.unmount();
    await $.command.run(typed("skill-usage"));
  }
});
