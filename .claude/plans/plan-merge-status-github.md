# merge-status: support GitHub (gh) next to GitLab (glab)

Design review page: `.lavish/merge-status-github-implementation.html`

## Decision

- Approach A: a `Forge` interface (`hooks/forge.ts`) shaped like the existing list + details flow. `gitlab.ts` and a new `github.ts` implement it with pure argv builders and parsers; `register.tsx` stays the only module that runs processes.
- Both forges return a forge-neutral domain, so tracking, scheduling, polling and push grace stay unchanged.
- GitHub costs 1 + N `gh` calls per refresh (list, then `gh pr view` per open PR), same shape as GitLab.
- Review decisions:
  - Forge detection: remote host is `github.com` or starts with `github.` -> GitHub; else GitLab; no `origin` -> row hidden.
  - Commands stay `/mr` and `/mrs` for both forges; descriptions mention pull requests.
  - Only the detected forge's CLI matters; its install/login hint is shown in the row.

## Data (`types/index.d.ts`)

```ts
export type ForgeName = 'gitlab' | 'github'
export type MergeRequestState = 'open' | 'merged' | 'closed'
export type PipelineStatus = 'running' | 'passed' | 'failed' | 'canceled' | 'idle'

export interface ResolvedPipeline {
  status: PipelineStatus
  id: string     // GitLab: pipeline id; GitHub: head commit sha
  url: string    // GitLab: pipeline page; GitHub: <pr url>/checks
}

export type Pipeline = ResolvedPipeline | { status: 'awaiting' }

export interface MergeRequest {
  number: number   // was iid
  project: string  // was projectId: number; GitLab "123", GitHub "owner/repo"
  state: MergeRequestState
  isDraft: boolean
  targetBranch: string
  url: string
  pipeline: Pipeline | null
  hasConflicts: boolean
}

export interface BranchStatus {
  repo: string | null
  branch: string | null
  forge: ForgeName | null
  mergeRequests: MergeRequest[] | null
  error: string | null
}
```

GitLab status mapping (`gitlab.pipelineStatus`):

| GitLab | neutral |
|---|---|
| created, waiting_for_resource, preparing, pending, running, scheduled | running |
| success | passed |
| failed | failed |
| canceled | canceled |
| manual, skipped | idle |

GitLab state: `opened` -> `open`, `merged` -> `merged`, `closed`/`locked` -> `closed`.

GitHub rollup (`github.rollupStatus`, first match wins):

| checks | neutral |
|---|---|
| none | `null` (no pipeline) |
| any CheckRun not COMPLETED, or StatusContext PENDING/EXPECTED | running |
| any FAILURE, TIMED_OUT, STARTUP_FAILURE, ACTION_REQUIRED, or context FAILURE/ERROR | failed |
| any CANCELLED | canceled |
| otherwise (SUCCESS, NEUTRAL, SKIPPED, STALE) | passed |

GitHub state: `OPEN`/`MERGED`/`CLOSED` -> `open`/`merged`/`closed`. `mergeable: CONFLICTING` -> `hasConflicts`; `UNKNOWN` -> false.

Private GitHub payload types in `github.ts`:

```ts
interface ApiPullRequest { number: number; state: 'OPEN' | 'CLOSED' | 'MERGED'; isDraft: boolean; baseRefName: string; url: string }
interface ApiCheckRun { __typename: 'CheckRun'; status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'WAITING' | 'PENDING' | 'REQUESTED'; conclusion: 'SUCCESS' | 'FAILURE' | 'CANCELLED' | 'SKIPPED' | 'NEUTRAL' | 'TIMED_OUT' | 'ACTION_REQUIRED' | 'STARTUP_FAILURE' | 'STALE' | '' | null }
interface ApiStatusContext { __typename: 'StatusContext'; state: 'EXPECTED' | 'PENDING' | 'SUCCESS' | 'FAILURE' | 'ERROR' }
type ApiCheck = ApiCheckRun | ApiStatusContext
interface ApiPullRequestDetails { headRefOid: string; mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'; statusCheckRollup: ApiCheck[]; url: string }
```

Store: investigation dedup key becomes `investigated:${forge.name}:${mr.project}:${pipeline.id}`. Old keys are orphaned, not migrated.

## Units

### `hooks/forge.ts` (new)

```ts
export interface HeadPipeline extends ResolvedPipeline { sha: string }

export interface MergeRequestDetails {
  sha: string
  hasConflicts: boolean
  headPipeline: HeadPipeline | null
}

export interface Forge {
  name: ForgeName
  cli: 'glab' | 'gh'
  noun: 'MR' | 'PR'
  sigil: '!' | '#'
  logo: string
  notInstalledMessage: string
  notLoggedInMessage: string
  listArgv(sourceBranch: string): string[]
  parseMergeRequests(json: string): MergeRequest[]
  detailsArgv(mr: MergeRequest): string[]
  parseDetails(json: string): MergeRequestDetails
  describeFailure(output: string): string
  investigationPrompt(mr: FailedMergeRequest, sourceBranch: string): string
}

export function detectForge(remoteUrl: string | null): Forge | null
export function forgeNamed(name: ForgeName): Forge
export function describeProcessError(forge: Forge, error: unknown): string  // ENOENT -> notInstalledMessage, timeout -> "<cli> did not answer in time"
```

