# -*- coding: utf-8 -*-
"""Rank published animation clips by source-vs-retargeted skeleton deviation.

For every published clip, forward-kinematics the source clip (Cine57 export)
and the retargeted clip (catalog GLB) at the same sample times, then compare
anatomical endpoints (head, hands, feet) in the pelvis-relative frame,
normalized by each skeleton's rest pelvis->head distance. Also flags:
  - contact clips (source wrists approach each other) where the target wrists
    fail to close to the source gap;
  - hand-through-torso penetration present in the target but not the source.

Usage:
  python quality_sweep.py --glb-dir <dir> [--catalog <UAL2_UE_Anims.glb>] \
      [--samples 12] [--json <out.json>]
"""
import argparse
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from replace_catalog_animation import read_glb

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_GLB_DIR = Path("D:/UnrealWorkspace/Cine57-exported/animation_catalog")


def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw*bx + ax*bw + ay*bz - az*by,
            aw*by + ay*bw + az*bx - ax*bz,
            aw*bz + az*bw + ax*by - ay*bx,
            aw*bw - ax*bx - ay*by - az*bz)
def qconj(q):
    x, y, z, w = q
    return (-x, -y, -z, w)
def qnorm(q):
    d = math.sqrt(sum(x*x for x in q))
    if d < 1e-12: raise ValueError("zero quat")
    return tuple(x/d for x in q)
def qdot(a, b): return sum(x*y for x, y in zip(a, b))
def qslerp(a, b, f):
    d = qdot(a, b)
    if d < 0:
        b = tuple(-x for x in b); d = -d
    if d > 0.9995:
        return qnorm(tuple(a[k]+(b[k]-a[k])*f for k in range(4)))
    th = math.acos(min(1.0, d)); s = math.sin(th)
    wa = math.sin((1-f)*th)/s; wb = math.sin(f*th)/s
    return tuple(a[k]*wa + b[k]*wb for k in range(4))
def qrot(q, v):
    x, y, z, w = q
    uv = (y*v[2]-z*v[1], z*v[0]-x*v[2], x*v[1]-y*v[0])
    uuv = (y*uv[2]-z*uv[1], z*uv[0]-x*uv[2], x*uv[1]-y*uv[0])
    return (v[0]+2*(w*uv[0]+uuv[0]),
            v[1]+2*(w*uv[1]+uuv[1]),
            v[2]+2*(w*uv[2]+uuv[2]))


def vsub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def vlen(a): return math.sqrt(sum(x*x for x in a))
def vdot(a, b): return sum(x*y for x, y in zip(a, b))
def vcross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def anatomical_basis(skel):
    """Rest-frame basis (right, up, forward) from anatomical landmarks so that
    comparisons are invariant to each export's bind orientation."""
    pel = skel.rest_pos[skel.bid("pelvis")]
    head = skel.rest_pos[skel.bid("head")]
    hl = skel.rest_pos[skel.bid("hand_l")]
    hr = skel.rest_pos[skel.bid("hand_r")]
    up = vsub(head, pel)
    fwd = vcross(vsub(hr, hl), up)
    if vlen(fwd) < 1e-6:
        fwd = (up[1], -up[0], 0.0)
    right = vcross(up, fwd)
    n = lambda v: tuple(x / vlen(v) for x in v)
    return n(right), n(up), n(fwd)


def acc(j, buf, i):
    a = j["accessors"][i]
    v = j["bufferViews"][a["bufferView"]]
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    n = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[a["type"]]
    flat = struct_unpack("<%df" % (a["count"]*n), buf, off)
    return [tuple(flat[k*n:(k+1)*n]) for k in range(a["count"])]


import struct as _struct
def struct_unpack(fmt, buf, off): return _struct.unpack_from(fmt, buf, off)


def load_tracks(j, buf, anim_name):
    anim = next((a for a in j.get("animations", []) if a.get("name") == anim_name), None)
    if anim is None:
        return None
    tracks = {}
    for ch in anim["channels"]:
        s = anim["samplers"][ch["sampler"]]
        vals = acc(j, buf, s["output"])
        times = [r[0] for r in acc(j, buf, s["input"])]
        tracks.setdefault(ch["target"]["node"], {})[ch["target"]["path"]] = (times, vals)
    return tracks


