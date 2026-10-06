# Contributing

Thanks for helping! New stations, especially from new countries, are the most useful
contribution.

## Add a station

1. **Find a stream URL.**
   - The best source is the station's own website player. Open the browser devtools
     **Network** tab, press play, and copy the audio request
     (`audio/mpeg`, `audio/aac`, or an `.m3u8` playlist).
   - Or search the Radio Browser directory:

     ```sh
     npm run find -- "station name" --country BR
     ```

2. **Add it to `stations/<country>.json`.** Use the lowercase
   [ISO 3166-1 alpha-2](https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2) code (`br.json`,
   `us.json`, `pt.json`, …). For a new country, create the file:

   ```json
   {
     "country": "PT",
     "countryName": "Portugal",
     "stations": []
   }
   ```

   Each station:

   | Field | Required | Notes |
   | --- | --- | --- |
   | `id` | yes | kebab-case, unique across all files, e.g. `radio-comercial-lisboa` |
   | `name` | yes | as listeners know it, without the frequency (`Radio Comercial`) |
   | `url` | yes | direct stream URL. Prefer `https`. |
   | `city` | no | needed when the same name exists in several cities |
   | `state` | no | state or region abbreviation |
   | `frequency` | no | `"97.4"` |
   | `group` | no | section heading in the panel, e.g. `Music`, `News`. Defaults to `Radio`. |

   Name + city must be unique, because the panel identifies the station by that label.
   If every station in a group has the same `name` (a network such as Jovem Pan FM), the
   panel lists them by city.

3. **Build and check:**

   ```sh
   npm run build          # validates stations/, regenerates orca-plugin.json + panel/index.html
   npm run check -- pt    # decodes 3s of each stream in stations/pt.json (uses ffmpeg if installed)
   ```

4. **Commit** the station file **and** the regenerated `orca-plugin.json` and `panel/index.html`.
   Orca installs plugins straight from git without building, so generated files must be
   committed. CI fails if they are out of date.

## Stream URL tips

- **Avoid URLs with tokens or session ids** (`?token=…`, `?sid=…`). They expire within hours.
- **For redirectors** (StreamTheWorld `livestream-redirect`, Zeno `stream.zeno.fm/<id>`), keep the
  redirector URL, not where it redirects to. The final node changes.
- **HLS (`.m3u8`)** works with mpv and ffplay.
- If a stream only plays from inside your country (geo-blocking), say so in the PR.

## Changing the code

- `player.mjs`: loading and validating stations, starting and stopping the player, and the
  per-stream volume (PipeWire, stream named `Orca Radio`).
- `worker.mjs`: the Orca plugin worker behind the palette commands and shortcuts.
- `daemon/radio-daemon.mjs`: the D-Bus listener behind the panel buttons.
- `panel/template.html`: the panel. Edit this file, never `panel/index.html`. It runs under a
  strict CSP: inline CSS and JS only, and no network.
- `build.mjs`: generates the manifest and the panel.

Keep `stationLabel()` in `player.mjs` and `panel/template.html` identical. The daemon maps the
panel's label back to a stream.

To test locally, add your clone as an Orca development plugin (see the README). Re-approve the
plugin after each change, and watch the daemon with `journalctl --user -u orca-radio-fm -f`.
