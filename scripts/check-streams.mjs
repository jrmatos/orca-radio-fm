// Verifies that every station stream actually delivers decodable audio.
//
//   npm run check            # all stations
//   npm run check -- br      # only stations/br.json
//
// Uses ffmpeg to decode 3 seconds of each stream (most reliable); falls back to
// an HTTP probe that checks for an audio content type when ffmpeg is missing.
import { spawn, spawnSync } from 'node:child_process'
import { loadStations } from '../player.mjs'

const only = process.argv[2]?.toLowerCase()
const stations = loadStations().filter((s) => !only || s.file === `${only}.json`)
const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0
const CONCURRENCY = 8

function viaFfmpeg(url) {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-nostdin', '-loglevel', 'error', '-t', '3', '-i', url, '-f', 'null', '-'], {
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let err = ''
    child.stderr.on('data', (d) => (err += d))
    const timer = setTimeout(() => child.kill('SIGKILL'), 20000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve(code === 0 ? null : err.trim().split('\n').pop() || `ffmpeg exited ${code}`)
    })
  })
}

async function viaHttp(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
    const type = res.headers.get('content-type') || ''
    controller.abort()
    if (!res.ok) return `HTTP ${res.status}`
    return /audio|mpegurl|ogg|octet-stream/i.test(type) ? null : `unexpected content-type "${type}"`
  } catch (error) {
    return error.name === 'AbortError' ? 'timeout' : error.message
  } finally {
    clearTimeout(timer)
  }
}

const check = hasFfmpeg ? viaFfmpeg : viaHttp
if (!hasFfmpeg) console.log('ffmpeg not found — using a weaker HTTP probe.\n')

const failures = []
let next = 0
async function runner() {
  while (next < stations.length) {
    const s = stations[next++]
    const error = await check(s.url)
    console.log(`${error ? 'FAIL' : 'ok  '}  ${s.file.padEnd(8)} ${s.id}${error ? `  — ${error}` : ''}`)
    if (error) failures.push(s.id)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, runner))

console.log(`\n${stations.length - failures.length}/${stations.length} streams OK`)
process.exit(failures.length ? 1 : 0)
