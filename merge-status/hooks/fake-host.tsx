import { mock } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, StateRead } from 'claude-code'

import type { ForgeName, MergeRequestState } from '../types'
import type { Platform } from './browser'

export type FakePipelineStatus = 'running' | 'success' | 'failed' | 'canceled'

export interface FakePipeline {
  id: number
  status: FakePipelineStatus
  sha: string
}

export interface FakeMergeRequest {
  number: number
  state: MergeRequestState
  targetBranch: string
  sha: string
  pipeline: FakePipeline | null
  isDraft?: boolean
  hasConflicts?: boolean
}

export interface FakeRepo {
  branch: string
  remoteUrl: string
  upstreamShas: Record<string, string>
  mergeRequests: Record<string, FakeMergeRequest[]>
  forgeFailure?: string
  platform?: Platform
}

export interface FakeHost {
  repo: FakeRepo
  clock: MockClock
  forgeCalls: string[]
  openedWith: string[][]
  prompts: string[]
  sessionState: Map<string, StateRead>
}

export const projectId = 9

export const projects: Record<ForgeName, string> = {
  gitlab: String(projectId),
  github: 'github.com/team/repo',
}

export const remoteUrls: Record<ForgeName, string> = {
  gitlab: 'git@gitlab.example.com:team/repo.git',
  github: 'git@github.com:team/repo.git',
}

export function mergeRequestUrl(forge: ForgeName, number: number): string {
  return forge === 'gitlab'
    ? `https://gitlab.example.com/team/repo/-/merge_requests/${String(number)}`
    : `https://github.com/team/repo/pull/${String(number)}`
}

export function pipelineUrl(forge: ForgeName, mr: Pick<FakeMergeRequest, 'number' | 'pipeline'>): string {
  return forge === 'gitlab'
    ? `https://gitlab.example.com/team/repo/-/pipelines/${String(mr.pipeline?.id)}`
    : `${mergeRequestUrl(forge, mr.number)}/checks`
}

const engineHint = 'engine hint'

const kernelNames: Record<Platform, string | null> = { macos: 'Darwin', linux: 'Linux', windows: null }
const openers = new Set(['open', 'xdg-open', 'rundll32'])
const forgeClis = new Set(['glab', 'gh'])

const gitlabStates: Record<MergeRequestState, string> = { open: 'opened', merged: 'merged', closed: 'closed' }
const githubStates: Record<MergeRequestState, string> = { open: 'OPEN', merged: 'MERGED', closed: 'CLOSED' }

const checkRuns: Record<FakePipelineStatus, object> = {
  running: { status: 'IN_PROGRESS', conclusion: null },
  success: { status: 'COMPLETED', conclusion: 'SUCCESS' },
  failed: { status: 'COMPLETED', conclusion: 'FAILURE' },
  canceled: { status: 'COMPLETED', conclusion: 'CANCELLED' },
}

function gitlabListItem(mr: FakeMergeRequest): object {
  return {
    iid: mr.number,
    project_id: projectId,
    state: gitlabStates[mr.state],
    draft: mr.isDraft ?? false,
    target_branch: mr.targetBranch,
    web_url: mergeRequestUrl('gitlab', mr.number),
  }
}

function gitlabDetails(mr: FakeMergeRequest): object {
  const pipeline = mr.pipeline && { ...mr.pipeline, web_url: pipelineUrl('gitlab', mr) }
  return { sha: mr.sha, has_conflicts: mr.hasConflicts ?? false, head_pipeline: pipeline }
}

function githubListItem(mr: FakeMergeRequest): object {
  return {
    number: mr.number,
    state: githubStates[mr.state],
    isDraft: mr.isDraft ?? false,
    baseRefName: mr.targetBranch,
    url: mergeRequestUrl('github', mr.number),
  }
}

function githubDetails(mr: FakeMergeRequest): object {
  const isHeadPipeline = mr.pipeline !== null && mr.pipeline.sha === mr.sha
  const checks = isHeadPipeline && mr.pipeline ? [{ __typename: 'CheckRun', ...checkRuns[mr.pipeline.status] }] : []
  return {
    headRefOid: mr.sha,
    mergeable: mr.hasConflicts === true ? 'CONFLICTING' : 'MERGEABLE',
    statusCheckRollup: checks,
    url: mergeRequestUrl('github', mr.number),
  }
}

