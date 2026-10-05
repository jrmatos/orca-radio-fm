// Radio FM button daemon (Linux, runs as a systemd user service).
//
// Orca plugin panels cannot play audio or reach the plugin worker; the only
// thing they can do with an effect outside Orca is show a notification, which
// Electron delivers as an org.freedesktop.Notifications.Notify D-Bus call with
// the summary "<publisher>.<plugin>: <title>". This daemon watches those calls
// and turns the panel's button notifications into player actions:
//
//   "<publisher>.<id>: ▶ <station label>"  → play that station
//   "<publisher>.<id>: ⏹ …"                → stop
//
// Anything else (including the worker's own "Radio FM" notifications) is ignored.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { loadStations, startPlayer, stationLabel, stopPlayer } from '../player.mjs'

const manifest = JSON.parse(readFileSync(new URL('../orca-plugin.json', import.meta.url), 'utf8'))
// Orca prefixes plugin notification titles with the qualified plugin key.
const PREFIX = `${manifest.publisher}.${manifest.id}: `
const PLAY = '▶ '
const STOP = '⏹'
// GNOME relays each Notify through the shell, so the monitor sees it twice.
const DEDUPE_MS = 1500

let lastSummary = null
let lastAt = 0

function handle(summary) {
  if (!summary.startsWith(PREFIX)) return
  const now = Date.now()
  if (summary === lastSummary && now - lastAt < DEDUPE_MS) return
  lastSummary = summary
  lastAt = now

  const title = summary.slice(PREFIX.length)
  if (title.startsWith(STOP)) {
    stopPlayer()
    console.log('stop')
    return
  }
  if (!title.startsWith(PLAY)) return
  const label = title.slice(PLAY.length)
  // Re-read so edits to stations/*.json apply without restarting the daemon.
  const station = loadStations().find((s) => stationLabel(s) === label)
  if (!station) {
    console.log(`unknown station label: ${label}`)
    return
  }
  const player = startPlayer(station.url, (error) => console.log(`player error: ${error.message}`))
  console.log(player ? `play ${station.id} via ${player}` : 'no player found (install mpv/ffplay/vlc)')
}

function unescapeDbusString(raw) {
  return raw.replace(/\\(.)/g, '$1')
}

function watch() {
  const monitor = spawn(
    'dbus-monitor',
    ['--session', "type='method_call',interface='org.freedesktop.Notifications',member='Notify'"],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  let buffer = ''
  let strings = null // string args of the Notify call being read
  monitor.stdout.setEncoding('utf8')
  monitor.stdout.on('data', (chunk) => {
    buffer += chunk
    let newline
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      if (line.startsWith('method call ') && line.includes('member=Notify')) {
        strings = []
        continue
      }
      if (!strings) continue
      // Notify(app_name, replaces_id, app_icon, summary, body, ...): summary is the 3rd string.
      const match = /^\s+string "(.*)"$/.exec(line)
      if (match) {
        strings.push(unescapeDbusString(match[1]))
        if (strings.length === 3) {
          handle(strings[2])
          strings = null
        }
      }
    }
  })
  monitor.on('exit', (code) => {
    console.log(`dbus-monitor exited (${code}); restarting in 2s`)
    setTimeout(watch, 2000)
  })
}

console.log(`Radio FM daemon listening for "${PREFIX}" panel buttons`)
watch()
