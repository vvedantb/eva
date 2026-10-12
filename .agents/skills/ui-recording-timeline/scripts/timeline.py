# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "scipy", "opencv-python-headless", "pillow"]
# ///
"""UI recording timeline: turn a screen recording of a UI loading into an
interactive paint timeline page (video + paint ticks + flashing change regions).

Run with uv (installs deps automatically):
    uv run timeline.py <command> <workdir> [options]

Commands (in workflow order):
    extract <video> <workdir>   probe video, copy it into workdir, write meta.json
    candidates <workdir>        diff every frame vs the previous one -> candidates.json + table
    sheet <workdir> --frames 3,4,13 [--crop x0,y0,x1,y1] [--name s1]
                                labelled contact sheet(s) for visual review -> sheets/*.jpg
    regions <workdir>           move-aware change regions for paints.json -> regions.json
    check <workdir>             draw regions on each paint frame -> sheets/check-*.jpg
    build <workdir>             paint thumbnails + index.html from paints.json/regions.json
    preview <workdir> [--t 1.2] headless Chrome screenshot of the page -> preview.png

The agent authors <workdir>/paints.json between `candidates`/`sheet` and `regions`
(see SKILL.md for the schema).
"""
import argparse, json, os, shutil, subprocess, sys
from pathlib import Path

import numpy as np

SKILL_DIR = Path(__file__).resolve().parent.parent
TEMPLATE = SKILL_DIR / "assets" / "template.html"


# ---------------------------------------------------------------- video helpers

def sh(cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, **kw)

def load_meta(wd):
    return json.loads((wd / "meta.json").read_text())

def scaled_size(meta, width):
    width = min(width, meta["width"])
    h = int(round(meta["height"] * width / meta["width"])); h += h % 2   # same as ffmpeg scale=w:-2
    return width - width % 2, h

def stream_frames(video, w, h, pix="gray"):
    """Yield every decoded frame (native timestamps, no fps resampling)."""
    ch = 1 if pix == "gray" else 3
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(video), "-fps_mode", "passthrough",
                          "-vf", f"scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", pix, "-"],
                         stdout=subprocess.PIPE)
    size = w * h * ch
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size: break
        a = np.frombuffer(buf, np.uint8)
        yield a.reshape(h, w) if ch == 1 else a.reshape(h, w, 3)
    p.wait()

def grab(video, frames, w, h, pix="gray"):
    """Decode only the given frame indices -> {index: array}."""
    want = sorted(set(int(f) for f in frames))
    out, ch = {}, (1 if pix == "gray" else 3)
    for k in range(0, len(want), 40):  # keep the select expression short
        chunk = want[k:k + 40]
        expr = "+".join(f"eq(n,{f})" for f in chunk)
        r = sh(["ffmpeg", "-v", "error", "-i", str(video), "-fps_mode", "passthrough",
                "-vf", f"select='{expr}',scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", pix, "-"])
        size = w * h * ch
        for i, f in enumerate(chunk):
            a = np.frombuffer(r.stdout[i * size:(i + 1) * size], np.uint8)
            if a.size < size: raise SystemExit(f"frame {f} not decoded (video has {k + i} frames?)")
            out[f] = a.reshape(h, w) if ch == 1 else a.reshape(h, w, 3)
    return out


# ---------------------------------------------------------------- extract

def cmd_extract(a):
    video, wd = Path(a.video).expanduser().resolve(), Path(a.workdir)
    wd.mkdir(parents=True, exist_ok=True)
    s = json.loads(sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                       "stream=width,height:format=duration", "-of", "json", str(video)]).stdout)
    pts = [l.split(",")[0] for l in sh(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                        "frame=best_effort_timestamp_time", "-of", "csv=p=0", str(video)]
                                       ).stdout.decode().split() if l.strip()]
    pts = [float(p) for p in pts if p not in ("", "N/A")]
    t0 = pts[0] if pts else 0.0
    dst = wd / ("recording" + video.suffix.lower())
    if not dst.exists(): shutil.copy2(video, dst)
    meta = {"source": str(video), "video": dst.name, "width": s["streams"][0]["width"],
            "height": s["streams"][0]["height"], "duration": float(s["format"]["duration"]),
            "frames": len(pts), "pts": [round(p - t0, 6) for p in pts]}
    (wd / "meta.json").write_text(json.dumps(meta))
    print(f"{video.name}: {meta['width']}x{meta['height']}, {meta['duration']:.3f}s, {meta['frames']} frames "
          f"(variable frame rate is fine; times come from frame timestamps) -> {wd}/meta.json")


