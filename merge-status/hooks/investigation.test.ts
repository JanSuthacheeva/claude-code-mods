import { expect, test } from 'claude-code/testing'

import { mergeRequest } from './fixtures'
import { investigationPrompt } from './investigation'
import type { FailedMergeRequest } from './pipelines'

test('asks to investigate only, with the commands to get there', () => {
  const failed: FailedMergeRequest = {
    ...mergeRequest({ iid: 8 }),
    pipeline: { status: 'failed', id: 77, url: 'https://git.example/p/77' },
  }
  const prompt = investigationPrompt(failed, 'feature/x')

  expect(prompt).toContain('https://git.example/p/77 of MR !8 (feature/x → develop) just failed')
  expect(prompt).toContain("glab api 'projects/1/pipelines/77/jobs?scope=failed'")
  expect(prompt).toContain('glab api projects/1/jobs/<job-id>/trace')
  expect(prompt).toContain('do not change code, commit, push or retry')
})
