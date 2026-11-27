# Maker plugins

A maker is a web page that designs a model from a few choices and adds it to the plate (Box Maker, Phone Case,
Lampshade, …). Makers are plugins, so they install and update without a new Elslicer.

## Package

A `.elmaker` file is a zip holding `maker.json` and the page with everything it loads:

```json
{"id": "phone-case", "name": "Phone Case", "description": "…", "version": "1.1.0", "author": "Elslicer",
 "api": 1, "entry": "index.html", "permissions": ["ai"]}
```

- `id`: 2–48 lowercase letters, digits or dashes; it names the install folder.
- `api`: the plugin API the page needs; Elslicer refuses a maker asking for more than `Makers::API`.
- A package holds at most 400 files and 20 MB, and nothing in it may unpack outside its folder
  (`extract_archive_confined`). Makers must not load anything from the internet: `tools/publish_makers.py` refuses
  pages that do.

## Where makers live

- Installed into `data_dir()/makers/<id>/`, with a `.source` file: `bundled`, `catalog` or `local`.
- An install unpacks into `.<id>.new` and swaps it in, so a failed install never leaves a broken maker.
- The makers shipped with the app are `resources/makers/*.elmaker`, packed from `resources/web/elslicer/<page>.html`
  and the shared files it loads (`style.css`, `lampkit.js`, …) by `tools/publish_makers.py --bundle`, listed in
  `tools/makers.json`. On the first call to `Makers::installed()` in a run, each bundled maker is installed if it is
  missing, or if it is newer than the installed copy and that copy didn't come from a file. One the user removed
  (`removed.json`) is not installed again.
- A maker that doesn't ship with the app is described by its own JSON in `tools/extra_makers/` and packed with
  `tools/publish_makers.py --one <json> --out DIR`, to install from a file or publish later.
- A maker's saved values are `data_dir()/makers/<id>.data.json`, at most 1 MB.

## The page's calls (API 1)

The page posts JSON to `window.wx.postMessage` and receives messages through `window.fromApp`.
`resources/web/elslicer/maker_sdk.js` wraps them for new makers.

| Page sends | Elslicer answers |
|---|---|
| `ready` | `{type: "printer", bed, height, layer, api}`, `{type: "maker", id, version, api}`, `{type: "store", data}` |
| `pick_image` | `{type: "image", name, data}` (a JPEG data URL, at most 2000 px), or an error |
| `add` `{objects: [{name, parts: [{name, extruder?, sheets: [{nu, nv, wrap, pos}]}]}]}` | adds the objects and closes; `pos` is base64 float32, front then back grid |
| `close` | closes |
| `store_set` `{key, value}` | keeps it (`null` forgets it) |
| `ai` `{id, system, prompt, schema, name?, description?, max_tokens?}` | `{type: "ai", id, answer, provider}` or `{…, error}` |

`ai` needs `"ai"` in `permissions`. It asks the AI service chosen in AI Setup, through `AI::chat`, with the schema
as the input schema of one tool, and returns the tool call's input. A maker that didn't ship with Elslicer asks the
user once before its first question, because the questions are billed to the user's AI service.

## Last state, Undo and Defaults

`resources/web/elslicer/maker_state.js`, loaded after a page's own script, gives a maker that keeps its settings in
a global `p` and redraws with `update()` three things: it saves the settings (`store_set` key `last`) a moment
after each change and restores them from the `store` message when the maker opens; Undo steps back through the
last ten changes; Defaults puts back the page's starting settings. It keeps `p` and the values of the page's
inputs. A page with settings outside `p` declares `MAKER_STATE_EXTRA = {get, set}`.

A page built from a picture sets `MAKER_STATE_PICTURE = true` before loading it, so the last picture is kept too:
downscaled to at most 1200 px and under 600 kB (the store holds 1 MB), as `store_set` key `picture`. When the maker
opens it is handed back as an `image` message with `kept: true`, and `restored: true` when the settings came back
too, so the page doesn't reset settings it would set for a newly picked picture. The page calls
`makerPictureGone()` when the user removes the picture.

## Catalogue and updates

- `https://ai.itzkin.com/makers/catalog.json` lists the published makers, each with `version`, `sha256`, `size`,
  `url` (relative to `/makers/`) and `min_api`. `tools/publish_makers.py --site DIR` writes it and the packages.
- Make > Get More Makers (`makers.html`, `MakersDialog`) shows the installed makers, updates and the catalogue,
  and installs a package from a file, or a single page as a one-page maker.
- Downloads are checked against the catalogue's sha256 before they are installed.
- Once a day, when the Make menu is first built, the catalogue is fetched in the background. The menu then shows
  how many updates there are. Nothing updates without the user's click.
- A maker installed from a file is offered the catalogue's version too when it is newer; updating it makes it a
  catalogue maker.

## Menus

`append_make_menu()` fills the main Make menu and the plate's right-click Make submenu with the installed makers
and the two built-in makers that work on the selected object (Folding Box, Origami Animal), sorted by name.
`refresh_make_menus()` fills them again after an install or removal.
