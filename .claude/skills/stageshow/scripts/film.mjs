import { launch } from './browser.mjs'
import { record, analyse, contentChanges } from './jumps-core.mjs'
import { watchMotion } from './motion-watch.mjs'
import { auditLayout } from './layout-core.mjs'
import { instrumentationSource, coverage, reportResult, printCoverage, motionFindings } from './verification.mjs'
import { filmChecksSource } from './film-checks.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

if (!process.env.FILM_CHILD) {
  const TRIES = 6
  let last
  let reloaded = false
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    last = spawnSync(process.execPath, process.argv.slice(1), { env: { ...process.env, FILM_CHILD: '1' }, encoding: 'utf8' })
    const output = `${last.stdout}${last.stderr}`
    reloaded = last.status !== 0 && (last.status === 3 || /FILM_RELOADED|Execution context was destroyed|Target page, context or browser has been closed|frame was detached/.test(output))
    if (!reloaded) break
    if (attempt < TRIES) {
      console.error(`film: the page reloaded mid-film, filming again (${attempt + 1} of ${TRIES})`)
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500 * attempt)
    }
  }
  if (reloaded) {
    console.error(`film: the page kept reloading (other work is saving files); nothing was written. Try again once it is quiet.`)
    process.exit(3)
  }
  process.stdout.write((last.stdout || '').replace(/^FILM_RELOADED.*\n?/m, ''))
  process.stderr.write(last.stderr || last.error?.message || '')
  process.exit(last.status ?? 1)
}

const args = process.argv.slice(2)
const FLAGS = new Set(['reduced', 'dark', 'still', 'hover', 'strict', 'help', 'gate', 'states'])
const url = args.find((a, i) => !a.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--') || FLAGS.has(args[i - 1].slice(2))))
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)
const VALUE_OPTIONS = new Set(['out', 'every', 'count', 'delay', 'at', 'select', 'width', 'cols', 'zoom', 'scale', 'pad', 'slow', 'hover-for', 'leave-for', 'report', 'states-for'])
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) continue
  const name = args[i].slice(2)
  if (FLAGS.has(name)) continue
  if (!VALUE_OPTIONS.has(name) || !args[i + 1] || args[i + 1].startsWith('--')) {
    console.error(`film: unknown option or missing value: ${args[i]}`)
    process.exit(2)
  }
  i++
}

if (!url || has('help')) {
  const head = (await import('node:fs')).readFileSync(new URL(import.meta.url), 'utf8').split('\n')
  const doc = []
  for (const line of head) {
    if (!line.startsWith('//')) break
    doc.push(line.replace(/^\/\/ ?/, ''))
  }
  console.log(doc.join('\n'))
  process.exit(has('help') ? 0 : 2)
}