# ---------------------------------------------------------------- candidates

def cmd_candidates(a):
    wd = Path(a.workdir); meta = load_meta(wd); pts = meta["pts"]
    w, h = scaled_size(meta, 428)
    rows, prev = [], None
    for i, f in enumerate(stream_frames(wd / meta["video"], w, h)):
        f = f.astype(np.int16)
        if prev is not None:
            m = np.abs(f - prev) > 12
            px = int(m.sum())
            if px >= 8:
                ys, xs = np.nonzero(m)
                bb = [round(float(v), 3) for v in (xs.min() / w, ys.min() / h, (xs.max() + 1) / w, (ys.max() + 1) / h)]
                small = (bb[2] - bb[0]) < 0.04 and (bb[3] - bb[1]) < 0.06
                rows.append({"frame": i, "t": round(pts[i], 3) if i < len(pts) else None,
                             "pct": round(100 * px / m.size, 2), "bbox": bb,
                             "kind": "cursor?" if small and px < 400 else ("full" if px > 0.5 * m.size else "change")})
        prev = f
    (wd / "candidates.json").write_text(json.dumps(rows))
    print(f"{len(rows)} changed frames (frame 0 = first paint). bbox = x0,y0,x1,y1 normalized.")
    print(" frame      t   changed  kind     bbox")
    for r in rows:
        if r["kind"] == "cursor?" and not a.all: continue
        print(f"{r['frame']:6d} {r['t']:7.3f} {r['pct']:7.2f}%  {r['kind']:8s} {r['bbox']}")
    hidden = sum(r["kind"] == "cursor?" for r in rows)
    if hidden and not a.all: print(f"({hidden} small cursor-like changes hidden; --all to show)")


# ---------------------------------------------------------------- sheets

def font():
    from PIL import ImageFont
    for p in ("/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/Monaco.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"):
        if os.path.exists(p):
            try: return ImageFont.truetype(p, 16)
            except Exception: pass
    return ImageFont.load_default()

