#!/usr/bin/env node
// Builds manifest.json, the machine-readable registry index, from:
//   package.json          the list of addon repositories
//   registry.config.json  registry metadata, categories and hand-authored overrides
//   GitHub                each addon repo's package.json, repo metadata, latest release, file listing
//
// Usage:
//   node tools/build-manifest.mjs            write manifest.json
//   node tools/build-manifest.mjs --check    exit 1 if manifest.json is out of date (CI)
//
// Auth is optional for public repos; set GH_TOKEN or GITHUB_TOKEN to raise the rate limit.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || ''
const API = 'https://api.github.com'

const readJson = async (p) => JSON.parse(await readFile(join(ROOT, p), 'utf8'))

async function gh(path, { raw = false } = {}) {
    const headers = {
        Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
        'User-Agent': 'polyphase-registry-builder',
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`

    for (let attempt = 0; ; attempt++) {
        const res = await fetch(`${API}${path}`, { headers })
        if (res.status === 404) return null
        if (res.ok) return raw ? res.text() : res.json()
        // Secondary rate limit / transient failure: back off and retry twice.
        if (attempt < 2 && (res.status === 403 || res.status === 429 || res.status >= 500)) {
            await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
            continue
        }
        throw new Error(`GitHub ${res.status} ${res.statusText} for ${path}`)
    }
}

// Platform runtimes are com.recomp.<platform>; anything else under com.recomp. is a game package.
const PLATFORMS = ['gba', 'n64', 'ps1', 'ps2', 'psp', 'gc', 'gamecube', 'wii', 'nds', 'snes', 'nes', 'gb', 'gbc', 'saturn', 'dreamcast']

const CATEGORY_RULES = [
    [/^com\.recomp\.mod\./, 'base'],
    [new RegExp(`^com\\.recomp\\.(${PLATFORMS.join('|')})$`), 'platforms'],
    [/^com\.recomp\./, 'games'],
]

const inferCategory = (id) => CATEGORY_RULES.find(([re]) => re.test(id))?.[1] ?? 'games'

const humanize = (id) =>
    id
        .replace(/^com\.(polyphase|recomp)\./, '')
        .split('.')
        .map((s) => s.replace(/(^|[-_])(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase()))
        .join(' ')

const firstSentence = (text) => {
    if (!text) return null
    const m = text.match(/^.*?[.!?](\s|$)/)
    return (m ? m[0] : text).trim()
}

// package.json dependencies are either {"id": "^1.0.0"} or ["id", ...]; normalize to the object form.
const normalizeDeps = (deps) => {
    if (!deps) return {}
    if (Array.isArray(deps)) return Object.fromEntries(deps.map((d) => [d, '*']))
    return { ...deps }
}

const uniq = (values) => [...new Set(values.filter(Boolean))]

// Root-level file/dir name used for docs, in preference order (spelling variants included on purpose).
const DOC_DIRS = ['Documentation', 'Docs', 'Documentaion', 'doc', 'docs']

async function collect(repoUrl) {
    const slug = repoUrl.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')

    const [repo, contents, release] = await Promise.all([
        gh(`/repos/${slug}`),
        gh(`/repos/${slug}/contents`),
        gh(`/repos/${slug}/releases/latest`),
    ])
    // GitHub answers 404 for private repos the token cannot see as well as for missing ones.
    // Report it and let the caller skip this addon so the rest of the registry still rebuilds.
    if (!repo) {
        console.warn(`  ! ${slug}: repository not found or not visible to this token, skipping`)
        return null
    }

    const branch = repo.default_branch || 'main'
    const files = Array.isArray(contents) ? contents.map((f) => f.name) : []
    const rawText = files.includes('package.json')
        ? await gh(`/repos/${slug}/contents/package.json?ref=${branch}`, { raw: true })
        : null

    let pkg = null
    if (rawText) {
        try {
            pkg = JSON.parse(rawText)
        } catch (err) {
            console.warn(`  ! ${slug}: package.json is not valid JSON (${err.message})`)
        }
    }

    return { slug, repo, branch, files, pkg, release }
}

function toPackage({ slug, repo, branch, files, pkg, release }, overrides) {
    const id = pkg?.name || slug.split('/').pop()
    const o = overrides[id] || {}
    const native = pkg?.native || {}
    const raw = `https://raw.githubusercontent.com/${slug}/${branch}`
    const html = `https://github.com/${slug}`
    const docDir = DOC_DIRS.find((d) => files.includes(d))
    const isEmpty = files.length === 0
    const description = o.description || pkg?.description || repo.description || null

    return {
        id,
        name: o.name || pkg?.displayName || humanize(id),
        summary: o.summary || firstSentence(repo.description || pkg?.description) || null,
        description,
        category: o.category || inferCategory(id),
        type: o.type || (pkg?.native ? 'plugin' : pkg ? 'addon' : 'plugin'),
        tags: uniq([...(o.tags || []), ...(pkg?.keywords || []), ...(repo.topics || [])]),
        version: o.version || pkg?.version || null,
        author: o.author || pkg?.author || null,
        license: repo.license?.spdx_id || null,
        engine: {
            target: native.target ?? null,
            apiVersion: native.apiVersion ?? null,
            entrySymbol: native.entrySymbol ?? null,
            binaryName: native.binaryName ?? null,
            resolveMode: native.resolveMode ?? null,
        },
        // Empty means "no platform restriction declared", not "no platforms supported".
        platforms: o.platforms || Object.keys(pkg?.nativePerPlatform || {}),
        buildTargets: native.buildTargets || [],
        dependencies: normalizeDeps(pkg?.dependencies || native.dependencies),
        repository: {
            type: 'git',
            url: html,
            clone: `${html}.git`,
            branch,
        },
        urls: {
            manifest: pkg ? `${raw}/package.json` : null,
            readme: files.includes('README.md') ? `${raw}/README.md` : null,
            documentation: docDir ? `${html}/tree/${branch}/${docDir}` : null,
            releases: `${html}/releases`,
            issues: `${html}/issues`,
        },
        latestRelease: release
            ? { tag: release.tag_name, url: release.html_url }
            : null,
        prebuiltBinaries: pkg?.binaries || native.binaries || [],
        updatedAt: repo.pushed_at,
        status: isEmpty ? 'unpublished' : repo.archived ? 'archived' : 'published',
    }
}

const [{ addons }, config] = await Promise.all([
    readJson('package.json'),
    readJson('registry.config.json'),
])

const sources = []
for (const url of addons) {
    process.stdout.write(`fetching ${url}\n`)
    const source = await collect(url)
    if (source) sources.push(source)
}
if (sources.length === 0) throw new Error('no addon repositories could be read')

const packages = sources.map((s) => toPackage(s, config.overrides || {}))

const manifest = {
    ...config.registry,
    // Derived from repo activity rather than build time, so a no-op rebuild produces no diff.
    updated: packages.map((p) => p.updatedAt).filter(Boolean).sort().pop()?.slice(0, 10) ?? null,
    packageCount: packages.length,
    categories: config.categories || [],
    packages,
}

const serialized = JSON.stringify(manifest, null, 4) + '\n'
const current = await readFile(join(ROOT, 'manifest.json'), 'utf8').catch(() => null)

const duplicates = packages.map((p) => p.id).filter((id, i, a) => a.indexOf(id) !== i)
if (duplicates.length) console.warn(`! duplicate package ids: ${uniq(duplicates).join(', ')}`)
for (const p of packages) {
    for (const dep of Object.keys(p.dependencies)) {
        if (!packages.some((q) => q.id === dep)) console.warn(`! ${p.id} depends on unlisted addon: ${dep}`)
    }
    if (p.status !== 'published') console.warn(`! ${p.id} is ${p.status}`)
}

if (CHECK) {
    if (current === serialized) {
        console.log(`manifest.json is up to date (${packages.length} packages)`)
        process.exit(0)
    }
    console.error('manifest.json is out of date, run: node tools/build-manifest.mjs')
    process.exit(1)
}

await writeFile(join(ROOT, 'manifest.json'), serialized)
console.log(`${current === serialized ? 'unchanged' : 'wrote'} manifest.json (${packages.length} packages)`)