const out = resolve(process.cwd(), opt('out', 'shots/film.png'))
const every = Number(opt('every', 500))
const count = Number(opt('count', 36))
let select = opt('select', null)
{
  const url = args.find((a) => /^https?:/.test(a)) || ''
  const slug = (url.match(/[?&]example=([^&#]+)/) || [])[1]
  if (select === '#example' && slug) select = `#example[data-example="${decodeURIComponent(slug)}"]`
}
const width = Number(opt('width', 1280))
const colsOpt = opt('cols', null)
const zoomOpt = opt('zoom', null)
const zoomTarget = zoomOpt?.startsWith('target:') ? { name: zoomOpt.slice(7).split(',')[0], pad: Number(zoomOpt.split(',')[1] ?? 16) } : null
const zoom = zoomOpt && !zoomTarget ? zoomOpt.split(',').map(Number) : null
const delay = Number(opt('delay', 0))
const pad = Number(opt('pad', 16))
const at = opt('at', null)
const still = has('still')
const hover = has('hover')
const hoverFor = Number(opt('hover-for', 4000))
const leaveFor = Number(opt('leave-for', 1600))
const reportPath = opt('report', null)
const statesFor = Number(opt('states-for', 20000))
for (const [name, value, minimum] of [['every', every, 1], ['count', count, 1], ['width', width, 1], ['delay', delay, 0], ['pad', pad, 0], ['hover-for', hoverFor, 0], ['leave-for', leaveFor, 0], ['states-for', statesFor, 0], ['slow', Number(opt('slow', 1)), 1]]) {
  if (!Number.isFinite(value) || value < minimum || (['count', 'width'].includes(name) && !Number.isInteger(value))) {
    console.error(`film: invalid --${name}: ${value}`)
    process.exit(2)
  }
}
if (still && hover) { console.error('film: --still and --hover are separate capture modes'); process.exit(2) }
if (colsOpt && (!Number.isInteger(Number(colsOpt)) || Number(colsOpt) < 1)) { console.error('film: --cols must be a positive integer'); process.exit(2) }
if (zoomTarget && (!zoomTarget.name || !Number.isFinite(zoomTarget.pad) || zoomTarget.pad < 0)) { console.error('film: target zoom needs a name and a nonnegative padding'); process.exit(2) }
if (has('scale') && (!Number.isFinite(Number(opt('scale'))) || Number(opt('scale')) <= 0)) { console.error('film: --scale must be positive'); process.exit(2) }

if (zoom && (zoom.length !== 4 || zoom.some((n) => !Number.isFinite(n)) || zoom[2] <= 0 || zoom[3] <= 0)) {
  console.error('--zoom wants x,y,w,h in stage coordinates, e.g. --zoom 40,60,200,120, or target:<data-target name>[,pad]')
  process.exit(2)
}
const dsf = zoom ? Number(opt('scale', 0)) || Math.min(8, Math.max(3, Math.ceil(1200 / zoom[2]))) : zoomTarget ? Number(opt('scale', 0)) || 4 : 2

const browser = await launch()
const fail = async (msg) => {
  console.error(msg)
  await browser.close()
  process.exit(2)
}
const page = await browser.newPage({
  viewport: { width, height: 900 },
  deviceScaleFactor: dsf,
  reducedMotion: has('reduced') ? 'reduce' : 'no-preference',
  colorScheme: has('dark') ? 'dark' : 'light',
})

const slow = Math.max(1, Number(opt('slow', 1)))
await page.addInitScript(([slow, dark, stillRun]) => {
  window.__stageshow = { slow, ...(dark ? { theme: 'dark' } : {}) }
  window.__ssStill = stillRun
}, [slow, has('dark'), still])
await page.addInitScript({ content: instrumentationSource(record, select) })
await page.addInitScript({ content: filmChecksSource() })
if (slow > 1) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 / slow })
}
await page.addInitScript(watchMotion, select)

let notes = []
let serverErrors = []
const noise = /favicon/
page.on('console', (m) => {
  if (!['warning', 'error'].includes(m.type()) || noise.test(m.text())) return
  if (/Failed to load resource.*(5\d\d|Internal Server Error)/.test(m.text())) serverErrors.push(m.text())
  else notes.push(`${m.type()}: ${m.text()}`)
})
page.on('response', (r) => r.status() >= 500 && serverErrors.push(`${r.status()} ${r.url()}`))
page.on('pageerror', (e) => notes.push(`exception: ${e.message}`))

const findStage = () =>
  page.waitForFunction(
    (sel) => {
      const stages = window.__ssVisibleStages(sel)
      if (!stages.length) {
        if (!document.querySelector('.ss-stage') && document.querySelector('iframe')) throw new Error('This page embeds its scene in an iframe. Film the scene URL directly (the playground uses ?capture=<example>), not the surrounding viewer.')
        if (sel && [...document.querySelectorAll(sel)].some(el => !el.matches('.ss-stage') && !el.querySelector('.ss-stage') && el.closest('.ss-stage'))) throw new Error('--select matches content inside a Stage. Select the .ss-stage itself or its .ss-fit container.')
        return false
      }
      document.querySelectorAll('[data-film-target]').forEach((el) => el.removeAttribute('data-film-target'))
      for (const stage of stages) {
        const target = sel ? [...document.querySelectorAll(sel)].find((el) => el === stage || el.contains(stage)) : stage.closest('.ss-fit') || stage
        target.setAttribute('data-film-target', '')
      }
      return true
    },
    select,
    { timeout: 30000, polling: 100 },
  )

const MAX_LOADS = 3
let loaded = false
let timeouts = 0
for (let attempt = 1; attempt <= MAX_LOADS && !loaded; attempt++) {
  notes = []
  serverErrors = []
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
    await findStage()
    if (serverErrors.length && attempt < MAX_LOADS) {
      await page.waitForTimeout(800)
      continue
    }
    loaded = true
  } catch (e) {
    const timedOut = e.name === 'TimeoutError' || /Timeout/.test(e.message)
    if (timedOut && ++timeouts < 2) continue
    if (!timedOut && serverErrors.length && attempt < MAX_LOADS) {
      await page.waitForTimeout(800)
      continue
    }
    const why = timedOut ? `no visible stages in "${select ?? '.ss-fit, .ss-stage'}" after retrying` : e.message
    await fail([`film: ${why}`, ...serverErrors.map((s) => `server: ${s}`), ...notes].join('\n'))
  }
}
if (!loaded) await fail(`film: page never loaded cleanly\n${[...serverErrors, ...notes].join('\n')}`)
await page.waitForFunction(() => !document.querySelector('[data-film-target] .ss-stage[data-placing], [data-film-target].ss-stage[data-placing]'), null, { timeout: 10000 }).catch(() => notes.push('incomplete: stage placement did not settle within 10s'))
{
  const want = new URL(url).searchParams.get('example')
  const got = await page.evaluate(() => document.querySelector('#example')?.getAttribute('data-example'))
  if (want && got && got !== want) await fail(`film: asked for ${want} but the page shows ${got}`)
}
notes.push(...[...new Set(serverErrors)].map((s) => `server error: ${s}`))
const scaleNotes = await page.evaluate((phone) => window.__ssVisibleStages(window.__ssVerification.selector).flatMap((st) => {
  if (!st.offsetWidth) return []
  const k = st.getBoundingClientRect().width / st.offsetWidth
  const lay = st.getAttribute('data-layout')
  let message
  if (phone && k < 0.85) message = `shrunk, not laid out for the phone: drawn at ${k.toFixed(2)} (${lay} design, ${st.offsetWidth}px wide); design compact at the column's width and draw it 1:1`
  else if (k < 0.85) message = `scale: ${k.toFixed(2)} (${lay} design, ${st.offsetWidth}px wide); type reads small below about 0.85`
  else if (k > 1.01) message = `scale: ${k.toFixed(2)}, grown past the design size`
  return message ? [{ key: st.getAttribute('data-ss-verification-stage'), message }] : []
}), width < 600)

