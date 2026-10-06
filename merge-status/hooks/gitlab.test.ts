import { expect, test } from 'claude-code/testing'

import {
  describeGlabError,
  describeGlabFailure,
  notInstalledMessage,
  notLoggedInMessage,
  parseMergeRequests,
} from './gitlab'

test('maps the GitLab list payload onto merge requests', () => {
  const payload = JSON.stringify([
    {
      iid: 7,
      project_id: 1,
      state: 'opened',
      draft: true,
      target_branch: 'sprint-33',
      web_url: 'https://git.example/mr/7',
    },
    { iid: 8, project_id: 1, state: 'merged', target_branch: 'develop', web_url: 'https://git.example/mr/8' },
  ])

  expect(parseMergeRequests(payload)).toEqual([
    {
      iid: 7,
      projectId: 1,
      state: 'opened',
      isDraft: true,
      targetBranch: 'sprint-33',
      url: 'https://git.example/mr/7',
      pipeline: null,
      hasConflicts: false,
    },
    {
      iid: 8,
      projectId: 1,
      state: 'merged',
      isDraft: false,
      targetBranch: 'develop',
      url: 'https://git.example/mr/8',
      pipeline: null,
      hasConflicts: false,
    },
  ])
})

test('explains a missing or logged-out glab instead of echoing its banner', () => {
  const unknownHost = `   ERROR
          
  None of the git remotes configured for this repository point to a known GitLab host. Please use \`glab auth login\` to
  authenticate and configure a new host for glab.`

  expect(describeGlabFailure(unknownHost)).toBe(notLoggedInMessage)
  expect(describeGlabFailure('glab: 401 Unauthorized (HTTP 401)')).toBe(notLoggedInMessage)
  expect(describeGlabFailure('   ERROR\n\n  404 Project Not Found')).toBe('404 Project Not Found')
  expect(describeGlabError(new Error('failed to start: ENOENT: Executable not found in $PATH: "glab"'))).toBe(
    notInstalledMessage,
  )
})
