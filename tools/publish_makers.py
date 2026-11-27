#!/usr/bin/env python3
"""Pack Elslicer's makers as .elmaker plugins.

  publish_makers.py --bundle            write resources/makers/<id>.elmaker, the copies shipped inside the app
  publish_makers.py --site DIR          write DIR/pkg/<id>-<version>.elmaker and DIR/catalog.json for ai.itzkin.com/makers
  publish_makers.py --one M.json --out DIR   pack one maker described in M.json (not in makers.json) as DIR/<id>-<version>.elmaker,
                                        to install by hand from Make > Get More Makers > Install from a file

Each maker is listed in tools/makers.json, or, when it is only on the site, in tools/extra_makers/<id>.json. Its page comes from resources/web/elslicer and becomes index.html; the
local files the page loads (style.css, lampkit.js, ...) go in beside it, so each package stands alone. A page that
loads anything from outside (http, https, //) is refused.
"""
import argparse, datetime, hashlib, io, json, pathlib, re, sys, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / 'resources' / 'web' / 'elslicer'
LIST = ROOT / 'tools' / 'makers.json'
API = 1
REF = re.compile(r'''(?:src|href)\s*=\s*["']([^"'#?]+)''', re.I)
FIXED = datetime.datetime(2026, 1, 1).timetuple()[:6]  # the same bytes for the same files, so the sha256 only changes with them


def package(m):
    page = (WEB / m['page']).read_text(encoding='utf-8')
    files, todo = {'index.html': page.encode('utf-8')}, [page]
    while todo:
        for ref in REF.findall(todo.pop()):
            if re.match(r'^([a-z]+:|//)', ref, re.I):
                if ref.startswith(('data:', 'mailto:', 'javascript:')):
                    continue
                sys.exit(f"{m['id']}: loads {ref} from outside; makers must carry everything they use")
            path = (WEB / ref).resolve()
            if WEB not in path.parents or ref in files:
                continue
            if not path.is_file():
                continue
            files[ref] = path.read_bytes()
            if path.suffix in ('.html', '.css'):
                todo.append(files[ref].decode('utf-8'))
    manifest = {k: m[k] for k in ('id', 'name', 'description', 'version')}
    manifest.update(author=m.get('author', 'Elslicer'), api=API, entry='index.html', permissions=m.get('permissions', []))
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, data in [('maker.json', json.dumps(manifest, indent=1).encode())] + sorted(files.items()):
            info = zipfile.ZipInfo(name, FIXED)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data)
    return manifest, out.getvalue()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bundle', action='store_true')
    ap.add_argument('--site')
    ap.add_argument('--one')
    ap.add_argument('--out', default='.')
    a = ap.parse_args()
    if a.one:
        manifest, data = package(json.loads(pathlib.Path(a.one).read_text()))
        path = pathlib.Path(a.out) / f"{manifest['id']}-{manifest['version']}.elmaker"
        path.write_bytes(data)
        print(f'{path} ({len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()[:12]})')
        return
    if not a.bundle and not a.site:
        ap.error('give --bundle, --site DIR or --one M.json')
    makers = json.loads(LIST.read_text())
    built = [package(m) for m in makers]
    # Makers that don't ship with the app are only on the site, listed first: they are the newest.
    extras = [json.loads(p.read_text()) for p in sorted((ROOT / 'tools' / 'extra_makers').glob('*.json'))]
    if a.bundle:
        out = ROOT / 'resources' / 'makers'
        out.mkdir(exist_ok=True)
        for old in out.glob('*.elmaker'):
            old.unlink()
        for manifest, data in built:
            (out / f"{manifest['id']}.elmaker").write_bytes(data)
        print(f'{len(built)} makers in {out}')
    if a.site:
        site = pathlib.Path(a.site)
        (site / 'pkg').mkdir(parents=True, exist_ok=True)
        entries = []
        for manifest, data in [package(m) for m in extras] + built:
            name = f"{manifest['id']}-{manifest['version']}.elmaker"
            (site / 'pkg' / name).write_bytes(data)
            entries.append({**{k: manifest[k] for k in ('id', 'name', 'description', 'version', 'author', 'permissions')},
                            'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data), 'url': 'pkg/' + name,
                            'icon': None, 'min_api': API})
        catalog = {'api': API, 'updated': datetime.date.today().isoformat(), 'makers': entries}
        (site / 'catalog.json').write_text(json.dumps(catalog, indent=1))
        print(f'{len(entries)} makers and catalog.json in {site}')


if __name__ == '__main__':
    main()