page.on('framenavigated', (f) => {
  if (f === page.mainFrame()) {
    console.log('FILM_RELOADED')
    process.exit(3)
  }
})
const overlaid = async () => {
  if (await page.$('vite-error-overlay')) {
    console.log('FILM_RELOADED (vite error overlay)')
    process.exit(3)
  }
}

const el = await page.$('[data-film-target]')
const stageCount = await page.evaluate((selector) => window.__ssVisibleStages(selector).length, select)
if (stageCount > 1 && (zoom || zoomTarget || at)) await fail('film: --zoom and --at require one visible stage; narrow --select')
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(150)

const docBottom = await page.evaluate(() => Math.max(...[...document.querySelectorAll('[data-film-target]')].map((el) => el.getBoundingClientRect().bottom + window.scrollY)))
if (docBottom + pad + 32 > 900) await page.setViewportSize({ width, height: Math.ceil(docBottom + pad + 32) })
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(50)

const stageRoot = async () =>
  (await el.evaluateHandle((n) => (n.classList.contains('ss-stage') ? n : n.querySelector('.ss-stage') ?? n))).asElement()
const stageRoots = async () => {
  const handles = await page.locator('[data-ss-verification-stage]').elementHandles()
  const roots = []
  for (const handle of handles) if (await handle.evaluate((node) => window.__ssVisibleStages(window.__ssVerification.selector).includes(node))) roots.push(handle)
  return roots
}

const waitForMark = async () => {
  if (!at) return
  const root = await stageRoot()
  try {
    await page.waitForFunction(([r, name]) => r.getAttribute('data-mark') === name, [root, at], { timeout: 30000 * slow, polling: 16 })
  } catch {
    const seen = await root.getAttribute('data-mark')
    await fail(`film: stage never reached data-mark="${at}" in 30s (last seen: ${seen ?? 'none'}). Does the script call act.mark('${at}')?`)
  }
}

