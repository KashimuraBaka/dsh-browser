import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { AuthProfileStore } from '../src/auth-profiles.ts'
import { resolveRulePack, resolveRulePacksFromDirectory } from '../src/rule-packs.ts'

test('named auth profiles are domain-scoped and default to read-only state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-auth-profile-'))
  const statePath = path.join(dir, 'work.json')
  const missingPath = path.join(dir, 'missing.json')
  fs.writeFileSync(statePath, JSON.stringify({ cookies: [], origins: [] }), 'utf8')
  try {
    const profiles = new AuthProfileStore({
      work: { storageStatePath: statePath, allowedDomains: ['example.com'] },
      missing: { storageStatePath: missingPath, allowedDomains: ['example.com'] },
      bootstrap: { storageStatePath: missingPath, allowedDomains: ['example.com'], persistState: true },
    })
    assert.equal(profiles.resolve('work', 'https://sub.example.com/path').persistState, false)
    assert.throws(() => profiles.resolve('work', 'https://other.test/'), /not allowed/i)
    assert.throws(() => profiles.resolve('missing', 'https://example.com/'), /storageState file does not exist/i)
    assert.equal(profiles.resolve('bootstrap', 'https://example.com/').persistState, true)
    assert.throws(() => profiles.resolve('unknown', 'https://example.com/'), /unknown auth profile/i)
    assert.deepEqual(profiles.list().map(v => v.id), ['bootstrap', 'missing', 'work'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('rule packs require host match and a verified local init script', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-rule-'))
  const script = path.join(dir, 'init.js')
  fs.writeFileSync(script, 'window.__enhanced = true', 'utf8')
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(script)).digest('hex')
  try {
    const packs = {
      enhanced: {
        matches: ['example.com'],
        initScriptPath: script,
        initScriptSha256: sha256,
        steps: [
          { type: 'waitFor' as const, selector: '#results', timeoutMs: 5000 },
          { type: 'scroll' as const, deltaY: 1200, repeat: 2, waitMs: 100 },
        ],
      },
    }
    const resolved = resolveRulePack(packs, 'enhanced', 'https://sub.example.com/search')
    assert.equal(resolved?.initScriptPath, script)
    assert.equal(resolved?.steps.length, 2)
    assert.throws(() => resolveRulePack(packs, 'enhanced', 'https://other.test/'), /not allowed/i)
    assert.throws(() => resolveRulePack({ enhanced: { ...packs.enhanced, initScriptSha256: '0'.repeat(64) } }, 'enhanced', 'https://example.com/'), /hash/i)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('rule pack validation rejects unbounded steps', () => {
  assert.throws(() => resolveRulePack({ bad: { matches: ['example.com'], steps: [{ type: 'wait' as const, waitMs: 120_000 }] } }, 'bad', 'https://example.com/'), /waitMs/i)
})

test('rule packs load from a directory with per-file ids', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-rule-dir-'))
  try {
    // valid pack: filename is the id
    fs.writeFileSync(
      path.join(dir, 'bbs.json'),
      JSON.stringify({
        matches: ['bbs.zombieden.cn'],
        initScriptPath: path.join(dir, 'bbs-inject.init.js'),
        initScriptSha256: crypto.createHash('sha256').update('init').digest('hex'),
        steps: [{ type: 'waitFor' as const, selector: '#board', timeoutMs: 5000 }],
      }),
      'utf8',
    )
    // illegal JSON: should surface in errors keyed by id
    fs.writeFileSync(path.join(dir, 'broken.json'), '{ not valid json', 'utf8')
    // step that violates validateStep: wait waitMs exceeds 10000
    fs.writeFileSync(
      path.join(dir, 'slow.json'),
      JSON.stringify({ matches: ['example.com'], steps: [{ type: 'wait' as const, waitMs: 120_000 }] }),
      'utf8',
    )

    const { packs, errors } = resolveRulePacksFromDirectory(dir)
    assert.ok(packs.bbs, 'bbs pack should resolve')
    assert.deepEqual(packs.bbs.matches, ['bbs.zombieden.cn'])
    assert.equal(packs.bbs.steps.length, 1)
    assert.equal(packs.bbs.steps[0].type, 'waitFor')

    const broken = errors.find(e => e.id === 'broken')
    assert.ok(broken, 'broken.json should produce an error')
    assert.ok(broken?.reason, 'broken error should carry a reason')

    const slow = errors.find(e => e.id === 'slow')
    assert.ok(slow, 'slow.json should produce an error for invalid step')
    assert.match(slow?.reason ?? '', /waitMs/i)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
