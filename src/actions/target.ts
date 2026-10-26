/** `target` group: open, close, and list this session's page. @module dsh-browser/actions/target */

import type { ActionDef } from './types.ts'

export const TARGET_ACTIONS: ActionDef[] = [
  {
    name: 'target.open',
    group: 'target',
    summary: 'Open a URL in this session\'s own page; returns title, readable text, and a full-page screenshot path.',
    notes: 'Each session gets its own page and context; sessions never see each other\'s page, cookies, or captured traffic. capture records console messages and failed/4xx/5xx requests in memory (no bodies or headers), capped, and resets on the next open.',
    params: {
      url: { type: 'string', required: true, description: 'The HTTP(S) URL to open.' },
      waitMs: { type: 'number', description: 'Extra settle time in ms after load.' },
      authProfile: { type: 'string', description: 'Named, domain-scoped auth profile from dsh-browser config.' },
      rulePack: { type: 'string', description: 'Named, domain-scoped enhancement rule pack.' },
      capture: { type: 'array', items: { type: 'string', enum: ['console', 'network'] }, description: 'In-memory capture channels for this navigation.' },
      session: { type: 'string', description: 'Named page bucket within this caller\'s own session. Default bucket when omitted. Bucket names are private to the caller, so this can never address another session\'s page.' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 60_000,
    examples: [{ args: { url: 'https://example.com/' } }, { args: { url: 'https://example.com/', capture: ['console', 'network'] }, note: 'enables inspect.console / inspect.requests' }, { args: { url: 'https://example.com/', session: 'scratch' }, note: 'keep a second independent page beside the default one' }],
    async execute(args, ctx) {
      // A caller-supplied name is scoped UNDER the caller's own session key: it selects a different bucket for
      // the same caller, and can never name another session's bucket (which would defeat session isolation).
      const session = typeof args.session === 'string' && args.session ? `${ctx.session}#${args.session}` : ctx.session
      return ctx.service.open(args.url, {
        ...args.waitMs !== undefined ? { waitMs: args.waitMs } : {},
        ...args.authProfile ? { authProfile: args.authProfile } : {},
        ...args.rulePack ? { rulePack: args.rulePack } : {},
        ...args.capture ? { capture: args.capture as ('console' | 'network')[] } : {},
        ...ctx.configDir ? { configDir: ctx.configDir } : {},
        session,
      })
    },
  },
  {
    name: 'target.close',
    group: 'target',
    summary: 'Close this session\'s pages and context (popups included); the next target.open starts fresh. Other sessions are untouched.',
    params: {},
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 15_000,
    examples: [{ args: {} }],
    async execute(_args, ctx) {
      await ctx.service.closePage(ctx.service.sessionState(ctx.agent as never))
      return { closed: true }
    },
  },
  {
    name: 'target.list',
    group: 'target',
    summary: 'List this session\'s open pages (the one it opened plus popups) with id, url, title, and which one is active.',
    notes: 'A popup (window.open, a link with target=_blank) joins the list but does not become active by itself; switch with target.select. Other sessions\' pages are never listed.',
    params: {},
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 15_000,
    examples: [{ args: {} }],
    async execute(_args, ctx) {
      const { targets } = await ctx.service.listTargets({ session: ctx.session })
      const status = targets.length ? await ctx.service.status({ session: ctx.session }) : undefined
      return { targets, ...status?.activeAuthProfile ? { authProfile: status.activeAuthProfile } : {} }
    },
  },
  {
    name: 'target.select',
    group: 'target',
    summary: 'Make one of this session\'s pages (id from target.list) the active page for act/observe/inspect actions.',
    notes: 'Switches only within this session. A page that was closed returns TARGET_CLOSED; call target.list again. Returns the selected page\'s url, title and text.',
    params: { id: { type: 'string', required: true, description: 'Target id from target.list, e.g. t2.' } },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: false, timeoutMs: 20_000,
    examples: [{ args: { id: 't2' } }],
    async execute(args, ctx) {
      return ctx.service.selectTarget(args.id, { session: ctx.session })
    },
  },
]
