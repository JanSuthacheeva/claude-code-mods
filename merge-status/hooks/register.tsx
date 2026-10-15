import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register } from 'claude-code'

import type { BranchStatus, MergeRequest } from '../types'
import { detectPlatform, isWindows, openUrlArgv } from './browser'
import type { Platform } from './browser'
import { cacheDir, cacheEntry, cachePath, detailsMaxAgeMs, freshStdout, listMaxAgeMs } from './cache'
import { describeProcessError, detectForge, forgeNamed, passedLine, passedNote } from './forge'
import type { Forge } from './forge'
import { isTriggeringCommand, remoteBranchName, toFingerprint } from './git'
import type { Fingerprint, Location } from './git'
import { openByPriority, pickMergeRequest } from './merge-requests'
import { needsPolling, newlyFailed, newlyPassed, resolvePipeline } from './pipelines'
import {
  hasMovedUpstream,
  initialTracking,
  nextWatchAction,
  pushGracePeriodMs,
  sameNumbers,
  watchIntervalMs,
} from './schedule'
import { iconStyleFrom, statusSegments } from './status-line'

type Listing = { mergeRequests: MergeRequest[] } | { error: string }
type Answer = Pick<ProcessRunResult, 'exitCode' | 'stdout' | 'stderr'>

const commandTimeoutMs = 20_000
const visibilityStoreKey = 'isVisible'

const emptyStatus: BranchStatus = { repo: null, branch: null, forge: null, mergeRequests: null, error: null }

const branchStatus = atom({ plugin: 'merge-status', key: 'branchStatus' } as const, emptyStatus)
const isVisible = atom({ plugin: 'merge-status', key: 'isVisible' } as const, true)
const isSessionStarted = atom({ plugin: 'merge-status', key: 'isSessionStarted' } as const, false)

const tracking = initialTracking()
const settings = { notifyOnPass: false }

let platform: Platform | null = null
/** The origin remote of the branch in view, which keys the shared cache. */
let remoteUrl: string | null = null
/** Where answers are shared; undefined until looked up, null when there is nowhere. */
let sharedDir: string | null | undefined
/** The freshest age a queued refresh asked for. */
let queuedMaxAgeMs = listMaxAgeMs

// Host commands

async function run($: EngineInterface, argv: readonly string[]): Promise<ProcessRunResult> {
  return $.process.run(argv, { timeoutMs: commandTimeoutMs })
}

async function output($: EngineInterface, argv: readonly string[]): Promise<string | null> {
  const { exitCode, stdout } = await run($, argv)
  const text = stdout.trim()
  return exitCode === 0 && text !== '' ? text : null
}

// Forge answers, shared between sessions

async function cacheFolder($: EngineInterface): Promise<string | null> {
  if (sharedDir === undefined) {
    sharedDir = cacheDir({
      xdgCacheHome: (await $.env.get('XDG_CACHE_HOME')) ?? null,
      home: (await $.env.get('HOME')) ?? null,
      localAppData: (await $.env.get('LOCALAPPDATA')) ?? null,
    })
  }
  return sharedDir
}

/**
 * Asks the forge, or reuses what any session asked it less than `maxAgeMs` ago (0: always asks).
 * Only answers that worked are shared, so a failure is asked again.
 */
async function askForge($: EngineInterface, argv: readonly string[], maxAgeMs: number): Promise<Answer> {
  const dir = await cacheFolder($)
  const path = dir === null || remoteUrl === null ? null : cachePath(dir, remoteUrl, argv)
  if (path !== null && maxAgeMs > 0) {
    const text = await $.fs.read(path).catch(() => null)
    const stdout = typeof text === 'string' ? freshStdout(text, await $.clock.now(), maxAgeMs) : null
    if (stdout !== null) return { exitCode: 0, stdout, stderr: '' }
  }
  const answer = await run($, argv)
  if (path !== null && answer.exitCode === 0)
    await $.fs.write(path, cacheEntry(await $.clock.now(), answer.stdout)).catch(() => undefined)
  return answer
}

