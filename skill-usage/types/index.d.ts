export type Source = "user" | "claude" | "preload";

export type SkillStats = Record<Source, number> & { lastUsed: string };

export type Usage = {
  since: string;
  sessions: number;
  prompts: number;
  turns: number;
  skills: Record<string, SkillStats>;
};

declare module "claude-code" {
  interface PluginState {
    "skill-usage": {
      isSessionCounted: boolean;
      usage: Usage | null;
      isOpen: boolean;
    };
  }
}
