import fs from 'node:fs'
import path from 'node:path'

export interface AuthProfileConfig {
  storageStatePath: string
  allowedDomains: string[]
  /** Persist cookies/localStorage back after a transient context closes. Defaults to false. */
  persistState?: boolean
}

export interface ResolvedAuthProfile extends AuthProfileConfig {
  id: string
  persistState: boolean
}

export function hostAllowed(hostname: string, domains: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  return domains.some(value => {
    const domain = value.toLowerCase().trim().replace(/^\*\./, '').replace(/\.$/, '')
    return domain.length > 0 && (host === domain || host.endsWith('.' + domain))
  })
}

export class AuthProfileStore {
  constructor(private readonly profiles: Record<string, AuthProfileConfig> = {}) {}

  resolve(id: string, targetUrl: string): ResolvedAuthProfile {
    const profile = this.profiles[id]
    if (!profile) throw new Error('unknown auth profile: ' + id)
    const url = new URL(targetUrl)
    if (!hostAllowed(url.hostname, profile.allowedDomains ?? [])) throw new Error('auth profile ' + id + ' is not allowed for ' + url.hostname)
    if (!profile.storageStatePath?.trim()) throw new Error('auth profile ' + id + ' has no storageStatePath')
    const persistState = profile.persistState ?? false
    if (!fs.existsSync(profile.storageStatePath)) {
      if (!persistState) throw new Error('auth profile ' + id + ' storageState file does not exist: ' + profile.storageStatePath)
    } else if (!fs.statSync(profile.storageStatePath).isFile()) {
      throw new Error('auth profile ' + id + ' storageState path is not a file: ' + profile.storageStatePath)
    }
    return { id, ...profile, persistState }
  }

  list(): { id: string; allowedDomains: string[]; persistState: boolean }[] {
    return Object.entries(this.profiles).sort(([a], [b]) => a.localeCompare(b)).map(([id, profile]) => ({ id, allowedDomains: [...(profile.allowedDomains ?? [])], persistState: profile.persistState ?? false }))
  }

  /** Look up a single profile with its storageStatePath (undefined if unknown). */
  get(id: string): ResolvedAuthProfile | undefined {
    const profile = this.profiles[id]
    return profile ? { id, ...profile, persistState: profile.persistState ?? false } : undefined
  }
}

/**
 * Dynamically load auth profiles from a directory. Each `*.json` file is one
 * profile; the file name (without extension) is the profile id. The directory
 * is created on demand so the feature works out of the box with an empty store.
 * A file whose shape is not a valid {@link AuthProfileConfig} is skipped and
 * reported via `errors` so one bad file cannot break the whole store.
 */
export function resolveAuthProfilesFromDirectory(dir: string): { profiles: Record<string, AuthProfileConfig>; errors: { id: string; reason: string }[] } {
  fs.mkdirSync(dir, { recursive: true })
  const profiles: Record<string, AuthProfileConfig> = {}
  const errors: { id: string; reason: string }[] = []
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.json')) continue
    const id = entry.slice(0, -5)
    const file = path.join(dir, entry)
    if (!fs.statSync(file).isFile()) continue
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a JSON object')
      const record = raw as Record<string, unknown>
      if (typeof record.storageStatePath !== 'string' || !record.storageStatePath.trim()) throw new Error('missing string storageStatePath')
      if (record.allowedDomains !== undefined && !Array.isArray(record.allowedDomains)) throw new Error('allowedDomains must be an array')
      if (record.persistState !== undefined && typeof record.persistState !== 'boolean') throw new Error('persistState must be a boolean')
      profiles[id] = {
        storageStatePath: record.storageStatePath,
        allowedDomains: Array.isArray(record.allowedDomains) ? (record.allowedDomains as unknown[]).filter(x => typeof x === 'string') : [],
        persistState: record.persistState === true,
      }
    } catch (error) {
      errors.push({ id, reason: error instanceof Error ? error.message : String(error) })
    }
  }
  return { profiles, errors }
}
