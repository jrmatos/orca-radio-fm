// Generates orca-plugin.json and panel/index.html from stations/*.json.
// Run after editing stations:  npm run build
// `npm run build -- --check` fails instead of writing when outputs are stale (CI).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadStations, stationLabel, validateStations } from './player.mjs'

const ROOT = dirname(fileURLToPath(import.meta.url))
const CHECK = process.argv.includes('--check')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const stations = loadStations()

const problems = validateStations(stations)
if (problems.length) {
  console.error(`Invalid stations:\n  - ${problems.join('\n  - ')}`)
  process.exit(1)
}

const manifest = {
  manifestVersion: 1,
  id: 'radio-fm',
  publisher: 'jrmatos',
  name: 'Radio FM',
  version: pkg.version,
  description:
    'Radio panel for Orca: Jovem Pan FM in 23 Brazilian cities plus other stations, easy to extend with radios from any country. Plays through mpv, ffplay or vlc.',
  author: { name: 'Paulo Matos', url: 'https://github.com/jrmatos' },
  repository: 'https://github.com/jrmatos/orca-radio-fm',
  engines: { orca: '>=1.4.0' },
  pluginApi: 1,
  main: 'worker.mjs',
  contributes: {
    panels: [{ id: 'radio', title: 'Radio FM', icon: 'activity', entry: 'panel/index.html' }],
    commands: [
      { id: 'toggle', title: 'Radio: Play / Stop' },
      { id: 'stop', title: 'Radio: Stop' },
      { id: 'next', title: 'Radio: Next station' },
      { id: 'previous', title: 'Radio: Previous station' },
      { id: 'volume-up', title: 'Radio: Volume up' },
      { id: 'volume-down', title: 'Radio: Volume down' },
      ...stations.map((s) => ({ id: `play.${s.id}`, title: `Radio: ${stationLabel(s)}` }))
    ],
    keybindings: [
      { command: 'toggle', key: 'Mod+Alt+Shift+P' },
      { command: 'next', key: 'Mod+Alt+Shift+N' },
      { command: 'previous', key: 'Mod+Alt+Shift+B' }
    ]
  },
  capabilities: [{ kind: 'notifications:show' }, { kind: 'storage' }]
}

// Stream URLs stay out of the panel: only the daemon/worker need them.
const panelStations = stations.map(
  ({ id, name, city, state, frequency, group, country, countryName }) => ({
    id, name, city, state, frequency, group, country, countryName
  })
)
const template = readFileSync(join(ROOT, 'panel', 'template.html'), 'utf8')
// Escape "<" so a station field can never close the inline <script>.
const json = JSON.stringify(panelStations).replace(/</g, '\\u003c')

const outputs = [
  ['orca-plugin.json', `${JSON.stringify(manifest, null, 2)}\n`],
  ['panel/index.html', template.replace('/*__STATIONS__*/ []', json)]
]

let stale = false
for (const [path, content] of outputs) {
  const full = join(ROOT, path)
  let current = null
  try {
    current = readFileSync(full, 'utf8')
  } catch {}
  if (current === content) continue
  if (CHECK) {
    console.error(`${path} is out of date — run "npm run build" and commit the result.`)
    stale = true
  } else {
    writeFileSync(full, content)
  }
}
if (stale) process.exit(1)

const countries = new Set(stations.map((s) => s.country))
console.log(
  `${CHECK ? 'checked' : 'built'} ${stations.length} stations from ${countries.size} countr${countries.size === 1 ? 'y' : 'ies'}`
)