// Browser

async function hostPlatform($: EngineInterface): Promise<Platform> {
  if (platform !== null) return platform

  const osVariable = await $.env.get('OS')
  const kernelName = isWindows(osVariable) ? null : await output($, ['uname', '-s'])
  platform = detectPlatform(osVariable, kernelName)
  return platform
}

async function openInBrowser($: EngineInterface, url: string): Promise<string | null> {
  try {
    const { exitCode, stderr } = await run($, openUrlArgv(await hostPlatform($), url))
    return exitCode === 0 ? null : stderr.trim() || `exit code ${String(exitCode)}`
  } catch (error) {
    return String(error)
  }
}

// Git

async function readLocation($: EngineInterface): Promise<Location | null> {
  const repo = await output($, ['git', 'rev-parse', '--show-toplevel'])
  const localBranch = await output($, ['git', 'branch', '--show-current'])
  if (repo === null || localBranch === null) return null

  const origin = await output($, ['git', 'remote', 'get-url', 'origin'])
  const forge = detectForge(origin)
  if (forge === null) return null
  remoteUrl = origin

  const upstreamRef = await output($, ['git', 'rev-parse', '--abbrev-ref', '@{upstream}'])
  return { repo, branch: remoteBranchName(upstreamRef, localBranch), forge: forge.name }
}

async function readFingerprint($: EngineInterface): Promise<Fingerprint> {
  const head = await output($, ['git', 'rev-parse', '--show-toplevel', '--abbrev-ref', 'HEAD'])
  const upstreamSha = await output($, ['git', 'rev-parse', '@{upstream}'])
  return toFingerprint(head, upstreamSha)
}

// Forge

async function listOpen(
  $: EngineInterface,
  forge: Forge,
  sourceBranch: string,
  maxAgeMs: number,
): Promise<Listing> {
  try {
    const { exitCode, stdout, stderr } = await askForge($, forge.listArgv(sourceBranch), maxAgeMs)
    if (exitCode !== 0) return { error: forge.describeFailure(`${stderr}\n${stdout}`) }
    return { mergeRequests: openByPriority(forge.parseMergeRequests(stdout)) }
  } catch (error) {
    return { error: describeProcessError(forge, error) }
  }
}

async function withPipeline(
  $: EngineInterface,
  forge: Forge,
  mr: MergeRequest,
  previous: MergeRequest | undefined,
  maxAgeMs: number,
): Promise<MergeRequest> {
  const answer = await askForge($, forge.detailsArgv(mr), maxAgeMs).catch(() => null)
  const json = answer?.exitCode === 0 && answer.stdout.trim() !== '' ? answer.stdout.trim() : null
  if (json === null)
    return { ...mr, pipeline: previous?.pipeline ?? null, hasConflicts: previous?.hasConflicts ?? false }

  const details = forge.parseDetails(json)
  const context = {
    pushedSha: tracking.fingerprint?.upstreamSha ?? null,
    isWithinPushGrace: (await $.clock.now()) < tracking.pushGraceUntil,
    hadPipeline: (previous?.pipeline ?? null) !== null,
  }
  return { ...mr, pipeline: resolvePipeline(details, context), hasConflicts: details.hasConflicts }
}

async function reportFinished(
  $: EngineInterface,
  forge: Forge,
  sourceBranch: string,
  before: readonly MergeRequest[],
  after: readonly MergeRequest[],
): Promise<void> {
  for (const mr of newlyFailed(before, after)) {
    const storeKey = `investigated:${forge.name}:${mr.project}:${mr.pipeline.id}`
    if ((await $.store.get(storeKey)) === true) continue

    await $.store.set(storeKey, true)
    void $.prompt.submit({ text: forge.investigationPrompt(mr, sourceBranch) })
  }

  if (!settings.notifyOnPass) return
  for (const mr of newlyPassed(before, after)) {
    const text = passedNote(forge, mr, sourceBranch)
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
    $.ui.log(passedLine(forge, mr))
  }
}