### `hooks/gitlab.ts` (modified)

```ts
export const notInstalledMessage: string   // unchanged
export const notLoggedInMessage: string    // unchanged
export function listArgv(sourceBranch: string): string[]                  // unchanged
export function detailsArgv(mr: MergeRequest): string[]                    // projects/<project>/merge_requests/<number>
export function parseMergeRequests(json: string): MergeRequest[]
export function parseDetails(json: string): MergeRequestDetails            // neutral
export function pipelineStatus(status: ApiPipelineStatus): PipelineStatus
export function describeFailure(output: string): string                    // was describeGlabFailure
export function investigationPrompt(mr: FailedMergeRequest, sourceBranch: string): string  // moved from investigation.ts
export const gitlab: Forge  // 'gitlab', cli 'glab', noun 'MR', sigil '!', logo '\u{f0ba0} '
```

`describeGlabError` moves to `forge.describeProcessError`.

### `hooks/github.ts` (new)

```ts
export const notInstalledMessage = 'gh is not installed - see https://cli.github.com'
export const notLoggedInMessage = 'gh is not logged in to this GitHub host - run: gh auth login'
export function listArgv(sourceBranch: string): string[]
  // gh pr list --head <branch> --state all --json number,state,isDraft,baseRefName,url --limit 20
export function detailsArgv(mr: MergeRequest): string[]
  // gh pr view <number> --repo <project> --json headRefOid,mergeable,statusCheckRollup,url
export function parsePullRequests(json: string): MergeRequest[]  // project = owner/repo from url
export function parseDetails(json: string): MergeRequestDetails  // headPipeline: id = headRefOid, sha = headRefOid, url = <url>/checks; null without checks
export function rollupStatus(checks: readonly ApiCheck[]): PipelineStatus | null
export function describeFailure(output: string): string  // /gh auth login|HTTP 401|Bad credentials/i -> notLoggedInMessage, else first non-empty line
export function investigationPrompt(mr: FailedMergeRequest, sourceBranch: string): string
export const github: Forge  // 'github', cli 'gh', noun 'PR', sigil '#', logo '\u{f02a4} '
```

GitHub investigation prompt:

```
The GitHub checks of PR #<n> (<source> → <target>) on commit <short sha> just failed: <pr url>/checks
Investigate why: list the failed checks with `gh pr checks <n> --repo <project>` and read each failed run's log with `gh run view <run-id> --repo <project> --log-failed`.
Report the root cause and the files or tests involved.
Investigate only: do not change code, commit, push or re-run the checks.
```

### `hooks/git.ts` (modified)

```ts
export interface Location { repo: string; branch: string; forge: ForgeName }
export function remoteHost(remoteUrl: string): string | null  // ssh git@host:..., ssh://, https://; lower-cased
export function isTriggeringCommand(command: string): boolean  // regex adds \b(?:glab\s+mr|gh\s+pr)\s+(?:create|new)\b
```

`isGitlabRemote` is removed.

### `hooks/pipelines.ts` (modified)

- `isRunning`: `running | awaiting`; `hasFailed`: `failed | canceled`; `isFailed` (investigation trigger): `failed` only.
- `resolvePipeline(details: MergeRequestDetails, context: PipelineContext): Pipeline | null` reads `details.headPipeline` (type from `forge.ts`).
- `newlyFailed` keys by `number`.

### Other modified units

- `hooks/merge-requests.ts`: `openByPriority` filters `state === 'open'`, ties by `number`; `pickMergeRequest` strips a leading `!` or `#`, matches `number`.
- `hooks/schedule.ts`: `sameIids` -> `sameNumbers(a, b): boolean`.
- `hooks/status-line.ts`: drop exported `logo`; label = `forgeNamed(status.forge).logo`; entries `${forge.sigil}${number}`; `pipelineSign` checks `'passed'`.
- `hooks/register.tsx`:

```ts
const emptyStatus: BranchStatus = { repo: null, branch: null, forge: null, mergeRequests: null, error: null }
async function readLocation($: EngineInterface): Promise<Location | null>   // detectForge(remoteUrl)
async function listOpen($: EngineInterface, forge: Forge, sourceBranch: string): Promise<Listing>
async function withPipeline($: EngineInterface, forge: Forge, mr: MergeRequest, previous: MergeRequest | undefined): Promise<MergeRequest>
async function reportFailures($: EngineInterface, forge: Forge, sourceBranch: string, before: readonly MergeRequest[], after: readonly MergeRequest[]): Promise<void>
async function recheck($: EngineInterface, status: BranchStatus): Promise<void>        // forgeNamed(status.forge)
async function pollPipelines($: EngineInterface, status: BranchStatus): Promise<void>  // forgeNamed(status.forge)
```

  `/mr` replies use `forge.noun` and `forge.sigil` ("Opened #128.", "No open PR for this branch."; "MR" when `status.forge` is null).
