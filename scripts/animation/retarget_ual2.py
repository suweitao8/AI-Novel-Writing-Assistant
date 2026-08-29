# Retarget a Manny animation GLB onto the UAL2 skeleton, verify it, and write a GLB.
# Usage: python retarget_ual2.py <anim.glb> <ual2.glb> <out.glb> <animName>
import struct, json, math, sys

# ---------- verified quat math ----------
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
def qrot_vec(q, v):
    x, y, z, w = q
    uv = (y*v[2]-z*v[1], z*v[0]-x*v[2], x*v[1]-y*v[0])
    uuv = (y*uv[2]-z*uv[1], z*uv[0]-x*uv[2], x*uv[1]-y*uv[0])
    return (v[0]+2*(w*uv[0]+uuv[0]), v[1]+2*(w*uv[1]+uuv[1]), v[2]+2*(w*uv[2]+uuv[2]))
assert abs(qrot_vec((math.sin(math.pi/4), 0, 0, math.cos(math.pi/4)), (0, 1, 0))[2] - 1) < 1e-9

# ---------- glb ----------
def read_glb(path):
    b = open(path, "rb").read()
    jlen = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20+jlen])
    bo = 20 + jlen
    blen = struct.unpack_from("<I", b, bo)[0]
    return j, b[bo+8:bo+8+blen]

def acc(j, buf, i):
    a = j["accessors"][i]
    v = j["bufferViews"][a["bufferView"]]
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    n = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[a["type"]]
    flat = struct.unpack_from("<%df" % (a["count"]*n), buf, off)
    return [tuple(flat[k*n:(k+1)*n]) for k in range(a["count"])]

def load_tracks(j, buf, anim_name=None):
    anims = j.get("animations", [])
    if not anims:
        raise ValueError("source GLB has no animations")
    anim = next((a for a in anims if a.get("name") == anim_name), anims[0])
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

def resample_rot(tt, grid):
    times, vals = tt
    if len(times) == len(grid) and all(abs(a-b) < 1e-6 for a, b in zip(times, grid)):
        return vals
    out, jj = [], 0
    for t in grid:
        if t <= times[0]: out.append(vals[0]); continue
        if t >= times[-1]: out.append(vals[-1]); continue
        while jj < len(times)-2 and times[jj+1] <= t: jj += 1
        f = (t - times[jj]) / (times[jj+1] - times[jj])
        out.append(qslerp(vals[jj], vals[jj+1], f))
    return out

def resample_vec(tt, grid):
    times, vals = tt
    if len(times) == len(grid) and all(abs(a-b) < 1e-6 for a, b in zip(times, grid)):
        return vals
    out, jj = [], 0
    for t in grid:
        if t <= times[0]: out.append(vals[0]); continue
        if t >= times[-1]: out.append(vals[-1]); continue
        while jj < len(times)-2 and times[jj+1] <= t: jj += 1
        f = (t - times[jj]) / (times[jj+1] - times[jj])
        out.append(tuple(a[k]+(b[k]-a[k])*f for k in range(len(a))))
    return out

# ---------- inputs ----------
if len(sys.argv) != 5:
    raise SystemExit(
        "usage: python retarget_ual2.py <source.glb> <target.glb> <output.glb> <animation-name>"
    )

anim_path, base_path, out_path, anim_name = sys.argv[1:]
aj, abuf = read_glb(anim_path)
bj, bbuf = read_glb(base_path)
anodes, bnodes = aj["nodes"], bj["nodes"]
aparent, bparent = parents(aj), parents(bj)
atracks = load_tracks(aj, abuf)

grid = next((t["rotation"][0] for t in atracks.values() if "rotation" in t), None)
if not grid:
    raise ValueError("source animation has no rotation track")
F = len(grid)

src_rot, src_trans = {}, {}
for i, tr in atracks.items():
    if "rotation" in tr: src_rot[i] = resample_rot(tr["rotation"], grid)
    if "translation" in tr: src_trans[i] = resample_vec(tr["translation"], grid)

def rest_rot(n): return qnorm(tuple(n.get("rotation", (0, 0, 0, 1))))
def rest_trans(n): return tuple(n.get("translation", (0.0, 0.0, 0.0)))