def parents(j):
    p = {}
    for i, n in enumerate(j["nodes"]):
        for c in n.get("children", []): p[c] = i
    return p


def topo(j, parent):
    order, seen = [], set()
    def visit(i):
        if i in seen: return
        seen.add(i)
        if i in parent: visit(parent[i])
        order.append(i)
    for i in range(len(j["nodes"])): visit(i)
    return order


def sample_rot(tt, t):
    times, vals = tt
    if t <= times[0]: return vals[0]
    if t >= times[-1]: return vals[-1]
    k = 0
    while k < len(times)-2 and times[k+1] <= t: k += 1
    f = (t - times[k]) / (times[k+1] - times[k])
    return qslerp(vals[k], vals[k+1], f)


def sample_vec(tt, t):
    times, vals = tt
    if t <= times[0]: return vals[0]
    if t >= times[-1]: return vals[-1]
    k = 0
    while k < len(times)-2 and times[k+1] <= t: k += 1
    f = (t - times[k]) / (times[k+1] - times[k])
    a, b = vals[k], vals[k+1]
    return tuple(a[i]+(b[i]-a[i])*f for i in range(len(a)))


def rest_rot(n): return qnorm(tuple(n.get("rotation", (0, 0, 0, 1))))
def rest_trans(n): return tuple(n.get("translation", (0.0, 0.0, 0.0)))


# 3ds Max Biped (Bip001 *) -> UE mannequin bone names; fingers already match.
_BIP_MAP = {
    "bip001 pelvis": "pelvis",
    "bip001 spine": "spine_01",
    "bip001 spine1": "spine_02",
    "bip001 spine2": "spine_03",
    "bip001 neck": "neck_01",
    "bip001 head": "head",
    "bip001 l clavicle": "clavicle_l", "bip001 r clavicle": "clavicle_r",
    "bip001 l upperarm": "upperarm_l", "bip001 r upperarm": "upperarm_r",
    "bip001 l forearm": "lowerarm_l", "bip001 r forearm": "lowerarm_r",
    "bip001 l hand": "hand_l", "bip001 r hand": "hand_r",
    "bip001 l thigh": "thigh_l", "bip001 r thigh": "thigh_r",
    "bip001 l calf": "calf_l", "bip001 r calf": "calf_r",
    "bip001 l foot": "foot_l", "bip001 r foot": "foot_r",
}
def alias_bip(name):
    return _BIP_MAP.get(name.strip().lower(), name)


class Skeleton:
    def __init__(self, j, buf):
        self.j, self.buf = j, buf
        self.parent = parents(j)
        self.order = topo(j, self.parent)
        self.by_name = {}
        for i, n in enumerate(j["nodes"]):
            nm = alias_bip(n.get("name", ""))
            if nm and nm.lower() not in self.by_name:
                self.by_name[nm.lower()] = i
        self._rot = {}
        self.rest_pos = self._fk(None, 0.0)
        pelvis = self.bid("pelvis")
        head = self.bid("head")
        if pelvis is None or head is None:
            raise ValueError("skeleton missing pelvis/head")
        self.scale = vlen(vsub(self.rest_pos[head], self.rest_pos[pelvis]))
        if self.scale < 1e-6:
            raise ValueError("degenerate pelvis-head distance")

    def bid(self, name): return self.by_name.get(name.lower())

    def _fk(self, tracks, t):
        pos = {}
        for i in self.order:
            n = self.j["nodes"][i]
            r = rest_rot(n); p = rest_trans(n)
            if tracks is not None:
                tr = tracks.get(i)
                if tr:
                    if "rotation" in tr: r = sample_rot(tr["rotation"], t)
                    if "translation" in tr: p = sample_vec(tr["translation"], t)
            if i in self.parent:
                p_idx = self.parent[i]
                pp = pos[p_idx]; pr = self._rot[p_idx]
            else:
                pp, pr = (0.0, 0.0, 0.0), (0.0, 0.0, 0.0, 1.0)
            self._rot[i] = qmul(pr, r)
            off = qrot(pr, p)
            pos[i] = (pp[0]+off[0], pp[1]+off[1], pp[2]+off[2])
        return pos

    def fk(self, tracks, t):
        self._rot = {}
        return self._fk(tracks, t)


