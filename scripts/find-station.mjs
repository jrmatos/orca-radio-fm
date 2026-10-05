// Search the community Radio Browser directory (https://www.radio-browser.info)
// and print ready-to-paste station entries for stations/<country>.json.
//
//   npm run find -- "bbc radio 1"
//   npm run find -- "rock" --country US --limit 5
//
// Always run `npm run check` afterwards: directory entries are user-submitted
// and can be stale, mislabeled or tokenized.

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return fallback
  const value = args[i + 1]
  args.splice(i, 2)
  return value
}
const country = flag('country', '')
const limit = Number(flag('limit', '10'))
const query = args.join(' ').trim()

if (!query) {
  console.error('usage: npm run find -- "<station name>" [--country BR] [--limit 10]')
  process.exit(1)
}

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const params = new URLSearchParams({
  name: query,
  hidebroken: 'true',
  order: 'votes',
  reverse: 'true',
  limit: String(limit)
})
if (country) params.set('countrycode', country.toUpperCase())

const res = await fetch(`https://de1.api.radio-browser.info/json/stations/search?${params}`, {
  headers: { 'User-Agent': 'orca-radio-fm/1.0 (+https://github.com/jrmatos/orca-radio-fm)' }
})
if (!res.ok) {
  console.error(`Radio Browser request failed: HTTP ${res.status}`)
  process.exit(1)
}
const results = await res.json()
if (!results.length) {
  console.error('No stations found. Try a shorter name or drop --country.')
  process.exit(1)
}

for (const r of results) {
  const name = r.name.trim()
  const city = (r.state || '').trim() || undefined
  const entry = {
    id: slug(`${name} ${city ?? ''}`),
    name,
    ...(city ? { city } : {}),
    group: 'Radio',
    url: r.url_resolved || r.url
  }
  console.log(
    `// ${r.countrycode || '??'} · ${r.codec || '?'} ${r.bitrate ? `${r.bitrate}kbps` : ''} · votes ${r.votes} · ${r.homepage || 'no homepage'}`
  )
  console.log(`${JSON.stringify(entry, null, 2)},\n`)
}