# source worlds per frame
a_by_name = {n.get("name", "").lower(): i for i, n in enumerate(anodes) if n.get("name")}
a_worldF = {}
for i in topo(aj, aparent):
    p = aparent.get(i)
    loc = src_rot.get(i)
    rest = rest_rot(anodes[i])
    a_worldF[i] = [(loc[f] if loc else rest) if p is None else qmul(a_worldF[p][f], loc[f] if loc else rest)
                   for f in range(F)]

# target solve
b_order = topo(bj, bparent)
# 只在目标骨架关节内做名字匹配：避免把网格包装节点（如 UAL2 的 Mannequin
# mesh 节点）误配成源骨架的同名骨骼（如 UE 导出的 Mannequin 根骨），导致
# 整只模型的包装节点被动画驱动。源侧是纯动画导出，可能没有 skins，用全部
# 命名节点即可。
b_joints = set()
for sk in bj.get("skins", []): b_joints.update(sk["joints"])
a_by_name = {n.get("name", "").lower(): i for i, n in enumerate(anodes) if n.get("name")}
t2s = {}
for ui in b_order:
    if ui not in b_joints: continue
    nm = (bnodes[ui].get("name") or "").lower()
    if nm in a_by_name: t2s[ui] = a_by_name[nm]

# 世界空间绑定姿态差重定向：
#   W_t(b) := W_s(b) · inv(W_s0(b)) · W_t0(b)
# 把源骨骼从绑定姿态到动画姿态的世界旋转增量应用到目标绑定姿态。
# 右乘目标绑定姿态会把源骨架的局部轴差错带到目标骨骼，表现为待机仍近似 T
# 姿；左乘的世界空间形式才会保留源动作的实际下垂、屈膝和坐姿方向。
# 其中 W_*0 为各骨架静止（bind）世界朝向，W_s(b) 为源动画世界朝向。
src_rest_world = {}
for i in topo(aj, aparent):
    p = aparent.get(i)
    lq = rest_rot(anodes[i])
    src_rest_world[i] = lq if p is None else qmul(src_rest_world[p], lq)
tgt_rest_world = {}
for ui in b_order:
    p = bparent.get(ui)
    lq = rest_rot(bnodes[ui])
    tgt_rest_world[ui] = lq if p is None else qmul(tgt_rest_world[p], lq)

out_rot, out_trans, bt_worldF = {}, {}, {}
for ui in b_order:
    p = bparent.get(ui)
    src = t2s.get(ui)
    restL = rest_rot(bnodes[ui])
    if src is not None and src in a_worldF:
        locals_, worlds = [], []
        prev = None
        for f in range(F):
            desired = qmul(
                qmul(a_worldF[src][f], qconj(src_rest_world[src])),
                tgt_rest_world[ui],
            )
            pw = bt_worldF.get(p, [None]*F)[f] if (p is not None and p in bt_worldF) else None
            lq = qnorm(desired if pw is None else qmul(qconj(pw), desired))
            if prev is not None and qdot(prev, lq) < 0:
                lq = tuple(-x for x in lq)  # 半球连续性：避免相邻键 q/-q 翻转导致插值过零
            locals_.append(lq); prev = lq
            worlds.append(desired)
        out_rot[ui] = locals_
        bt_worldF[ui] = worlds
    else:
        # 未匹配节点（如 Armature 包装）不输出通道，保留其静止变换
        bt_worldF[ui] = [restL]*F if p is None else [qmul(bt_worldF[p][f], restL) for f in range(F)]
for ui in b_order:
    nm = (bnodes[ui].get("name") or "").lower()
    if nm not in ("pelvis", "root"): continue
    src = t2s.get(ui)
    if src is None or src not in src_trans: continue
    u_rest, a_rest = rest_trans(bnodes[ui]), rest_trans(anodes[src])
    # 平移轨道的值是源骨架父空间中的绝对姿态。只传递相对源绑定姿态的增量，
    # 再按绑定骨骼长度缩放；直接做 u_rest * (v / a_rest) 会把坐姿的源空间
    # 位移误写成目标深度位移（例如骨盆被推到 -1.6m）。
    a_len = math.sqrt(sum(value * value for value in a_rest))
    u_len = math.sqrt(sum(value * value for value in u_rest))
    scale = u_len / a_len if a_len > 1e-6 else 1.0
    out_trans[ui] = [tuple(u_rest[k] + scale * (v[k] - a_rest[k]) for k in range(3))
                     for v in src_trans[src]]