const clipFor = async () => {
  let bounds = await el.boundingBox()
  for (let i = 0; !bounds && i < 50; i++) {
    await page.waitForTimeout(200)
    bounds = await el.boundingBox()
  }
  if (!bounds) await fail('film: the stage has no box after 10s. Is it rendered and visible?')
  if (!zoom && !zoomTarget) {
    const boxes = await page.locator('[data-film-target]').evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom } }))
    const x = Math.max(0, Math.min(...boxes.map((r) => r.x)) - pad)
    const y = Math.max(0, Math.min(...boxes.map((r) => r.y)) - pad)
    return { x, y, width: Math.max(...boxes.map((r) => r.right)) + pad - x, height: Math.max(...boxes.map((r) => r.bottom)) + pad - y }
  }
  if (zoomTarget) {
    const root = await stageRoot()
    const t = await root.$(`[data-target="${zoomTarget.name}"]`)
    const tb = t && (await t.boundingBox())
    if (!tb) await fail(`film: --zoom target:${zoomTarget.name} found no visible [data-target="${zoomTarget.name}"] in the stage`)
    const k = await t.evaluate((n) => { const r = n.getBoundingClientRect(); return n.offsetWidth ? r.width / n.offsetWidth : 1 })
    const p = zoomTarget.pad * k
    return { x: tb.x - p, y: tb.y - p, width: tb.width + p * 2, height: tb.height + p * 2 }
  }
  if (!zoom) return { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + pad * 2, height: bounds.height + pad * 2 }
  const root = await stageRoot()
  const box = (await root.boundingBox()) ?? bounds
  const designW = await root.evaluate((n) => n.offsetWidth || n.getBoundingClientRect().width)
  const s = box.width / designW
  return { x: box.x + zoom[0] * s, y: box.y + zoom[1] * s, width: zoom[2] * s, height: zoom[3] * s }
}

const clipped = new Map()
const cameraSkipped = []
const clipSamples = new Map()
const layoutDeferred = new Map()
const layoutSamples = new Map()
const sideSatellites = new Set()
const checkClipsForStage = async (label, root) => {
  const stageKey = await root.getAttribute('data-ss-verification-stage')
  const found = await root.evaluate((root) => window.__ssFilmChecks.checkStage(root))
  if (width < 600) {
    const small = await root.evaluate((root) => window.__ssFilmChecks.smallestText(root))
    if (small) found.push(`small text: ${small.el} renders at ${small.px.toFixed(1)}px on a phone; the floor is about 10px, so lay compact out at the column's width and set its type for it, not shrunk from the wide design`)
  }
  found.push(...await root.evaluate((root) => window.__ssFilmChecks.detectSpills(root)))
  const layout = await root.evaluate(auditLayout)
  layoutSamples.set(stageKey, layout.checked)
  found.push(...layout.findings.map((finding) => finding.message))
  if (layout.deferred.length) layoutDeferred.set(stageKey, layout.deferred)
  else layoutDeferred.delete(stageKey)
  if (found.includes('SAT_SIDE')) sideSatellites.add(stageKey)
  if (found.includes('CAMERA_MOVING')) cameraSkipped.push({ stageKey, label })
  else clipSamples.set(stageKey, (clipSamples.get(stageKey) || 0) + 1)
  for (const message of found) if (message !== 'SAT_SIDE' && message !== 'CAMERA_MOVING') {
    const key = `${stageKey}: ${message}`
    const entry = clipped.get(key) || { stageKey, message, at: [] }
    entry.at.push(label)
    clipped.set(key, entry)
  }
}
const checkClips = async (label) => {
  for (const root of await stageRoots()) await checkClipsForStage(label, root)
}
const clipFindings = (stageKey, minFrames) => [...clipped.values()]
  .filter((entry) => entry.stageKey === stageKey)
  .filter(({ message: f }) => !(sideSatellites.has(stageKey) && (f.startsWith('framing: corner bleed') || f.includes('runs off the bottom but sits off center'))))
  .filter(({ message: f, at }) => at.length >= minFrames || /^(translucent|covers|framing|small text)/.test(f))
  .map(({ message: f, at }) => `${/^(layout|uneven|translucent|lopsided|near-tangent|covers|unclipped|double corner|tight lines|tight stack|loose stack|tight mark|tight inset|skeleton ladder|onion skin|kit override|unit wrapped|clipped glyph|loose list|empty pane|fat row|emoji icon|anchor drift|uneven padding|mixed icons|tight control|invented mark|uneven inset|uneven gutters|avatar alignment|spills its slot|half-pixel|squeezed|cut by the crop|framing|touching|dark slab|small text)/.test(f) ? '' : 'clipped: '}${f} (${at.length > 3 ? `${at.length} frames from ${at[0]}` : at.join(', ')})`)