// Tracking

async function setBranchStatus($: EngineInterface, next: BranchStatus): Promise<void> {
  const current = await read($, branchStatus)
  if (JSON.stringify(current) !== JSON.stringify(next)) await update($, branchStatus, () => next)
}

function isStale(generation: number): boolean {
  return generation !== tracking.generation || tracking.isRefreshing
}

/** `maxAgeMs` 0 asks the forge afresh, as after a push or a new MR; else a shared answer may do. */
async function load($: EngineInterface, maxAgeMs: number): Promise<void> {
  const fingerprint = await readFingerprint($)
  const now = await $.clock.now()
  if (hasMovedUpstream(tracking.fingerprint, fingerprint)) tracking.pushGraceUntil = now + pushGracePeriodMs
  tracking.fingerprint = fingerprint
  tracking.listedAt = now
  tracking.pipelinesPolledAt = now

  const location = await readLocation($)
  if (location === null) {
    await setBranchStatus($, emptyStatus)
    return
  }

  const forge = forgeNamed(location.forge)
  const current = await read($, branchStatus)
  const isSameBranch =
    current.repo === location.repo && current.branch === location.branch && current.forge === location.forge
  if (!isSameBranch) await setBranchStatus($, { ...location, mergeRequests: null, error: null })

  const listing = await listOpen($, forge, location.branch, maxAgeMs)
  if ('error' in listing) {
    await setBranchStatus($, { ...location, mergeRequests: null, error: listing.error })
    return
  }

  const previous = isSameBranch ? (current.mergeRequests ?? []) : []
  const previousByNumber = new Map(previous.map(mr => [mr.number, mr]))
  const mergeRequests = await Promise.all(
    listing.mergeRequests.map(mr =>
      withPipeline($, forge, mr, previousByNumber.get(mr.number), Math.min(maxAgeMs, detailsMaxAgeMs)),
    ),
  )
  await setBranchStatus($, { ...location, mergeRequests, error: null })
  await reportFinished($, forge, location.branch, previous, mergeRequests)
}

async function refresh($: EngineInterface, maxAgeMs: number): Promise<void> {
  if (tracking.isRefreshing) {
    tracking.isRefreshQueued = true
    queuedMaxAgeMs = Math.min(queuedMaxAgeMs, maxAgeMs)
    return
  }

  tracking.isRefreshing = true
  tracking.generation += 1
  try {
    await load($, maxAgeMs)
  } catch (error) {
    await setBranchStatus($, { ...(await read($, branchStatus)), error: String(error) })
  } finally {
    tracking.isRefreshing = false
  }

  if (tracking.isRefreshQueued) {
    tracking.isRefreshQueued = false
    const queued = queuedMaxAgeMs
    queuedMaxAgeMs = listMaxAgeMs
    await refresh($, queued)
  }
}

async function recheck($: EngineInterface, status: BranchStatus): Promise<void> {
  const generation = tracking.generation
  tracking.listedAt = await $.clock.now()
  if (status.branch === null || status.forge === null) return

  const listing = await listOpen($, forgeNamed(status.forge), status.branch, listMaxAgeMs)
  if ('error' in listing || isStale(generation)) return
  if (!sameNumbers(listing.mergeRequests, status.mergeRequests ?? [])) await refresh($, listMaxAgeMs)
}

async function pollPipelines($: EngineInterface, status: BranchStatus): Promise<void> {
  const generation = tracking.generation
  tracking.pipelinesPolledAt = await $.clock.now()
  if (status.branch === null || status.forge === null) return

  const forge = forgeNamed(status.forge)
  const previous = status.mergeRequests ?? []
  const polled = await Promise.all(previous.map(async mr => (needsPolling(mr) ? withPipeline($, forge, mr, mr, detailsMaxAgeMs) : mr)))
  if (isStale(generation)) return

  await setBranchStatus($, { ...status, mergeRequests: polled })
  await reportFinished($, forge, status.branch, previous, polled)
}