# ---------- verify: recompose target at mid frame and compare with the solved target pose ----------
tm = grid[F//2]
def compose(tracks_override, t):
    W, P = {}, {}
    for i in b_order:
        tr = tracks_override.get(i)
        lq = qnorm(sample_rot(tr["rotation"], t)) if tr and "rotation" in tr else rest_rot(bnodes[i])
        lt = sample_vec(tr["translation"], t) if tr and "translation" in tr else rest_trans(bnodes[i])
        p = bparent.get(i)
        W[i] = lq if p is None else qmul(W[p], lq)
        pv = qrot_vec(W[p] if p is not None else (0, 0, 0, 1), lt) if p is not None else lt
        base = P[p] if p is not None else (0.0, 0.0, 0.0)
        P[i] = (base[0]+pv[0], base[1]+pv[1], base[2]+pv[2])
    return W, P
def sample_rot(tt, time):
    times, vals = tt
    if time <= times[0]: return vals[0]
    if time >= times[-1]: return vals[-1]
    jj = 0
    while jj < len(times)-2 and times[jj+1] <= time: jj += 1
    f = (time - times[jj]) / (times[jj+1] - times[jj])
    return qslerp(vals[jj], vals[jj+1], f)
def sample_vec(tt, time):
    times, vals = tt
    if time <= times[0]: return vals[0]
    if time >= times[-1]: return vals[-1]
    jj = 0
    while jj < len(times)-2 and times[jj+1] <= time: jj += 1
    f = (time - times[jj]) / (times[jj+1] - times[jj])
    a, b = vals[jj], vals[jj+1]
    return tuple(a[k]+(b[k]-a[k])*f for k in range(len(a)))

# write temporary track map from solved arrays
solved_tracks = {ui: {"rotation": (grid, out_rot[ui])} for ui in out_rot}
for ui, frames in out_trans.items():
    solved_tracks.setdefault(ui, {})["translation"] = (grid, frames)
Wt, Pt = compose(solved_tracks, tm)

def sidx(nm): return next((k for k, n in enumerate(anodes) if n.get("name", "").lower() == nm.lower()), None)
worst = 2.0; worst_nm = None
for ui, w in Wt.items():
    src = t2s.get(ui)
    if src is None: continue
    expected = qmul(
        qmul(a_worldF[src][F//2], qconj(src_rest_world[src])),
        tgt_rest_world[ui],
    )
    d = abs(qdot(w, expected))
    if d < worst: worst, worst_nm = d, bnodes[ui].get("name")
print(f"verify @t={tm:.3f}: worst |dot| = {worst:.5f} ({worst_nm}) -> {'PASS' if worst > 0.999 else 'FAIL'}")
def wpos(name):
    ui = tidx2(name)
    return tuple(round(v, 3) for v in Pt[ui])
def tidx2(nm): return next(k for k, n in enumerate(bnodes) if n.get("name", "").lower() == nm.lower())
for nm in ["pelvis", "Head", "foot_l", "foot_r", "hand_l", "hand_r"]:
    print("  ", nm, wpos(nm))

# ---------- write output GLB ----------
uJson = json.loads(json.dumps(bj))
chunks = [bbuf]
bufLen = [len(bbuf)]
def pad4(b): return b + b"\0" * ((4 - len(b) % 4) % 4)
def push_accessor(arr, comp):
    # arr 是拍平的一维浮点数组，comp 是每键分量数（1/3/4）。
    # 必须显式传入 comp：拍平后再探测 len(arr[0]) 恒为标量，会把 VEC4 旋转
    # 通道写成 SCALAR，蒙皮矩阵全部错乱（2026-08-29 踩过）。
    import array
    a = array.array("f", arr)
    data = a.tobytes()
    view = {"buffer": 0, "byteOffset": bufLen[0], "byteLength": len(data)}
    padded = pad4(data)
    bufLen[0] += len(padded)
    chunks.append(padded)
    uJson["bufferViews"].append(view)
    uJson["accessors"].append({"bufferView": len(uJson["bufferViews"])-1, "componentType": 5126,
                               "count": len(arr) // comp, "type": {1: "SCALAR", 3: "VEC3", 4: "VEC4"}[comp]})
    return len(uJson["accessors"]) - 1

samplers, channels = [], []
time_idx = push_accessor(grid, 1)
def add_track(ui, path, vals):
    comp = len(vals[0])
    vi = push_accessor([x for row in vals for x in row], comp)
    samplers.append({"input": time_idx, "output": vi, "interpolation": "LINEAR"})
    channels.append({"sampler": len(samplers)-1, "target": {"node": ui, "path": path}})
for ui, frames in out_rot.items(): add_track(ui, "rotation", frames)
for ui, frames in out_trans.items(): add_track(ui, "translation", frames)
uJson.setdefault("animations", []).append({"name": anim_name, "samplers": samplers, "channels": channels})
uJson["buffers"][0]["byteLength"] = bufLen[0]

new_bin = b"".join(chunks)
enc = json.dumps(uJson, separators=(",", ":")).encode("utf-8")
enc += b" " * ((4 - len(enc) % 4) % 4)
binp = pad4(new_bin)
total = 12 + 8 + len(enc) + 8 + len(binp)
out = struct.pack("<III", 0x46546C67, 2, total)
out += struct.pack("<II", len(enc), 0x4E4F534A) + enc
out += struct.pack("<II", len(binp), 0x004E4942) + binp
open(out_path, "wb").write(out)
print("wrote", out_path, "|", anim_name, len(channels), "channels")

# ---------- stick figure svg at mid frame ----------
def bone_pairs():
    pairs = []
    for n in ["spine_01", "spine_02", "spine_03", "neck_01", "clavicle_l", "clavicle_r",
              "upperarm_l", "upperarm_r", "lowerarm_l", "lowerarm_r", "hand_l", "hand_r",
              "thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r"]:
        i = next((k for k, x in enumerate(bnodes) if x.get("name") == n), None)
        if i is not None and i in bparent:
            pairs.append((bparent[i], i))
    return pairs
def fmt_svg(P, tag):
    W, H, s = 420, 460, 150
    def xy(p, axis): return (W/2 + p[axis]*s, H - 50 - p[1]*s)
    parts = [f"<text x='8' y='18' fill='#fff' font-size='15'>{tag}</text>"]
    for a, b in bone_pairs():
        pa, pb = Pt[a], Pt[b]
        if a == b: continue
        x1, y1 = xy(pa, 0); x2, y2 = xy(pb, 0)
        parts.append(f"<line x1='{x1:.0f}' y1='{y1:.0f}' x2='{x2:.0f}' y2='{y2:.0f}' stroke='#ffb347' stroke-width='5' stroke-linecap='round'/>")
    for nm in ["pelvis", "Head", "hand_l", "hand_r", "foot_l", "foot_r"]:
        p = Pt[tidx2(nm)]
        x1, y1 = xy(p, 0)
        parts.append(f"<circle cx='{x1:.0f}' cy='{y1:.0f}' r='3.5' fill='#7fd1ff'/>")
    parts2 = []
    for a, b in bone_pairs():
        pa, pb = Pt[a], Pt[b]
        x1, y1 = xy(pa, 2); x2, y2 = xy(pb, 2)
        parts2.append(f"<line x1='{x1:.0f}' y1='{y1:.0f}' x2='{x2:.0f}' y2='{y2:.0f}' stroke='#8ef58e' stroke-width='5' stroke-linecap='round'/>")
    return "<g>" + "".join(parts) + "</g><g transform='translate(430,0)'>" + "".join(parts2) + f"<text x='8' y='18' fill='#fff' font-size='15'>侧视 (z)</text></g>"

svg = ("<svg xmlns='http://www.w3.org/2000/svg' width='860' height='460'>"
       "<rect width='860' height='460' fill='#20202e'/>"
       + fmt_svg(Pt, f"正视图 (x) · {anim_name} · t={tm:.2f}s") + "</svg>")
svg_path = out_path.rsplit(".", 1)[0] + ".svg"
open(svg_path, "w", encoding="utf-8").write(svg)
print("wrote", svg_path)