const finishReport = (snapshot, requestedMs = 0) => {
  const errors = [...notes, ...(snapshot?.errors || [])]
  if (!snapshot) errors.push('recording was unavailable')
  const stages = Object.entries(snapshot?.stages || {}).map(([key, stage]) => {
    const sample = still ? { status: 'complete', frames: 1, durationMs: 0, maxGapMs: 0, reasons: [] } : coverage(stage.frames, { requestedMs, slow })
    if (!still && !stage.motion) { sample.status = 'inconclusive'; sample.reasons.push('motion watcher produced no samples') }
    sample.framingSamples = clipSamples.get(key) || 0
    sample.layout = layoutSamples.get(key) || { controls: 0, paddedContainers: 0 }
    if (!sample.framingSamples) { sample.status = 'inconclusive'; sample.reasons.push('no framing sample was judged for this stage') }
    const manual = still ? [] : contentChanges(stage.frames, slow)
    if (layoutDeferred.has(key)) {
      sample.status = 'inconclusive'
      sample.reasons.push('some layout geometry was still moving at the final shot')
      manual.push(`Layout checks remain deferred: ${layoutDeferred.get(key).join('; ')}. Capture a settled state.`)
    }
    if (stage.frames.some((frame) => frame.cameraMoving)) manual.push('Camera contents were omitted from geometry checks while moving; inspect the full push-in and return.')
    const cameraShots = cameraSkipped.filter((frame) => frame.stageKey === key).length
    if (cameraShots) manual.push(`Framing checks omitted ${cameraShots} shot(s) while the camera moved.`)
    return { key, label: stage.label, coverage: sample, findings: [...scaleNotes.filter((note) => note.key === key).map((note) => note.message), ...clipFindings(key, still ? 1 : 2), ...(!still ? [...analyse(stage.frames, slow), ...motionFindings(stage.motion, slow)] : [])], manual }
  })
  const result = reportResult({ stages, errors, strict: has('strict'), still })
  for (const stage of stages) {
    printCoverage(stage.key, stage.coverage)
    for (const line of stage.findings) console.log(`[${stage.key}] ${line}`)
    for (const line of stage.manual) console.log(`[${stage.key}] manual: ${line}`)
  }
  for (const error of errors) console.error(`incomplete: ${error}`)
  console.log(`film: ${result.status}; ${still ? 'still capture only, motion was not judged' : 'watch the motion and inspect every image before approval'}`)
  if (has('gate')) {
    const NEVER = /^(clipped: )?(framing|cut by the crop|tight stack|loose stack|tight mark|tight inset|skeleton ladder|onion skin|kit override|unit wrapped|clipped glyph|loose list|empty pane|fat row|emoji icon|anchor drift|uneven padding|mixed icons|tight control|invented mark|uneven inset|uneven gutters|avatar alignment|spills its slot):/
    const bad = [...stages.flatMap((stage) => stage.findings.filter((line) => NEVER.test(line))), ...notes.filter((line) => /\[stageshow\] selection drift:/.test(line))]
    if (bad.length) { console.log(`rehearsal failed: ${bad.length} never-intentional line(s) above`); process.exitCode = 1 }
    else console.log('rehearsal passed (necessary, not sufficient: references/verify.md and the fresh eye in review.md still stand)')
  }
  if (reportPath) {
    const path = resolve(reportPath)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(result, null, 2) + '\n')
  }
  process.exitCode = result.exitCode
}

const shots = []
const shoot = async (label) => {
  await overlaid()
  if (zoomTarget) clip = await clipFor()
  await checkClips(label)
  const buf = await page.screenshot({ clip })
  shots.push({ label, src: `data:image/png;base64,${buf.toString('base64')}`, w: clip.width, h: clip.height })
}
const secs = (ms) => `${(ms / 1000).toFixed(2)}s`

const series = async (ms, prefix) => {
  const n = Math.max(1, Math.floor(ms / every) + 1)
  const start = Date.now()
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(Math.max(0, start + i * every * slow - Date.now()))
    await shoot(`${prefix}${secs((Date.now() - start) / slow)}`)
  }
}

