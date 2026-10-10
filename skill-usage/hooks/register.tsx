import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Source, Usage } from '../types'
import { initialAttribution, sourceOf, typedCommandOf } from './attribution'
import { bandLayout, columnWidths, thousands } from './band'
import { parseUsage, serializeUsage, withCount, withInvocation } from './usage'
import type { Counter } from './usage'

const commandName = 'skill-usage'
const usageFileName = '.claude/skill-usage.json'

const isSessionCounted = atom({ plugin: 'skill-usage', key: 'isSessionCounted' } as const, false)
const cachedUsage = atom({ plugin: 'skill-usage', key: 'usage' } as const, null)
const isOpen = atom({ plugin: 'skill-usage', key: 'isOpen' } as const, false)

const attribution = initialAttribution()

let pendingWrites: Promise<void> = Promise.resolve()

// Usage file

async function usagePath($: EngineInterface): Promise<string> {
  return `${await $.env.get('HOME')}/${usageFileName}`
}

async function readUsage($: EngineInterface, path: string, now: number): Promise<Usage> {
  const text = (await $.fs.exists(path)) ? await $.fs.read(path) : null
  return parseUsage(text, now)
}

function changeUsage($: EngineInterface, change: (usage: Usage, now: number) => Usage): Promise<void> {
  pendingWrites = pendingWrites
    .then(async () => {
      const path = await usagePath($)
      const now = await $.clock.now()
      const usage = change(await readUsage($, path, now), now)
      await $.fs.write(path, serializeUsage(usage))
      await update($, cachedUsage, () => usage)
    })
    .catch(() => undefined)
  return pendingWrites
}

function count($: EngineInterface, counter: Counter): Promise<void> {
  return changeUsage($, usage => withCount(usage, counter))
}

function countInvocation($: EngineInterface, skill: string, source: Source): Promise<void> {
  return changeUsage($, (usage, now) => withInvocation(usage, skill, source, now))
}

// Hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: commandName, description: 'Toggle skill usage stats above the prompt' })

    const isReload = await read($, isSessionCounted)
    await update($, isSessionCounted, () => true)
    void changeUsage($, usage => (isReload ? usage : withCount(usage, 'sessions')))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'composer' || e.origin.kind === 'bridge') {
      attribution.typedCommand = typedCommandOf(e.text)
      void count($, 'prompts')
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    void count($, 'turns')
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    if (e.command !== commandName) {
      attribution.typedCommand = e.command
      return next(e)
    }

    await pendingWrites
    const isShown = await update($, isOpen, open => !open)
    return { text: isShown ? 'Skill usage shown above the prompt.' : 'Skill usage hidden.' }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    attribution.pendingSkillCalls += 1
    attribution.isSkillCallCounted = false
    try {
      return await next(e)
    } finally {
      attribution.pendingSkillCalls -= 1
      if (!attribution.isSkillCallCounted) void countInvocation($, e.skill, 'claude')
    }
  }).catch(($, e, next) => next(e))

  on('skill.prompt', async ($, e, next) => {
    const source = sourceOf(attribution, e.skill)
    if (source === 'claude') attribution.isSkillCallCounted = true
    if (source === 'user') attribution.typedCommand = null
    void countInvocation($, e.skill, source)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const usage = await read($, cachedUsage)
    if (e.props.hasSurvey || usage === null || !(await read($, isOpen))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const { width, nameWidth, barWidth, rows, hiddenCount } = bandLayout(
      usage,
      e.props.bodyColumns,
      e.props.maxRows,
      await $.clock.now(),
    )

    const stat = (value: number, label: string): JSX.Element => (
      <Text>
        <Text bold>{thousands(value)}</Text>
        <Text dimColor> {label}</Text>
      </Text>
    )

    return (
      <Box flexDirection="column" width={width} borderStyle="round" borderColor="subtle" paddingX={1}>
        <Box gap={3}>
          <Text bold color="claude">
            Skill usage
          </Text>
          {stat(usage.sessions, 'sessions')}
          {stat(usage.prompts, 'prompts')}
          {stat(usage.turns, 'turns')}
          <Text dimColor>since {usage.since.slice(0, 10)}</Text>
        </Box>

        {rows.length === 0 ? (
          <Box marginTop={1}>
            <Text dimColor>No skill invocations yet. Type a /skill or let Claude use one.</Text>
          </Box>
        ) : (
          <Box gap={1} marginTop={1}>
            <Box width={columnWidths.rank} />
            <Box width={nameWidth}>
              <Text dimColor>skill</Text>
            </Box>
            <Box width={columnWidths.you} justifyContent="flex-end">
              <Text color="permission">you</Text>
            </Box>
            <Box width={columnWidths.claude} justifyContent="flex-end">
              <Text color="claude">claude</Text>
            </Box>
            <Box width={columnWidths.total} justifyContent="flex-end">
              <Text dimColor>total</Text>
            </Box>
            <Box width={barWidth} />
            <Box width={columnWidths.rate} justifyContent="flex-end">
              <Text dimColor>/100p</Text>
            </Box>
            <Box width={columnWidths.last} justifyContent="flex-end">
              <Text dimColor>last</Text>
            </Box>
          </Box>
        )}

        {rows.map(row => (
          <Box key={row.name} gap={1}>
            <Box width={columnWidths.rank} justifyContent="flex-end">
              <Text dimColor>{row.rank}.</Text>
            </Box>
            <Box width={nameWidth}>
              <Text wrap="truncate-end">{row.name}</Text>
            </Box>
            <Box width={columnWidths.you} justifyContent="flex-end">
              <Text color="permission" dimColor={row.user === 0}>
                {thousands(row.user)}
              </Text>
            </Box>
            <Box width={columnWidths.claude} justifyContent="flex-end">
              <Text color="claude" dimColor={row.claude === 0}>
                {thousands(row.claude)}
              </Text>
            </Box>
            <Box width={columnWidths.total} justifyContent="flex-end">
              <Text bold>{thousands(row.total)}</Text>
            </Box>
            <Box width={barWidth}>
              <Text wrap="truncate">
                <Text color="permission">{row.bar.you}</Text>
                <Text color="claude">{row.bar.claude}</Text>
                <Text color="subtle">{row.bar.track}</Text>
              </Text>
            </Box>
            <Box width={columnWidths.rate} justifyContent="flex-end">
              <Text dimColor>{row.rate}</Text>
            </Box>
            <Box width={columnWidths.last} justifyContent="flex-end">
              <Text dimColor>{row.lastUsed}</Text>
            </Box>
          </Box>
        ))}

        {rows.length > 0 && (
          <Box justifyContent="space-between" marginTop={1}>
            <Text dimColor>{hiddenCount > 0 ? `+${String(hiddenCount)} more` : ''}</Text>
            <Box gap={2}>
              <Text dimColor>
                <Text color="permission">■</Text> you
              </Text>
              <Text dimColor>
                <Text color="claude">■</Text> claude
              </Text>
              <Text dimColor>/100p per 100 prompts</Text>
            </Box>
          </Box>
        )}
      </Box>
    )
  })
}