function findMergeRequest(repo: FakeRepo, number: string | undefined): FakeMergeRequest | undefined {
  return Object.values(repo.mergeRequests)
    .flat()
    .find(mr => String(mr.number) === number)
}

function respond(host: FakeHost, argv: readonly string[]): string | null {
  const { repo } = host
  const command = argv.join(' ')
  const upstreamSha = repo.upstreamShas[repo.branch] ?? null

  if (argv[0] === 'uname') return kernelNames[repo.platform ?? 'macos']
  if (openers.has(argv[0] ?? '')) {
    host.openedWith.push([...argv])
    return ''
  }
  if (forgeClis.has(argv[0] ?? '')) host.forgeCalls.push(command)

  switch (command) {
    case 'git rev-parse --show-toplevel':
      return '/repo'
    case 'git branch --show-current':
      return repo.branch
    case 'git remote get-url origin':
      return repo.remoteUrl
    case 'git rev-parse --abbrev-ref @{upstream}':
      return upstreamSha === null ? null : `origin/${repo.branch}`
    case 'git rev-parse @{upstream}':
      return upstreamSha
    case 'git rev-parse --show-toplevel --abbrev-ref HEAD':
      return `/repo\n${repo.branch}`
  }

  const listedOnGitlab = /^glab mr list --source-branch (\S+) /.exec(command)
  if (listedOnGitlab) return JSON.stringify((repo.mergeRequests[listedOnGitlab[1] ?? ''] ?? []).map(gitlabListItem))

  const listedOnGithub = /^gh pr list --head (\S+) /.exec(command)
  if (listedOnGithub) return JSON.stringify((repo.mergeRequests[listedOnGithub[1] ?? ''] ?? []).map(githubListItem))

  const gitlabMr = findMergeRequest(repo, /^glab api projects\/\d+\/merge_requests\/(\d+)$/.exec(command)?.[1])
  if (gitlabMr) return JSON.stringify(gitlabDetails(gitlabMr))

  const githubMr = findMergeRequest(repo, /^gh pr view (\d+) --repo github\.com\/team\/repo /.exec(command)?.[1])
  return githubMr ? JSON.stringify(githubDetails(githubMr)) : null
}

export function installFakeHost(on: On, repo: FakeRepo): FakeHost {
  const host: FakeHost = {
    repo,
    clock: mock.clock(on, { now: Date.parse('2026-10-06T09:00:00Z') }),
    forgeCalls: [],
    openedWith: [],
    prompts: [],
    sessionState: new Map(),
  }
  mock.store(on)
  mock.env(on, repo.platform === 'windows' ? { OS: 'Windows_NT' } : {})

  on('process.run', (_$, e) => {
    const failure = forgeClis.has(e.argv[0] ?? '') ? repo.forgeFailure : undefined
    const stdout = failure === undefined ? respond(host, e.argv) : null
    return {
      value: {
        exitCode: stdout === null ? 1 : 0,
        stdout: stdout ?? '',
        stderr: failure ?? '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  on('prompt.submit', (_$, e) => {
    host.prompts.push(e.text)
    return { text: e.text }
  })
  on('state.get', (_$, e) => ({ value: host.sessionState.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_$, e) => {
    const version = (host.sessionState.get(e.key)?.version ?? 0) + 1
    host.sessionState.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{engineHint}</Text>
  })

  return host
}

export async function startSession($: Engine, host: FakeHost): Promise<void> {
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await host.clock.advance(1)
}

export async function clearSession($: Engine, host: FakeHost): Promise<void> {
  await $.session.end({ reason: 'clear', sessionId: 'first', resume: { id: 'first' } })
  host.sessionState.clear()
  await host.clock.advance(1)
}

function visibleText(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(visibleText).join('')
  if (typeof node === 'object' && node !== null && 'children' in node) return visibleText(node.children)
  return ''
}

export async function statusLine($: Engine): Promise<string | null> {
  const props = { isDraft: false, isWorking: false, hint: '' }
  const drawing = await $.ui.mount({ plugin: 'merge-status', surface: 'terminal', component: 'PromptHint', props })
  const text = visibleText(await drawing.drawn())
  await drawing.unmount()

  const line = text.replace(engineHint, '')
  return line === '' ? null : line
}