def save_sheets(images, labels, out_prefix, cols=3, cell_w=660):
    """Grid of labelled images, split so no sheet exceeds ~1980px per side."""
    from PIL import Image, ImageDraw
    if not images: return []
    ch = int(cell_w * images[0].height / images[0].width)
    rows_per = max(1, 1980 // ch); per = cols * rows_per; paths = []
    for s in range(0, len(images), per):
        chunk = list(zip(images, labels))[s:s + per]
        nr = (len(chunk) + cols - 1) // cols
        S = Image.new("RGB", (cell_w * cols, ch * nr), (40, 0, 0))
        for k, (im, lab) in enumerate(chunk):
            im = im.resize((cell_w, ch)); d = ImageDraw.Draw(im)
            d.rectangle([0, ch - 24, len(lab) * 10 + 10, ch], fill="black"); d.text((5, ch - 22), lab, fill="yellow", font=font())
            S.paste(im, ((k % cols) * cell_w, (k // cols) * ch))
        p = f"{out_prefix}-{s // per + 1}.jpg"; S.save(p, quality=85); paths.append(p)
    return paths

def cmd_sheet(a):
    from PIL import Image
    wd = Path(a.workdir); meta = load_meta(wd); pts = meta["pts"]
    frames = [int(x) for x in a.frames.split(",") if x.strip()]
    w, h = scaled_size(meta, 1320)
    got = grab(wd / meta["video"], frames, w, h, "rgb24")
    ims, labs = [], []
    for f in frames:
        im = Image.fromarray(got[f])
        if a.crop:
            x0, y0, x1, y1 = [float(v) for v in a.crop.split(",")]
            im = im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
        ims.append(im); labs.append(f"#{f} t={pts[f]:.3f}")
    (wd / "sheets").mkdir(exist_ok=True)
    for p in save_sheets(ims, labs, str(wd / "sheets" / a.name), cols=a.cols): print(p)


# ---------------------------------------------------------------- regions (move-aware diff)

def compute_regions(wd, meta, paints):
    """For each paint, compare its frame with its base frame (default: the frame before).
       1. Layout shapes = edge outlines dilated into elements (words, icons, inputs, cards),
          found in both frames; shapes with >30% changed pixels are candidates.
       2. Each candidate's pixels are searched for in the other frame within SEARCH px
          (template match; tolerance scales with contrast; ambiguous repeats rejected).
          Found + its source spot vacated -> MOVED by (dx, dy). Unchanged source = a copy.
       3. Unmatched shapes are PAINTED (new/changed/removed). Removals whose spot is now
          filled by moved-in content are dropped (the move explains them). Containers that
          only changed because things moved inside them are dropped.
       4. Changed pixels nothing explains (flat fills, solid buttons, toolbar icons) are painted.
       4b. Ambiguous shapes that line up with an offset already found in the frame join that move.
           The cursor is dropped only where a learned cursor sprite matches (see learn_cursor).
       5. Each painted box grows to its whole element (faint shimmer ends included); boxes merge
          only when touching; icon-sized boxes join the element beside them; moves with the same
          offset are grouped."""
    import cv2
    from scipy import ndimage as nd
    W, H = scaled_size(meta, 1710)
    s = W / 1710                                      # constants were tuned at 1710 px wide
    EDGE, CHG, TOP, SEARCH = 5, 10, int(H * 0.028), int(160 * s)
    CUR_W, CUR_H = 30 * s, 42 * s
    need = set()
    for p in paints:
        if p["frame"] > 0: need |= {p["frame"], p.get("base", p["frame"] - 1)}
    # frames where only something small changed: where the cursor's sprites are learned
    cj = wd / "candidates.json"
    small = [r["frame"] for r in json.loads(cj.read_text()) if r["kind"] == "cursor?"] if cj.exists() else []
    if not cj.exists(): print("warning: no candidates.json, so no cursor sprites (run `candidates` first)")
    small = small[::max(1, len(small) // 40)][:40]
    need |= {f for f in small} | {f - 1 for f in small}
    F = {k: v.astype(np.float32) for k, v in grab(wd / meta["video"], need, W, H).items()}

    def is_small(b): return (b[2] - b[0]) <= CUR_W and (b[3] - b[1]) <= CUR_H
    def overlap(a, b): return max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    def area(b): return (b[2] - b[0]) * (b[3] - b[1])

    def tol(p): return min(7, max(3.5, 0.12 * p.std())) ** 2

    def learn_cursor(pairs):
        """Cursor = something small that moves on its own: in a frame where only a small
        region changed, a small blob whose pixels reappear in the previous frame at a
        nearby offset. Its tight crop (from both frames) becomes a sprite."""
        sprites = []
        for f in pairs:
            new, old = F[f], F[f - 1]
            lab, _ = nd.label(nd.binary_dilation(np.abs(new - old) > CHG, iterations=2))
            for sl in nd.find_objects(lab):
                if sl is None: continue
                b = [sl[1].start, sl[0].start, sl[1].stop, sl[0].stop]
                if not is_small(b) or b[3] < TOP * 2: continue
                for img, other in ((new, old), (old, new)):
                    p = img[b[1]:b[3], b[0]:b[2]]
                    if p.std() < 20 or min(p.shape) < 6: continue
                    x0, y0 = max(0, b[0] - SEARCH), max(0, b[1] - SEARCH)
                    r = cv2.matchTemplate(other[y0:min(H, b[3] + SEARCH), x0:min(W, b[2] + SEARCH)], p, cv2.TM_SQDIFF) / p.size
                    by, bx = np.unravel_index(r.argmin(), r.shape)
                    if r.min() <= tol(p) and abs(x0 + bx - b[0]) + abs(y0 + by - b[1]) >= 3:
                        if not any(q.shape == p.shape and np.mean((q - p) ** 2) <= tol(p) for q in sprites):
                            sprites.append(p.copy())
        return sprites

    SPRITES = learn_cursor(small)
    print(f"cursor sprites learned: {len(SPRITES)}")

    def is_cursor(b, *imgs):
        """A small box is the cursor only if a learned cursor sprite is inside it, in either
        frame (checking both catches a cursor that changed shape in place, e.g. arrow -> hand)."""
        if not is_small(b) or not SPRITES: return False
        pad = int(16 * s)
        for img in imgs:
            x0, y0, x1, y1 = max(0, b[0] - pad), max(0, b[1] - pad), min(W, b[2] + pad), min(H, b[3] + pad)
            reg = img[y0:y1, x0:x1]
            for q in SPRITES:
                if q.shape[0] <= reg.shape[0] and q.shape[1] <= reg.shape[1]:
                    if (cv2.matchTemplate(reg, q, cv2.TM_SQDIFF) / q.size).min() <= tol(q): return True
        return False

    def shapes(img):
        g = nd.gaussian_filter(img, 0.7)
        e = (np.abs(np.diff(g, axis=1, prepend=g[:, :1])) > EDGE) | (np.abs(np.diff(g, axis=0, prepend=g[:1])) > EDGE)
        lab, _ = nd.label(nd.binary_dilation(e, structure=np.ones((5, 7))))
        return lab, nd.find_objects(lab)

    def changed_shapes(lab, objs, chg):
        out = []
        for i, sl in enumerate(objs, 1):
            if sl is None: continue
            comp = lab[sl] == i
            if comp.sum() < 40 * s * s or chg[sl][comp].mean() <= 0.3: continue
            out.append([sl[1].start, sl[0].start, sl[1].stop, sl[0].stop])
        return out

    def find(src, b, other):
        x0, y0, x1, y1 = b
        p = src[y0:y1, x0:x1]
        if p.std() < 6 or p.shape[0] < 2 or p.shape[1] < 2: return None
        sx0, sy0, sx1, sy1 = max(0, x0 - SEARCH), max(0, y0 - SEARCH), min(W, x1 + SEARCH), min(H, y1 + SEARCH)
        r = cv2.matchTemplate(other[sy0:sy1, sx0:sx1], p, cv2.TM_SQDIFF) / p.size
        best = r.min()
        if best > min(7, max(3.5, 0.12 * p.std())) ** 2: return None
        by, bx = np.unravel_index(r.argmin(), r.shape)
        r2 = r.copy(); r2[max(0, by - 4):by + 5, max(0, bx - 4):bx + 5] = np.inf
        if np.isfinite(r2).any() and r2.min() < best * 2.5 + 4: return None   # ambiguous
        dx, dy = sx0 + bx - x0, sy0 + by - y0
        return None if abs(dx) + abs(dy) < 2 else (int(dx), int(dy))

    def grow(b, img, tol=4):
        x0, y0, x1, y1 = b[:4]
        if area(b) > 0.3 * W * H: return b
        for pad in (int(40 * s), int(120 * s), int(300 * s)):
            X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad // 3), min(W, x1 + pad), min(H, y1 + pad // 3)
            reg = img[Y0:Y1, X0:X1]
            ring = np.ones(reg.shape, bool); ring[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = False
            if not ring.any(): return b
            bg = np.median(reg[ring])
            if (np.abs(reg[ring] - bg) <= tol).mean() < 0.6: return b
            lab, _ = nd.label(np.abs(reg - bg) > tol)
            ids = np.unique(lab[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0]); ids = ids[ids > 0]
            if not len(ids): return b
            ys, xs = np.nonzero(np.isin(lab, ids))
            nb = [min(x0, X0 + xs.min()), min(y0, Y0 + ys.min()), max(x1, X0 + xs.max() + 1), max(y1, Y0 + ys.max() + 1)]
            leaked = (nb[0] == X0 and X0 > 0) or (nb[1] == Y0 and Y0 > 0) or (nb[2] == X1 and X1 < W) or (nb[3] == Y1 and Y1 < H)
            if not leaked: return [int(v) for v in nb] + list(b[4:])
        return b

    def outermost(bs):
        return [a for i, a in enumerate(bs) if not any(
            j != i and c[0] <= a[0] and c[1] <= a[1] and c[2] >= a[2] and c[3] >= a[3] and (c != a or j < i)
            for j, c in enumerate(bs))]

    def merge(bs, gap):
        bs = [list(b) for b in bs]; m = True
        while m:
            m = False
            for i in range(len(bs)):
                for j in range(i + 1, len(bs)):
                    a, c = bs[i], bs[j]
                    if a[0] <= c[2] + gap and c[0] <= a[2] + gap and a[1] <= c[3] + gap and c[1] <= a[3] + gap:
                        bs[i] = [min(a[0], c[0]), min(a[1], c[1]), max(a[2], c[2]), max(a[3], c[3])] + a[4:]
                        bs.pop(j); m = True; break
                if m: break
        return bs

    def attach_small(bs, gap=8 * s):
        bs = [list(b) for b in bs]
        for sm in [b for b in bs if is_small(b)]:
            for b in bs:
                if b is sm or is_small(b): continue
                if min(sm[3], b[3]) - max(sm[1], b[1]) >= 0.6 * (sm[3] - sm[1]) and max(b[0] - sm[2], sm[0] - b[2]) <= gap:
                    b[:4] = [min(sm[0], b[0]), min(sm[1], b[1]), max(sm[2], b[2]), max(sm[3], b[3])]
                    bs.remove(sm); break
        return bs

    res = {}
    for p in paints:
        f = p["frame"]
        if f == 0 and "base" not in p:
            res[str(f)] = {"paint": [[0, 0, 1, 1]], "move": []}; continue
        new, old = F[f], F[p.get("base", f - 1)]
        diff = np.abs(new - old) > CHG
        chg = nd.binary_dilation(diff, iterations=2)
        ln, on = shapes(new); lo, oo = shapes(old)
        new_c, old_c = changed_shapes(ln, on, chg), changed_shapes(lo, oo, chg)

        def vacated(b):
            x0, y0, x1, y1 = max(0, b[0]), max(0, b[1]), min(W, b[2]), min(H, b[3])
            return x1 > x0 and y1 > y0 and chg[y0:y1, x0:x1].mean() > 0.3

        moves, un_new, un_old = [], [], []
        for b in new_c:
            m = find(new, b, old)
            if m and vacated([b[0] + m[0], b[1] + m[1], b[2] + m[0], b[3] + m[1]]): moves.append(b + [-m[0], -m[1]])
            else: un_new.append(b)
        src = [[x0 - dx, y0 - dy, x1 - dx, y1 - dy] for x0, y0, x1, y1, dx, dy in moves]
        for b in old_c:
            if any(overlap(b, q) > 0.5 * area(b) for q in src): continue
            m = find(old, b, new)
            if m and vacated(b): moves.append([b[0] + m[0], b[1] + m[1], b[2] + m[0], b[3] + m[1], m[0], m[1]])
            else: un_old.append(b)

        # second pass: shapes too ambiguous to match alone (repeated chevrons, identical rows)
        # that line up with an offset already found in this frame moved with that group
        offs = sorted({(m[4], m[5]) for m in moves})
        def at(img, b, other, dx, dy):
            x0, y0, x1, y1 = b
            if x0 + dx < 0 or y0 + dy < 0 or x1 + dx > W or y1 + dy > H: return False
            p = img[y0:y1, x0:x1]
            return p.std() >= 6 and np.mean((p - other[y0 + dy:y1 + dy, x0 + dx:x1 + dx]) ** 2) <= tol(p)
        paint, removed = [], []
        for b in un_new:
            o = next(((dx, dy) for dx, dy in offs if at(new, b, old, -dx, -dy)), None)
            if o: moves.append(b + [o[0], o[1]])
            elif not is_cursor(b, new, old): paint.append(grow(b, new))
        src = [[x0 - dx, y0 - dy, x1 - dx, y1 - dy] for x0, y0, x1, y1, dx, dy in moves]
        for b in un_old:
            if any(overlap(b, q) > 0.5 * area(b) for q in src): continue
            o = next(((dx, dy) for dx, dy in offs if at(old, b, new, dx, dy)), None)
            if o: moves.append([b[0] + o[0], b[1] + o[1], b[2] + o[0], b[3] + o[1], o[0], o[1]])
            elif not is_cursor(b, old, new): removed.append(grow(b, old))
        paint += [r for r in removed if sum(overlap(r, m) for m in moves) < 0.6 * area(r)]
        paint = [q for q in paint if not any(q[0] <= m[0] and q[1] <= m[1] and q[2] >= m[2] and q[3] >= m[3] for m in moves)]

        cov = np.zeros_like(diff)
        for x0, y0, x1, y1, dx, dy in moves:
            cov[max(0, y0):y1, max(0, x0):x1] = True; cov[max(0, y0 - dy):max(0, y1 - dy), max(0, x0 - dx):max(0, x1 - dx)] = True
        for x0, y0, x1, y1 in paint: cov[y0:y1, x0:x1] = True
        cov = nd.binary_dilation(cov, iterations=3)
        resid = nd.binary_opening(diff & ~cov, iterations=1)
        rl, _ = nd.label(nd.binary_dilation(resid, iterations=4))
        for i, sl in enumerate(nd.find_objects(rl), 1):
            if sl is None: continue
            b = [sl[1].start, sl[0].start, sl[1].stop, sl[0].stop]
            chrome = b[3] < TOP * 2
            if resid[sl][rl[sl] == i].sum() < (15 if chrome else 120) * s * s or is_cursor(b, new, old): continue
            paint.append(grow(b, new))

        paint = attach_small(merge(outermost(paint), gap=1))
        groups = {}
        for mv in moves: groups.setdefault((mv[4], mv[5]), []).append(mv[:4])
        moves = [g + [dx, dy] for (dx, dy), bs in groups.items() for g in merge(bs, gap=int(24 * s))]
        moves = [m for m in moves if not is_cursor(m[:4], new, old)]
        nx = lambda b: [round(b[0] / W, 4), round(b[1] / H, 4), round((b[2] - b[0]) / W, 4), round((b[3] - b[1]) / H, 4)]
        res[str(f)] = {"paint": [nx(b) for b in paint], "move": [nx(m) + [round(m[4] / W, 4), round(m[5] / H, 4)] for m in moves]}
        print(f"paint #{f:<5} painted {len(paint):3d}  moved {[(int(m[4]), int(m[5])) for m in moves]}")
    return res

def load_paints(wd):
    pj = wd / "paints.json"
    if not pj.exists(): raise SystemExit(f"{pj} missing: author it first (see SKILL.md)")
    cfg = json.loads(pj.read_text())
    cfg["paints"] = sorted(cfg["paints"], key=lambda p: p["frame"])
    return cfg

def cmd_regions(a):
    wd = Path(a.workdir); meta = load_meta(wd); cfg = load_paints(wd)
    (wd / "regions.json").write_text(json.dumps(compute_regions(wd, meta, cfg["paints"])))
    print(f"-> {wd}/regions.json")

def cmd_check(a):
    from PIL import Image, ImageDraw
    wd = Path(a.workdir); meta = load_meta(wd); cfg = load_paints(wd)
    R = json.loads((wd / "regions.json").read_text())
    w, h = scaled_size(meta, 1320)
    got = grab(wd / meta["video"], [p["frame"] for p in cfg["paints"]], w, h, "rgb24")
    ims, labs = [], []
    for p in cfg["paints"]:
        im = Image.fromarray(got[p["frame"]]); d = ImageDraw.Draw(im); r = R.get(str(p["frame"]), {"paint": [], "move": []})
        for x, y, bw, bh in r["paint"]: d.rectangle([x * w, y * h, (x + bw) * w, (y + bh) * h], outline=(255, 0, 110), width=3)
        for x, y, bw, bh, dx, dy in r["move"]:
            d.rectangle([(x - dx) * w, (y - dy) * h, (x - dx + bw) * w, (y - dy + bh) * h], outline=(150, 150, 150), width=1)
            d.rectangle([x * w, y * h, (x + bw) * w, (y + bh) * h], outline=(0, 140, 255), width=3)
        ims.append(im); labs.append(f"#{p['frame']} t={meta['pts'][p['frame']]:.3f}")
    (wd / "sheets").mkdir(exist_ok=True)
    for q in save_sheets(ims, labs, str(wd / "sheets" / "check"), cols=2, cell_w=960): print(q)
    print("pink = painted, blue = moved (grey = where it moved from)")


# ---------------------------------------------------------------- build + preview

def cmd_build(a):
    from PIL import Image
    wd = Path(a.workdir); meta = load_meta(wd); cfg = load_paints(wd)
    rp = wd / "regions.json"
    R = json.loads(rp.read_text()) if rp.exists() else {}
    if not R: print("warning: no regions.json; page will have no change overlay (run `regions`)")
    w, h = scaled_size(meta, 1140)
    (wd / "paints").mkdir(exist_ok=True)
    got = grab(wd / meta["video"], [p["frame"] for p in cfg["paints"]], w, h, "rgb24")
    for f, arr in got.items(): Image.fromarray(arr).save(wd / "paints" / f"p{f:05d}.jpg", quality=85)
    end = meta["duration"]
    paints = [{"f": p["frame"], "t": round(meta["pts"][p["frame"]], 3), "l": p["label"], "minor": bool(p.get("minor"))}
              for p in cfg["paints"]]
    data = {"title": cfg.get("title", Path(meta["source"]).stem), "source": Path(meta["source"]).name,
            "video": meta["video"], "end": end, "vw": meta["width"], "vh": meta["height"],
            "phases": cfg.get("phases") or [{"start": 0, "end": end, "name": "Recording"}],
            "metrics": cfg.get("metrics", []), "notes": cfg.get("notes", ""), "paints": paints, "regions": R}
    html = TEMPLATE.read_text().replace("__DATA__", json.dumps(data).replace("</", "<\\/"))
    (wd / "index.html").write_text(html)
    print(f"-> {wd}/index.html ({len(paints)} paints)")

def find_chrome():
    for c in ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
              "/Applications/Chromium.app/Contents/MacOS/Chromium"):
        if os.path.exists(c): return c
    for c in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        if shutil.which(c): return shutil.which(c)
    raise SystemExit("Chrome/Chromium not found for preview")

def cmd_preview(a):
    wd = Path(a.workdir).resolve(); out = wd / (a.out or "preview.png")
    url = f"file://{wd}/index.html?hold#t={a.t}"
    subprocess.run([find_chrome(), "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={a.size}",
                    "--virtual-time-budget=4000", f"--screenshot={out}", url], capture_output=True)
    print(out if out.exists() else "screenshot failed")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    p = sp.add_parser("extract"); p.add_argument("video"); p.add_argument("workdir"); p.set_defaults(fn=cmd_extract)
    p = sp.add_parser("candidates"); p.add_argument("workdir"); p.add_argument("--all", action="store_true"); p.set_defaults(fn=cmd_candidates)
    p = sp.add_parser("sheet"); p.add_argument("workdir"); p.add_argument("--frames", required=True)
    p.add_argument("--crop"); p.add_argument("--name", default="sheet"); p.add_argument("--cols", type=int, default=3); p.set_defaults(fn=cmd_sheet)
    p = sp.add_parser("regions"); p.add_argument("workdir"); p.set_defaults(fn=cmd_regions)
    p = sp.add_parser("check"); p.add_argument("workdir"); p.set_defaults(fn=cmd_check)
    p = sp.add_parser("build"); p.add_argument("workdir"); p.set_defaults(fn=cmd_build)
    p = sp.add_parser("preview"); p.add_argument("workdir"); p.add_argument("--t", default="0")
    p.add_argument("--size", default="1600,1000"); p.add_argument("--out"); p.set_defaults(fn=cmd_preview)
    a = ap.parse_args(); a.fn(a)

if __name__ == "__main__":
    main()
