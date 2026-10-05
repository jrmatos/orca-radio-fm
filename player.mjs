// Shared player control for the worker and the button daemon.
//
// Spawns the first available local player (mpv, ffplay, cvlc), detached and
// tagged with PLAYER_TAG so any process can find and stop it later.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLAYER_TAG = 'orca-radio-fm-player'
const ROOT = dirname(fileURLToPath(import.meta.url))

const STATIONS_DIR = join(ROOT, 'stations')

/**
 * Reads every stations/<country>.json file and returns one flat list.
 * Each station inherits `country` / `countryName` from its file, and `group`
 * defaults to "Radio". Validation lives in validateStations().
 */
export function loadStations() {
  const files = readdirSync(STATIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
  const stations = []
  for (const file of files) {
    const data = JSON.parse(readFileSync(join(STATIONS_DIR, file), 'utf8'))
    for (const station of data.stations ?? []) {
      stations.push({
        group: 'Radio',
        ...station,
        country: data.country,
        countryName: data.countryName,
        file
      })
    }
  }
  return stations
}

// Must match stationLabel() in panel/template.html: the panel announces
// stations by this label and the daemon maps it back to a stream.
export function stationLabel(station) {
  return station.city && !station.name.includes(station.city)
    ? `${station.name} — ${station.city}`
    : station.name
}

/** Returns a list of human-readable problems (empty when valid). */
export function validateStations(stations) {
  const problems = []
  const ids = new Map()
  const labels = new Map()
  for (const s of stations) {
    const where = `${s.file} → ${s.id ?? s.name ?? '?'}`
    if (typeof s.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.id)) {
      problems.push(`${where}: "id" must be kebab-case (a-z, 0-9, dashes)`)
    }
    if (typeof s.name !== 'string' || !s.name.trim()) problems.push(`${where}: "name" is required`)
    if (typeof s.url !== 'string' || !/^https?:\/\/\S+$/.test(s.url)) {
      problems.push(`${where}: "url" must be an http(s) stream URL`)
    }
    if (ids.has(s.id)) problems.push(`${where}: duplicate id (also in ${ids.get(s.id)})`)
    ids.set(s.id, s.file)
    const label = stationLabel(s)
    if (labels.has(label)) problems.push(`${where}: duplicate name+city "${label}" (also in ${labels.get(label)})`)
    labels.set(label, s.file)
  }
  if (!stations.length) problems.push('no stations found in stations/*.json')
  return problems
}

function which(bin) {
  for (const dir of (process.env.PATH || '/usr/bin:/usr/local/bin').split(delimiter)) {
    const full = join(dir, bin)
    if (existsSync(full)) return full
  }
  return null
}

// Orca forks workers with a scrubbed env (PATH/HOME/LANG only). Audio servers
// (PipeWire/PulseAudio) are discovered through XDG_RUNTIME_DIR, so restore it.
function playerEnv() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  if (!env.XDG_RUNTIME_DIR && typeof process.getuid === 'function') {
    const runtimeDir = `/run/user/${process.getuid()}`
    if (existsSync(runtimeDir)) env.XDG_RUNTIME_DIR = runtimeDir
  }
  return env
}

const PLAYERS = [
  { bin: 'mpv', args: (url) => ['--no-video', '--really-quiet', `--title=${PLAYER_TAG}`, url] },
  {
    bin: 'ffplay',
    args: (url) => ['-nodisp', '-loglevel', 'quiet', '-window_title', PLAYER_TAG, url]
  },
  {
    bin: 'cvlc',
    args: (url) => ['--intf', 'dummy', '--quiet', '--no-video', '--meta-title', PLAYER_TAG, url]
  }
]

export function isPlaying() {
  if (process.platform === 'win32') return false
  return spawnSync('pgrep', ['-f', PLAYER_TAG], { stdio: 'ignore' }).status === 0
}

export function stopPlayer() {
  if (process.platform !== 'win32') spawnSync('pkill', ['-f', PLAYER_TAG], { stdio: 'ignore' })
}

/** Starts `url`, replacing whatever was playing. Returns the player used, or null. */
export function startPlayer(url, onError = () => {}) {
  let player = null
  for (const candidate of PLAYERS) {
    const path = which(candidate.bin)
    if (path) {
      player = { ...candidate, path }
      break
    }
  }
  if (!player) return null
  stopPlayer()
  const child = spawn(player.path, player.args(url), {
    env: playerEnv(),
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', onError)
  child.unref()
  return player.bin
}