def seg_dist(p, a, b):
    ab = vsub(b, a)
    denom = sum(x*x for x in ab)
    if denom < 1e-9:
        return vlen(vsub(p, a))
    t = max(0.0, min(1.0, sum((p[k]-a[k])*ab[k] for k in range(3)) / denom))
    c = (a[0]+ab[0]*t, a[1]+ab[1]*t, a[2]+ab[2]*t)
    return vlen(vsub(p, c))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb-dir", type=Path, default=DEFAULT_GLB_DIR)
    parser.add_argument("--catalog", type=Path,
                        default=REPO_ROOT / "client/public/anims/cine57/UAL2_UE_Anims.glb")
    parser.add_argument("--samples", type=int, default=12)
    parser.add_argument("--json", type=Path, default=None)
    parser.add_argument("--top", type=int, default=20)
    args = parser.parse_args()

    selection = json.loads(
        (Path(__file__).parent / "animationCatalogSelection.json").read_text(encoding="utf-8")
    )
    clips = [c for c in selection["clips"] if c.get("published", True)]

    cj, cbuf = read_glb(args.catalog)
    tgt_names = {a.get("name") for a in cj.get("animations", [])}
    tgt = Skeleton(cj, cbuf)
    t_pelvis = tgt.bid("pelvis")
    t_bones = {"head": tgt.bid("head"), "hand_l": tgt.bid("hand_l"),
               "hand_r": tgt.bid("hand_r"), "foot_l": tgt.bid("foot_l"),
               "foot_r": tgt.bid("foot_r"), "neck_01": tgt.bid("neck_01")}
    if any(v is None for v in t_bones.values()):
        raise SystemExit("catalog skeleton missing endpoint bones")

    rows = []
    for clip in clips:
        src_path = args.glb_dir / clip["glbFileName"]
        if not src_path.is_file():
            rows.append({"id": clip["id"], "error": "missing source"})
            continue
        anim_name = clip["clipName"]
        if anim_name not in tgt_names:
            rows.append({"id": clip["id"], "error": "missing in catalog"})
            continue
        sj, sbuf = read_glb(src_path)
        src = Skeleton(sj, sbuf)
        stracks = load_tracks(sj, sbuf, sj["animations"][0].get("name"))
        if stracks is None:
            rows.append({"id": clip["id"], "error": "source anim missing"})
            continue
        ttracks = load_tracks(cj, cbuf, anim_name)
        grid = next((tr["rotation"][0] for tr in stracks.values() if "rotation" in tr), None)
        if not grid:
            rows.append({"id": clip["id"], "error": "no source grid"})
            continue
        n = min(args.samples, len(grid))
        times = [grid[round(k*(len(grid)-1)/(n-1))] for k in range(n)] if n > 1 else [grid[0]]

        s_pelvis = src.bid("pelvis")
        s_map = {"head": src.bid("head"), "hand_l": src.bid("hand_l"),
                 "hand_r": src.bid("hand_r"), "foot_l": src.bid("foot_l"),
                 "foot_r": src.bid("foot_r"), "neck_01": src.bid("neck_01")}
        if any(v is None for v in s_map.values()):
            rows.append({"id": clip["id"], "error": "source skeleton missing bones"})
            continue

        s_basis = anatomical_basis(src)
        t_basis = anatomical_basis(tgt)

        def coords(rel, basis, scale):
            return (vdot(rel, basis[0]) / scale,
                    vdot(rel, basis[1]) / scale,
                    vdot(rel, basis[2]) / scale)

        pen_frames = 0
        src_min_gap, tgt_min_gap = 1e9, 1e9
        src_min_torso, tgt_min_torso = 1e9, 1e9
        series = {k: ([], []) for k in ("head", "hand_l", "hand_r", "foot_l", "foot_r")}
        for t in times:
            sp = src.fk(stracks, t)
            tp = tgt.fk(ttracks, t)
            sp_pel, tp_pel = sp[s_pelvis], tp[t_pelvis]
            for key in series:
                sc = coords(vsub(sp[s_map[key]], sp_pel), s_basis, src.scale)
                tc = coords(vsub(tp[t_bones[key]], tp_pel), t_basis, tgt.scale)
                series[key][0].append(sc); series[key][1].append(tc)
            # wrist gap
            sg = vlen(vsub(sp[s_map["hand_l"]], sp[s_map["hand_r"]])) / src.scale
            tg = vlen(vsub(tp[t_bones["hand_l"]], tp[t_bones["hand_r"]])) / tgt.scale
            src_min_gap = min(src_min_gap, sg); tgt_min_gap = min(tgt_min_gap, tg)
            # hand vs torso segment
            st = seg_dist(sp[s_map["hand_l"]], sp[s_pelvis], sp[s_map["neck_01"]]) / src.scale
            st += seg_dist(sp[s_map["hand_r"]], sp[s_pelvis], sp[s_map["neck_01"]]) / src.scale
            tt_ = seg_dist(tp[t_bones["hand_l"]], tp[t_pelvis], tp[t_bones["neck_01"]]) / tgt.scale
            tt_ += seg_dist(tp[t_bones["hand_r"]], tp[t_pelvis], tp[t_bones["neck_01"]]) / tgt.scale
            src_min_torso = min(src_min_torso, st); tgt_min_torso = min(tgt_min_torso, tt_)
            if tt_ < 0.16 and st > 0.30:
                pen_frames += 1

        # Motion error: compare per-axis series after subtracting their time
        # means, so constant proportion differences between the skeletons do
        # not dominate and a static target fails against a moving source.
        motion_err = 0.0
        for key, (sc_list, tc_list) in series.items():
            n = len(sc_list)
            sm = [sum(p[k] for p in sc_list) / n for k in range(3)]
            tm = [sum(p[k] for p in tc_list) / n for k in range(3)]
            for k in range(3):
                motion_err += sum(abs((tc_list[i][k]-tm[k]) - (sc_list[i][k]-sm[k]))
                                  for i in range(n)) / n
        motion_err /= (len(series) * 3)
        endpoint_err = motion_err
        contact = src_min_gap < 0.30
        contact_err = max(0.0, tgt_min_gap - max(src_min_gap, 0.05) * 1.4) if contact else 0.0
        score = endpoint_err + 3.0 * contact_err + 0.02 * pen_frames
        rows.append({
            "id": clip["id"], "name": clip.get("name", ""),
            "endpoint_err": round(endpoint_err, 4),
            "src_gap": round(src_min_gap, 3), "tgt_gap": round(tgt_min_gap, 3),
            "contact": contact, "contact_err": round(contact_err, 4),
            "pen_frames": pen_frames,
            "src_torso": round(src_min_torso, 3), "tgt_torso": round(tgt_min_torso, 3),
            "score": round(score, 4),
        })

    ok = [r for r in rows if "score" in r]
    bad = [r for r in rows if "score" not in r]
    ok.sort(key=lambda r: -r["score"])
    for r in ok[:args.top]:
        flag = []
        if r["contact"] and r["contact_err"] > 0.02: flag.append("CONTACT")
        if r["pen_frames"] > 0: flag.append("PEN")
        print("%-55s score=%.3f ep=%.3f gap %.2f->%.2f pen=%d %s" % (
            r["id"], r["score"], r["endpoint_err"],
            r["src_gap"], r["tgt_gap"], r["pen_frames"], ",".join(flag)))
    for r in bad:
        print("[ERR] %s: %s" % (r["id"], r["error"]))
    print("clips=%d ranked=%d errors=%d" % (len(rows), len(ok), len(bad)))
    if args.json:
        args.json.write_text(json.dumps({"ranked": ok, "errors": bad},
                                        ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
