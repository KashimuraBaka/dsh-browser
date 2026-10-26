import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
function matchHost(hostname, values) {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    return values.some(value => {
        const domain = value.toLowerCase().trim().replace(/^\*\./, '').replace(/\.$/, '');
        return domain.length > 0 && (host === domain || host.endsWith('.' + domain));
    });
}
function validateStep(step) {
    if ((step.type === 'waitFor' || step.type === 'click') && (!step.selector || step.selector.length > 500))
        throw new Error(step.type + ' selector is invalid');
    if ((step.type === 'waitFor' || step.type === 'click') && (step.timeoutMs ?? 15_000) > 30_000)
        throw new Error(step.type + ' timeoutMs exceeds 30000');
    if (step.type === 'wait' && (step.waitMs < 0 || step.waitMs > 10_000))
        throw new Error('waitMs must be between 0 and 10000');
    if (step.type === 'scroll') {
        if ((step.repeat ?? 1) < 1 || (step.repeat ?? 1) > 10)
            throw new Error('scroll repeat must be between 1 and 10');
        if ((step.waitMs ?? 300) < 0 || (step.waitMs ?? 300) > 5_000)
            throw new Error('scroll waitMs must be between 0 and 5000');
        if (Math.abs(step.deltaY ?? 2000) > 20_000)
            throw new Error('scroll deltaY exceeds 20000');
    }
}
export function resolveRulePack(packs, id, targetUrl) {
    if (!id)
        return undefined;
    const pack = packs[id];
    if (!pack)
        throw new Error('unknown rule pack: ' + id);
    const url = new URL(targetUrl);
    if (!matchHost(url.hostname, pack.matches ?? []))
        throw new Error('rule pack ' + id + ' is not allowed for ' + url.hostname);
    const steps = pack.steps ?? [];
    if (steps.length > 25)
        throw new Error('rule pack has more than 25 steps');
    steps.forEach(validateStep);
    if (pack.initScriptPath) {
        if (!pack.initScriptSha256 || !/^[a-f\d]{64}$/i.test(pack.initScriptSha256))
            throw new Error('rule pack init script requires a SHA-256 hash');
        const stat = fs.statSync(pack.initScriptPath);
        if (stat.size > 64 * 1024)
            throw new Error('rule pack init script exceeds 65536 bytes');
        const actual = crypto.createHash('sha256').update(fs.readFileSync(pack.initScriptPath)).digest('hex');
        if (actual.toLowerCase() !== pack.initScriptSha256.toLowerCase())
            throw new Error('rule pack init script hash mismatch');
    }
    return { id, ...pack, steps };
}
export function resolveRulePacksFromDirectory(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const packs = {};
    const errors = [];
    for (const entry of fs.readdirSync(dir)) {
        if (!entry.toLowerCase().endsWith('.json'))
            continue;
        const id = entry.slice(0, -5);
        const file = path.join(dir, entry);
        if (!fs.statSync(file).isFile())
            continue;
        try {
            const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (!raw || typeof raw !== 'object' || Array.isArray(raw))
                throw new Error('not a JSON object');
            const record = raw;
            if (record.matches !== undefined && !Array.isArray(record.matches))
                throw new Error('matches must be an array');
            if (record.initScriptPath !== undefined && typeof record.initScriptPath !== 'string')
                throw new Error('initScriptPath must be a string');
            if (record.initScriptSha256 !== undefined && typeof record.initScriptSha256 !== 'string')
                throw new Error('initScriptSha256 must be a string');
            if (record.steps !== undefined && !Array.isArray(record.steps))
                throw new Error('steps must be an array');
            const matches = Array.isArray(record.matches) ? record.matches.filter(x => typeof x === 'string') : [];
            const steps = Array.isArray(record.steps) ? record.steps : [];
            steps.forEach(validateStep);
            packs[id] = {
                matches,
                initScriptPath: typeof record.initScriptPath === 'string' ? record.initScriptPath : undefined,
                initScriptSha256: typeof record.initScriptSha256 === 'string' ? record.initScriptSha256 : undefined,
                steps,
            };
        }
        catch (error) {
            errors.push({ id, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return { packs, errors };
}
export async function applyRuleSteps(page, pack) {
    if (!pack)
        return;
    for (const step of pack.steps) {
        try {
            if (step.type === 'waitFor')
                await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 15_000 });
            else if (step.type === 'click') {
                await page.waitForSelector(step.selector, { timeout: step.timeoutMs ?? 15_000 });
                await page.click(step.selector);
            }
            else if (step.type === 'wait')
                await page.waitForTimeout(step.waitMs);
            else
                for (let i = 0; i < (step.repeat ?? 1); i++) {
                    await page.mouse?.wheel(0, step.deltaY ?? 2000);
                    await page.waitForTimeout(step.waitMs ?? 300);
                }
        }
        catch (error) {
            if ((step.type === 'waitFor' || step.type === 'click') && step.optional)
                continue;
            throw error;
        }
    }
}
//# sourceMappingURL=rule-packs.js.map