async function startSession($: EngineInterface): Promise<void> {
  await update($, isSessionStarted, () => true)
  const visible = (await $.store.get(visibilityStoreKey)) !== false
  await update($, isVisible, () => visible)
  if (visible) await refresh($, listMaxAgeMs)
}

async function watch($: EngineInterface): Promise<void> {
  if (!(await read($, isSessionStarted))) {
    await startSession($)
    return
  }
  if (tracking.isRefreshing || !(await read($, isVisible))) return

  const fingerprint = await readFingerprint($)
  const status = await read($, branchStatus)
  const action = nextWatchAction(tracking, fingerprint, status.mergeRequests ?? [], await $.clock.now())
  // The branch or its upstream moved here: what other sessions saw may be out of date.
  if (action === 'refresh') await refresh($, 0)
  if (action === 'recheck') await recheck($, status)
  if (action === 'poll') await pollPipelines($, status)
}

async function setVisible($: EngineInterface, visible: boolean): Promise<void> {
  await update($, isVisible, () => visible)
  await $.store.set(visibilityStoreKey, visible)
  if (visible) await refresh($, listMaxAgeMs)
}

// Hooks

export const register: Register = (on, options) => {
  const iconStyle = iconStyleFrom(options['icons'])
  settings.notifyOnPass = options['notifyOnPass'] === true

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'mrs',
      description:
        'Toggle the merge requests (GitLab) or pull requests (GitHub) of the current branch under the prompt',
    })
    await $.command.register({
      name: 'mr',
      description:
        'Open an MR or PR of the current branch in the browser: /mr (first), /mr 2 (second), /mr 3609 (by number)',
    })

    void startSession($)
    $.clock.every(watchIntervalMs, () => void watch($))
    return result
  })

  on('session.end', async ($, e, next) => {
    const result = await next(e)
    if (e.reason === 'clear') void startSession($)
    return result
  })

  on('command.run', { command: 'mrs' }, async $ => {
    const visible = !(await read($, isVisible))
    await setVisible($, visible)
    return { text: visible ? 'MRs shown.' : 'MRs hidden.' }
  })

  on('command.run', { command: 'mr' }, async ($, e) => {
    const status = await read($, branchStatus)
    const forge = status.forge === null ? null : forgeNamed(status.forge)
    const noun = forge?.noun ?? 'MR'
    const mergeRequests = status.mergeRequests ?? []
    if (forge === null || mergeRequests.length === 0) return { text: `No open ${noun} for this branch.` }

    const labelOf = (mr: MergeRequest): string => `${forge.sigil}${String(mr.number)}`
    const mr = pickMergeRequest(mergeRequests, e.args)
    if (mr === undefined) {
      const available = mergeRequests.map(labelOf).join(', ')
      return { text: `No ${noun} "${e.args.trim()}" here. Open: ${available}` }
    }

    const failure = await openInBrowser($, mr.url)
    const label = labelOf(mr)
    return { text: failure === null ? `Opened ${label}.` : `Could not open ${label}: ${failure}` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    if (isTriggeringCommand(e.command) && (await read($, isVisible))) void refresh($, 0)
    return result
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const engineHint = await next(e)
    const segments = (await read($, isVisible)) ? statusSegments(await read($, branchStatus), iconStyle) : null
    if (segments === null) return engineHint

    const { Box, Link, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {engineHint}
        <Text wrap="truncate-end">
          {segments.map((segment, index) => {
            const text = (
              <Text key={`text-${String(index)}`} color={segment.color}>
                {segment.text}
              </Text>
            )
            return segment.href === undefined ? (
              text
            ) : (
              <Link key={`link-${String(index)}`} href={segment.href}>
                {text}
              </Link>
            )
          })}
        </Text>
      </Box>
    )
  })
}
