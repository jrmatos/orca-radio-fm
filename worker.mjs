// Radio FM — background worker behind the palette commands and shortcuts.
//
// Orca reaps idle workers after ~5 minutes, so the player is spawned detached
// (see player.mjs) and outlives this process; deactivate leaves it running.

import {
  getVolume,
  isPlaying,
  loadStations,
  setVolume,
  startPlayer,
  stationLabel,
  stopPlayer
} from './player.mjs'

const STATIONS = loadStations()
const PT = /^pt/i.test(process.env.LANG || '')
const t = (en, pt) => (PT ? pt : en)

let host = null
let log = () => {}
let current = null // index into STATIONS

async function notify(title, body) {
  try {
    await host.call('notifications.show', { title, body })
  } catch (error) {
    log(`notification failed: ${error?.message ?? error}`)
  }
}

async function remember(index) {
  try {
    await host.call('storage.set', { key: 'lastStation', value: STATIONS[index].id })
  } catch {}
}

async function lastStationIndex() {
  try {
    const { value } = await host.call('storage.get', { key: 'lastStation' })
    const index = STATIONS.findIndex((s) => s.id === value)
    if (index >= 0) return index
  } catch {}
  return 0
}

async function play(index) {
  const station = STATIONS[index]
  const player = startPlayer(station.url, (error) => log(`player error: ${error.message}`))
  if (!player) {
    await notify(
      'Radio FM',
      t('No player found. Install mpv, ffplay (ffmpeg) or vlc.', 'Nenhum player encontrado. Instale mpv, ffplay (ffmpeg) ou vlc.')
    )
    return { ok: false, error: 'no player found' }
  }
  current = index
  log(`playing ${station.id} via ${player}`)
  await remember(index)
  await notify('Radio FM', `${t('Playing', 'Tocando')} ${stationLabel(station)}`)
  return { ok: true, station: station.id, player }
}

async function stop() {
  stopPlayer()
  current = null
  await notify('Radio FM', t('Radio stopped', 'Rádio parado'))
  return { ok: true }
}

async function changeVolume(delta) {
  const volume = Math.min(100, Math.max(0, getVolume() + delta))
  const applied = setVolume(volume)
  await notify(
    'Radio FM',
    applied ? `Volume ${volume}%` : t('Volume needs PipeWire (wpctl)', 'Volume requer PipeWire (wpctl)')
  )
  return { ok: applied, volume }
}

async function step(delta) {
  const base = current ?? (await lastStationIndex())
  return play((base + delta + STATIONS.length) % STATIONS.length)
}

export default async function activate(ctx) {
  host = ctx.host
  log = ctx.log
  for (const [index, station] of STATIONS.entries()) {
    ctx.commands.register(`play.${station.id}`, () => play(index))
  }
  ctx.commands.register('stop', stop)
  ctx.commands.register('toggle', async () =>
    isPlaying() ? stop() : play(await lastStationIndex())
  )
  ctx.commands.register('next', () => step(1))
  ctx.commands.register('previous', () => step(-1))
  ctx.commands.register('volume-up', () => changeVolume(10))
  ctx.commands.register('volume-down', () => changeVolume(-10))
  ctx.log(`Radio FM ready with ${STATIONS.length} stations`)
}

export function deactivate() {}