let clip
const captureStarted = await page.evaluate(() => performance.now())
if (hover) {
  await page.mouse.move(1, 1)
  await page.waitForTimeout(150 + delay)
  clip = await clipFor()
  await shoot('rest')
  for (const root of await stageRoots()) {
    const key = await root.getAttribute('data-ss-verification-stage')
    const box = await root.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 })
    await waitForMark()
    await series(hoverFor, `${key} hover `)
    await page.mouse.move(1, 1, { steps: 8 })
    await series(leaveFor, `${key} left `)
  }
} else {
  await waitForMark()
  await page.waitForTimeout(delay)
  clip = await clipFor()
  if (still) {
    await overlaid()
    await page.waitForFunction(() => !document.querySelector('[data-film-target] .ss-count[data-rolling], [data-film-target].ss-stage .ss-count[data-rolling]'), null, { timeout: 4000 * slow, polling: 16 }).catch(() => notes.push('incomplete: number roll did not settle before the still'))
    mkdirSync(dirname(out), { recursive: true })
    await page.screenshot({ path: out, clip })
    await checkClips('still')
    const snapshot = await page.evaluate(() => { window.__ssVerification.stopped = true; return window.__ssVerification }).catch(() => null)
    await browser.close()
    console.log(`still${zoom || zoomTarget ? ` (zoom ${dsf}x)` : ''} -> ${out}`)
    finishReport(snapshot)
    process.exit(process.exitCode)
  }
  await page.evaluate(() => (window.__filmStart = performance.now()))
  if (has('states')) {
    const roots = await stageRoots()
    const root = (await roots[0].$('.ss-stage')) ?? roots[0]
    const start = Date.now()
    let last = await root.getAttribute('data-mark')
    await shoot('open')
    const pending = []
    while (Date.now() - start < statesFor * slow) {
      await page.waitForTimeout(40)
      const mark = await root.getAttribute('data-mark')
      if (mark && mark !== last) { last = mark; await shoot(`${mark}`); pending.push({ mark, at: Date.now() + 700 * slow }) }
      while (pending.length && pending[0].at <= Date.now()) { const p = pending.shift(); await shoot(`${p.mark} +0.7s`) }
    }
    await shoot(`end ${secs((Date.now() - start) / slow)}`)
  } else {
    const start = Date.now()
    for (let i = 0; i < count; i++) {
      await page.waitForTimeout(Math.max(0, start + i * every * slow - Date.now()))
      await shoot(`${(Math.max(0, Date.now() - start) / slow / 1000).toFixed(slow > 1 ? 2 : 1)}s`)
    }
  }
}

const stopped = await page.evaluate(() => {
  window.__ssVerification.stopped = true
  return { at: performance.now(), snapshot: window.__ssVerification }
}).catch(() => null)
const snapshot = stopped?.snapshot
const captureMs = stopped ? stopped.at - captureStarted : 0

if (zoomTarget) clip = shots.reduce((a, s) => (s.w > a.width ? { width: s.w, height: s.h } : a), { width: 0, height: 0 })
const frameW = Math.round((clip.width * dsf) / 2)
const gap = 12
const frameH = Math.round((clip.height * dsf) / 2)
const fit = Math.floor(1800 / (frameW + gap))
const even = Math.round(Math.sqrt((shots.length * 2 * (frameH + gap)) / (frameW + gap)))
const cols = colsOpt ? Number(colsOpt) : Math.max(1, Math.min(shots.length, fit >= 3 ? fit : Math.max(fit, even)))
const sheetHeight = Math.ceil(shots.length / cols) * (frameH + gap) + gap
const sheet = await browser.newPage({ viewport: { width: cols * (frameW + gap) + gap, height: Math.min(400, sheetHeight) }, deviceScaleFactor: 2 })
await sheet.setContent(`<body style="margin:0;background:#e9e9e9;font:11px system-ui">
  <div style="display:grid;grid-template-columns:repeat(${cols},${frameW}px);gap:${gap}px;padding:${gap}px">
  ${shots
    .map(
      (s) => `<figure style="margin:0;position:relative">
        <img src="${s.src}" style="width:${frameW}px;display:block;background:#fff">
        <figcaption style="position:absolute;left:4px;top:4px;padding:1px 4px;background:#000c;color:#fff;border-radius:3px">${s.label}</figcaption>
      </figure>`,
    )
    .join('')}
  </div></body>`)
await sheet.waitForLoadState('load')
mkdirSync(dirname(out), { recursive: true })
await sheet.screenshot({ path: out, fullPage: true })
await browser.close()

const what = hover ? `${shots.length} frames (rest, hover ${hoverFor}ms, leave ${leaveFor}ms) every ${every}ms` : `${shots.length} frames every ${every}ms`
console.log(`${what}${zoom || zoomTarget ? `, zoom ${dsf}x` : ''} -> ${out}`)
finishReport(snapshot, captureMs)
