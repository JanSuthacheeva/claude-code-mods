import type { Board } from '../types'

/** `flow status --json` of four demo flows: blocked, waiting, reviewing with an agent, done. */
export const demoBoard: Board = {
  version: 1,
  now: 1791961662486,
  count: 4,
  needsYou: 2,
  flows: [
    {
      id: '3731f478-9d1f-421b-bb07-5d9357d3530a',
      name: 'shop-221',
      request: 'SHOP-221 add CSV export to the order list',
      mode: 'auto',
      phase: 'implement',
      state: 'blocked',
      blocker: 'Task 5: the migration needs a default value for exported_at',
      delegate: 'implement plan',
      tasks: {
        done: 4,
        total: 9,
      },
      review: null,
      mergeRequest: null,
      decisions: [
        'approach B: stream rows instead of building the file in memory',
      ],
      steps: [
        {
          phase: 'design',
          status: 'done',
          durationMs: 540000,
        },
        {
          phase: 'implement',
          status: 'current',
          durationMs: 7623935,
        },
        {
          phase: 'review',
          status: 'open',
          durationMs: null,
        },
        {
          phase: 'merge-request',
          status: 'open',
          durationMs: null,
        },
      ],
      timeline: [
        {
          at: 1791953498551,
          text: 'started',
          tone: 'neutral',
        },
        {
          at: 1791953498551,
          text: 'phase: design',
          tone: 'progress',
        },
        {
          at: 1791953858551,
          text: 'decided: approach B: stream rows instead of building the file in memory',
          tone: 'neutral',
        },
        {
          at: 1791954038551,
          text: 'phase: implement',
          tone: 'progress',
        },
        {
          at: 1791955898551,
          text: 'blocked: Task 5: the migration needs a default value for exported_at',
          tone: 'problem',
        },
      ],
      startedAt: 1791953498551,
      changedAt: 1791955898551,
    },
    {
      id: 'c6eb4f03-4056-4341-82e3-057ea47d7fe4',
      name: 'shop-230',
      request: 'SHOP-230 filter orders by sales channel',
      mode: 'guided',
      phase: 'design',
      state: 'waiting',
      blocker: 'Which approach: a channel column or a join table?',
      delegate: null,
      tasks: null,
      review: null,
      mergeRequest: null,
      decisions: [],
      steps: [
        {
          phase: 'design',
          status: 'current',
          durationMs: 6423935,
        },
        {
          phase: 'implement',
          status: 'open',
          durationMs: null,
        },
        {
          phase: 'review',
          status: 'open',
          durationMs: null,
        },
        {
          phase: 'merge-request',
          status: 'open',
          durationMs: null,
        },
      ],
      timeline: [
        {
          at: 1791955238551,
          text: 'started',
          tone: 'neutral',
        },
        {
          at: 1791955238551,
          text: 'phase: design',
          tone: 'progress',
        },
        {
          at: 1791955778551,
          text: 'waiting: Which approach: a channel column or a join table?',
          tone: 'attention',
        },
      ],
      startedAt: 1791955238551,
      changedAt: 1791955778551,
    },
    {
      id: 'f1ba4b74-ae39-4af6-bb5c-bed474680e45',
      name: 'export-csv',
      request: 'Refactor the export service',
      mode: 'auto',
      phase: 'review',
      state: 'delegated',
      blocker: null,
      delegate: 'review changes',
      tasks: {
        done: 6,
        total: 6,
      },
      review: {
        fixed: 3,
        open: 0,
      },
      mergeRequest: null,
      decisions: [],
      steps: [
        {
          phase: 'design',
          status: 'done',
          durationMs: 240000,
        },
        {
          phase: 'implement',
          status: 'done',
          durationMs: 1680000,
        },
        {
          phase: 'review',
          status: 'current',
          durationMs: 7983935,
        },
        {
          phase: 'merge-request',
          status: 'open',
          durationMs: null,
        },
      ],
      timeline: [
        {
          at: 1791951758551,
          text: 'started',
          tone: 'neutral',
        },
        {
          at: 1791951758551,
          text: 'phase: design',
          tone: 'progress',
        },
        {
          at: 1791951998551,
          text: 'phase: implement',
          tone: 'progress',
        },
        {
          at: 1791953678551,
          text: 'phase: review',
          tone: 'progress',
        },
        {
          at: 1791954158551,
          text: 'review: 3 fixed, 0 open',
          tone: 'progress',
        },
      ],
      startedAt: 1791951758551,
      changedAt: 1791953738551,
    },
    {
      id: 'd5a9e473-7ef8-48a3-86ba-d378cb3b803c',
      name: 'shop-198',
      request: 'SHOP-198 fix rounding on invoices',
      mode: 'auto',
      phase: 'merge-request',
      state: 'done',
      blocker: null,
      delegate: null,
      tasks: null,
      review: {
        fixed: 2,
        open: 0,
      },
      mergeRequest: 'https://gitlab.com/acme/shop/-/merge_requests/88',
      decisions: [
        'round per line, not per invoice',
      ],
      steps: [
        {
          phase: 'design',
          status: 'done',
          durationMs: 360000,
        },
        {
          phase: 'implement',
          status: 'done',
          durationMs: 1440000,
        },
        {
          phase: 'review',
          status: 'done',
          durationMs: 900000,
        },
        {
          phase: 'merge-request',
          status: 'done',
          durationMs: 0,
        },
      ],
      timeline: [
        {
          at: 1791945158551,
          text: 'started',
          tone: 'neutral',
        },
        {
          at: 1791945158551,
          text: 'phase: design',
          tone: 'progress',
        },
        {
          at: 1791945398551,
          text: 'decided: round per line, not per invoice',
          tone: 'neutral',
        },
        {
          at: 1791945518551,
          text: 'phase: implement',
          tone: 'progress',
        },
        {
          at: 1791946958551,
          text: 'phase: review',
          tone: 'progress',
        },
        {
          at: 1791947558551,
          text: 'review: 2 fixed, 0 open',
          tone: 'progress',
        },
        {
          at: 1791947858551,
          text: 'MR opened',
          tone: 'success',
        },
      ],
      startedAt: 1791945158551,
      changedAt: 1791947858551,
    },
  ],
}