- `hooks/investigation.ts` and `investigation.test.ts`: deleted (prompts live in each forge; test moves to `gitlab.test.ts`).
- `hooks/fake-host.tsx`, `fixtures.ts`: answer `gh pr list --head` and `gh pr view` from the same `FakeMergeRequest` records (shape picked by remote); `glabCalls` -> `forgeCalls`, `glabFailure` -> `forgeFailure`; fixtures use `number`/`project`.
- Docs: root `README.md`, `merge-status/README.md` (requirements for gh, GitHub row example, detection rule, gh commands, tested with gh 2.73), `plugin.json` description and version 0.2.0.

## Call chains

### Refresh (session start, git event, fingerprint change)

1. `register.load -> readFingerprint($): Fingerprint`
2. `register.readLocation -> git remote get-url origin; forge.detectForge(remoteUrl): Forge | null`
   - null -> `setBranchStatus(emptyStatus)`, row hidden
3. Branch changed -> `setBranchStatus({ ...location, mergeRequests: null, error: null })` ("loading...")
4. `register.listOpen($, forge, branch) -> run(forge.listArgv(branch)): ProcessRunResult`
   - exit != 0 -> `forge.describeFailure(stderr + stdout)` -> error row (e.g. gh login hint)
   - throws -> `forge.describeProcessError(forge, error)` -> install hint / timeout
5. `forge.parseMergeRequests(stdout) -> merge-requests.openByPriority(...)`
6. Per MR: `register.withPipeline($, forge, mr, previous) -> output(forge.detailsArgv(mr)): string | null`
   - null -> keep previous pipeline and conflicts
7. `forge.parseDetails(json): MergeRequestDetails` (GitHub: `rollupStatus`)
8. `pipelines.resolvePipeline(details, context): Pipeline | null`
9. `register.setBranchStatus($, { ...location, mergeRequests, error: null })`
10. `register.reportFailures($, forge, branch, previous, mergeRequests)`

### Poll + investigation (watch tick, 15 s)

1. `register.watch -> schedule.nextWatchAction(...): 'poll'`
2. `register.pollPipelines($, status) -> forgeNamed(status.forge)`
3. Per MR with `needsPolling`: `register.withPipeline($, forge, mr, mr)`
   - stale generation or no branch -> drop result
4. `register.setBranchStatus($, { ...status, mergeRequests: polled })`
5. `register.reportFailures -> pipelines.newlyFailed(before, after): FailedMergeRequest[]`
6. Per failed: `$.store.get('investigated:<forge>:<project>:<pipeline id>')`
   - true -> skip
7. `$.store.set(key, true); $.prompt.submit({ text: forge.investigationPrompt(mr, branch) })`

### `/mr #128`

1. `read($, branchStatus)`; empty -> "No open PR for this branch."
2. `pickMergeRequest(mrs, '#128')`; undefined -> `No PR "#128" here. Open: #126, #131`
3. `openInBrowser($, mr.url)` -> "Opened #128." / "Could not open #128: ..."

### Bash runs `gh pr create --fill`

1. `isTriggeringCommand(command): true -> refresh($)`

## Test seams

- `github.test.ts` (new): list mapping, every `rollupStatus` row, conflicts, failure wording, prompt text.
- `gitlab.test.ts`: neutral shape, status mapping, moved prompt test.
- `forge.test.ts` (new): `detectForge` for ssh/https/ssh:// remotes, github.com, `github.acme.com`, GitLab host, null.
- `git.test.ts`: `remoteHost`; trigger regex matches `gh pr create`/`gh pr new`, not `gh pr list`.
- `pipelines`, `schedule`, `status-line`, `merge-requests` tests: renamed fields, `#` parsing, GitHub row.
- E2E (`register.test.tsx`, `tracker.test.ts`): run row/command/tracker tests once per forge via the fake host; add gh not-logged-in and `gh pr create` refresh cases.
- Manual check against a real GitHub repo with `gh` before release.

## Assumptions

1. GitHub row: `#128 open → main` with the Nerd Font GitHub icon U+F02A4; GitLab row unchanged.
2. GitHub pipeline = rollup of all head-commit checks; a failure while other checks still run shows running; investigation fires once all finish.
3. GitHub pipeline id = head sha, so each pushed commit is investigated at most once.
4. Failure investigation is enabled for GitHub like GitLab.
5. `mergeable: UNKNOWN` counts as no conflict.
6. Renames: `iid` -> `number`, `projectId` -> `project: string`, `'opened'` -> `'open'`, GitLab `locked` -> `closed`.
7. Mod keeps the name `merge-status`; version 0.2.0.
8. Old `investigated:*` store keys are orphaned.
