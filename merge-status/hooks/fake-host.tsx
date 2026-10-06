import { mock } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { MergeRequestState, PipelineStatus } from '../types'
import type { Platform } from './browser'

export interface FakePipeline {
  id: number
  status: PipelineStatus
  sha: string
}

export interface FakeMergeRequest {
  iid: number
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
  glabFailure?: string
  platform?: Platform
}

export interface FakeHost {
  repo: FakeRepo
  clock: MockClock
  glabCalls: string[]
  openedWith: string[][]
  prompts: string[]
}

export const projectId = 9

export const mergeRequestUrl = (iid: number): string => `https://git.example/mr/${String(iid)}`
export const pipelineUrl = (id: number): string => `https://git.example/pipelines/${String(id)}`

const engineHint = 'engine hint'

const kernelNames: Record<Platform, string | null> = { macos: 'Darwin', linux: 'Linux', windows: null }
const openers = new Set(['open', 'xdg-open', 'rundll32'])

function toListItem(mr: FakeMergeRequest): object {
  return {
    iid: mr.iid,
    project_id: projectId,
    state: mr.state,
    draft: mr.isDraft ?? false,
    target_branch: mr.targetBranch,
    web_url: mergeRequestUrl(mr.iid),
  }
}

function toDetails(mr: FakeMergeRequest): object {
  const pipeline = mr.pipeline && { ...mr.pipeline, web_url: pipelineUrl(mr.pipeline.id) }
  return { sha: mr.sha, has_conflicts: mr.hasConflicts ?? false, head_pipeline: pipeline }
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
  if (argv[0] === 'glab') host.glabCalls.push(command)

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

  const listed = /^glab mr list --source-branch (\S+) /.exec(command)
  if (listed) return JSON.stringify((repo.mergeRequests[listed[1] ?? ''] ?? []).map(toListItem))

  const detailed = /^glab api projects\/\d+\/merge_requests\/(\d+)$/.exec(command)
  const mr = Object.values(repo.mergeRequests)
    .flat()
    .find(({ iid }) => String(iid) === detailed?.[1])
  return mr ? JSON.stringify(toDetails(mr)) : null
}

export function installFakeHost(on: On, repo: FakeRepo): FakeHost {
  const host: FakeHost = {
    repo,
    clock: mock.clock(on, { now: Date.parse('2026-10-06T09:00:00Z') }),
    glabCalls: [],
    openedWith: [],
    prompts: [],
  }
  mock.store(on)
  mock.env(on, repo.platform === 'windows' ? { OS: 'Windows_NT' } : {})

  on('process.run', (_$, e) => {
    const failure = e.argv[0] === 'glab' ? repo.glabFailure : undefined
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
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
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
