/** `auth` group: list and inspect dynamically loaded auth profiles from the configured directory. @module dsh-browser/actions/auth */

import type { ActionDef } from './types.ts'

export const AUTH_ACTIONS: ActionDef[] = [
  {
    name: 'auth.list',
    group: 'auth',
    summary: 'List every auth profile discovered by scanning the auth-profiles directory (one *.json file each).',
    notes: 'Read-only. Returns id, allowedDomains, and persistState for each profile; the storageState file is not read.',
    params: {},
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
    examples: [{ args: {} }],
    async execute(_args, ctx) {
      return { profiles: ctx.service.listAuthProfiles(ctx.configDir) }
    },
  },
  {
    name: 'auth.inspect',
    group: 'auth',
    summary: 'Inspect one auth profile by id; with targetUrl, also checks domain allowance and storageState file validity.',
    notes: 'Read-only. `usable` is false when targetUrl is given and the profile is not allowed for, or its storageState file is missing/invalid for, that host.',
    params: {
      id: { type: 'string', description: 'Profile id (the *.json file name without extension).' },
      targetUrl: { type: 'string', description: 'Optional URL whose host is checked against allowedDomains and whose storageState file is validated.' },
    },
    approval: 'none', readOnly: true, mutating: false, concurrencySafe: true, timeoutMs: 10_000,
    examples: [{ args: { id: 'bootstrap' } }],
    async execute(args, ctx) {
      const id = args.id
      if (typeof id !== 'string' || !id.trim()) throw new Error('id is required')
      return ctx.service.inspectAuthProfile(id, typeof args.targetUrl === 'string' ? args.targetUrl : undefined, ctx.configDir)
    },
  },
]
