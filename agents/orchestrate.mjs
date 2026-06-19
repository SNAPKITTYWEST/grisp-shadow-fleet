#!/usr/bin/env node
import { readdirSync, statSync, mkdirSync } from 'node:fs'
import { join, relative, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifyOnce } from './icp-verifier.mjs'
import { run as runMetrics } from './metric-stream.mjs'
import { run as runBifrost } from './bifrost-translator.mjs'
import { run as runWatermark } from './watermark.mjs'
import { sealEvent } from './worm-chain.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dir, '..')
const PAGES = join(ROOT, 'pages')
const OUT = join(ROOT, 'bifrost-out')
const PUBLIC = join(ROOT, 'public')
const DAY_MS = 24 * 60 * 60 * 1000

let tick = 0
let running = false

function parseArgs() {
  const args = process.argv.slice(2)
  const intervalIdx = args.indexOf('--interval')
  return {
    once: args.includes('--once'),
    interval: intervalIdx >= 0 ? parseInt(args[intervalIdx + 1], 10) : parseInt(process.env.ORCHESTRATE_INTERVAL_MS || '30000', 10),
  }
}

function walk(dir, match, files = []) {
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try { entries = readdirSync(current) } catch { continue }
    for (const entry of entries) {
      const full = join(current, entry)
      let stat
      try { stat = statSync(full) } catch { continue }
      if (stat.isDirectory()) stack.push(full)
      else if (match(full, stat)) files.push(full)
    }
  }
  return files
}

function recentPageSources() {
  const cutoff = Date.now() - DAY_MS
  return walk(PAGES, (file, stat) => extname(file) === '.ts' && stat.mtimeMs >= cutoff)
}

function outFiles() {
  return new Set(walk(OUT, file => true).map(file => relative(OUT, file)))
}

function prefixForSource(source) {
  const rel = relative(PAGES, source)
  const parts = rel.split(/[\\/]/).filter(Boolean)
  const stem = basename(source).replace(/\.[^.]+$/, '')
  const scope = parts.length > 1 ? parts.slice(0, -1).join('-') : 'page'
  return stem === 'index' ? `${scope}-` : `${scope}-`
}

async function quiet(fn) {
  const out = console.log
  const err = console.error
  console.log = (...args) => err(...args)
  console.error = (...args) => err(...args)
  try { return await fn() }
  finally {
    console.log = out
    console.error = err
  }
}

function sealed(name, status, payload = {}) {
  const { seal } = sealEvent(name, 'agent-result', { status, ...payload })
  return { name, status, seal }
}

async function runTick() {
  if (running) return
  running = true
  tick += 1
  const ts = new Date().toISOString()
  const agents = []

  try {
    mkdirSync(PUBLIC, { recursive: true })
    mkdirSync(OUT, { recursive: true })

    const icp = await quiet(() => verifyOnce({}))
    if (icp.status === 'DRIFT_DETECTED') {
      const incident = sealEvent('ORCHESTRATOR', 'icp-drift-incident', { tick, ts, icp })
      agents.push({ name: 'icp-verifier', status: 'DRIFT_DETECTED', seal: incident.seal })
      process.stdout.write(JSON.stringify({ tick, ts, agents }) + '\n')
      return
    }
    agents.push(sealed('icp-verifier', icp.status || 'VERIFIED', { internalSeal: icp.seal }))

    const metrics = await quiet(() => runMetrics({
      repoPath: ROOT,
      outPath: join(PUBLIC, 'metrics.json'),
    }))
    agents.push(sealed('metric-stream', 'UPDATED', { internalSeal: metrics.wormSeal }))

    const before = outFiles()
    const sources = recentPageSources()
    const translations = []
    for (const sourcePath of sources) {
      const result = await quiet(() => runBifrost({
        sourcePath,
        targets: ['rust', 'lean4'],
        outDir: OUT,
        namePrefix: prefixForSource(sourcePath),
      }))
      translations.push(result)
    }
    agents.push(sealed('bifrost-translator', sources.length ? 'TRANSLATED' : 'IDLE', {
      files: sources.length,
      internalSeals: translations.map(r => r.seal).filter(Boolean),
    }))

    const after = outFiles()
    const newFiles = [...after].filter(file => !before.has(file))
    const watermark = await quiet(() => runWatermark({ target: OUT }))
    agents.push(sealed('watermark', watermark.marks.length ? 'WATERMARKED' : 'IDLE', {
      files: newFiles,
      filesMarked: watermark.marks.length,
      internalSeal: watermark.seal,
    }))

    process.stdout.write(JSON.stringify({ tick, ts, agents }) + '\n')
  } catch (error) {
    const incident = sealEvent('ORCHESTRATOR', 'tick-error', { tick, ts, message: error.message })
    agents.push({ name: 'orchestrator', status: 'ERROR', seal: incident.seal })
    process.stdout.write(JSON.stringify({ tick, ts, agents }) + '\n')
  } finally {
    running = false
  }
}

function start() {
  const args = parseArgs()
  runTick()
  if (!args.once) setInterval(runTick, args.interval)
}

start()
