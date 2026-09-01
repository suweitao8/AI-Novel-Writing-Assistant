# Retarget a Manny animation GLB onto the UAL2 skeleton, verify it, and write a GLB.
# Usage: python retarget_ual2.py <anim.glb> <ual2.glb> <out.glb> <animName>
import struct, json, math, sys

TARGET_POSE_ANIMATION = "Idle_No_Loop"
TARGET_POSE_FRACTION = 0.4

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
    if anim_name is None:
        anim = anims[0]
    else:
        anim = next((a for a in anims if a.get("name") == anim_name), None)
        if anim is None:
            raise ValueError(f"animation not found: {anim_name}")
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

# ---------- inputs ----------
if len(sys.argv) == 2 and sys.argv[1] in ("-h", "--help"):
    print(
        "usage: python retarget_ual2.py <source.glb> <target.glb> "
        "<output.glb> <animation-name> [target-pose-animation]"
    )
    raise SystemExit(0)
if len(sys.argv) not in (5, 6):
    raise SystemExit(
        "usage: python retarget_ual2.py <source.glb> <target.glb> "
        "<output.glb> <animation-name> [target-pose-animation]"
    )

anim_path, base_path, out_path, anim_name = sys.argv[1:5]
target_pose_name = sys.argv[5] if len(sys.argv) == 6 else TARGET_POSE_ANIMATION
aj, abuf = read_glb(anim_path)
bj, bbuf = read_glb(base_path)
anodes, bnodes = aj["nodes"], bj["nodes"]
aparent, bparent = parents(aj), parents(bj)
atracks = load_tracks(aj, abuf)
base_tracks = load_tracks(bj, bbuf, target_pose_name)

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

# source world positions per frame（末端校正需要源手腕/头的世界坐标）
a_posF = {}
for i in topo(aj, aparent):
    p = aparent.get(i)
    trs = src_trans.get(i)
    base_t = rest_trans(anodes[i])
    if p is None:
        a_posF[i] = [trs[f] if trs else base_t for f in range(F)]
    else:
        a_posF[i] = [
            tuple(a_posF[p][f][k] + qrot_vec(a_worldF[p][f], trs[f] if trs else base_t)[k] for k in range(3))
            for f in range(F)
        ]

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

# 目标站立基准：UAL2 的绑定节点是 T-Pose，而 Idle_No_Loop 的固定采样帧才是
# 角色在分镜和动画预览中应继承的自然站姿。使用固定帧避免把另一个循环动作
# 的时间变化带进每个导入片段，同时让导出结果不依赖 PlayCanvas 运行时补偿。
base_rotation_times = [
    time
    for tracks in base_tracks.values()
    for time in tracks.get("rotation", ([], []))[0]
]
if not base_rotation_times:
    raise ValueError(f"target pose has no rotation tracks: {target_pose_name}")
base_duration = max(base_rotation_times)
base_time = base_duration * TARGET_POSE_FRACTION
target_base_local_rot, target_base_local_trans, target_base_world = {}, {}, {}
for ui in b_order:
    rotation_track = base_tracks.get(ui, {}).get("rotation")
    translation_track = base_tracks.get(ui, {}).get("translation")
    local_rot = qnorm(sample_rot(rotation_track, base_time)) if rotation_track else rest_rot(bnodes[ui])
    local_trans = sample_vec(translation_track, base_time) if translation_track else rest_trans(bnodes[ui])
    target_base_local_rot[ui] = local_rot
    target_base_local_trans[ui] = local_trans
    p = bparent.get(ui)
    target_base_world[ui] = local_rot if p is None else qmul(target_base_world[p], local_rot)

# 世界空间姿态差重定向：
#   W_t(b) := W_s(b) · inv(W_s0(b)) · W_t_standing_base(b)
# 把源骨骼从绑定姿态到动画姿态的世界旋转增量应用到 UAL2 的自然站姿。
# 这样源文件即使带有与目标 T-Pose 不同的基准姿态，也不会把目标手臂带回水平。
src_rest_world = {}
for i in topo(aj, aparent):
    p = aparent.get(i)
    lq = rest_rot(anodes[i])
    src_rest_world[i] = lq if p is None else qmul(src_rest_world[p], lq)
out_rot, out_trans, bt_worldF = {}, {}, {}
for ui in b_order:
    p = bparent.get(ui)
    src = t2s.get(ui)
    if src is not None and src in a_worldF:
        locals_, worlds = [], []
        prev = None
        for f in range(F):
            desired = qmul(
                qmul(a_worldF[src][f], qconj(src_rest_world[src])),
                target_base_world[ui],
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
        # 未匹配节点（如 Armature 包装）不输出通道，但其父级可能已经进入
        # 动画姿态，因此使用目标站姿的局部旋转重组世界朝向。
        baseL = target_base_local_rot[ui]
        bt_worldF[ui] = [target_base_world[ui]]*F if p is None else [qmul(bt_worldF[p][f], baseL) for f in range(F)]

# 目标站姿中有变化的局部平移也作为固定基线写出。绝大多数 UAL2 关节平移
# 与绑定姿态相同，只有 pelvis 等少数节点会被真正写入源动画的相对增量。
for ui in b_joints:
    baseT = target_base_local_trans[ui]
    restT = rest_trans(bnodes[ui])
    if any(abs(baseT[k] - restT[k]) > 1e-6 for k in range(3)):
        out_trans[ui] = [baseT] * F

for ui in b_order:
    nm = (bnodes[ui].get("name") or "").lower()
    if nm not in ("pelvis", "root"): continue
    src = t2s.get(ui)
    if src is None or src not in src_trans: continue
    u_rest, a_rest = target_base_local_trans[ui], rest_trans(anodes[src])
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
        lq = qnorm(sample_rot(tr["rotation"], t)) if tr and "rotation" in tr else target_base_local_rot[i]
        lt = sample_vec(tr["translation"], t) if tr and "translation" in tr else target_base_local_trans[i]
        p = bparent.get(i)
        W[i] = lq if p is None else qmul(W[p], lq)
        pv = qrot_vec(W[p] if p is not None else (0, 0, 0, 1), lt) if p is not None else lt
        base = P[p] if p is not None else (0.0, 0.0, 0.0)
        P[i] = (base[0]+pv[0], base[1]+pv[1], base[2]+pv[2])
    return W, P
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
        target_base_world[ui],
    )
    d = abs(qdot(w, expected))
    if d < worst: worst, worst_nm = d, bnodes[ui].get("name")
print(f"verify @t={tm:.3f}: target pose={target_pose_name}@{TARGET_POSE_FRACTION:.2f}, worst |dot| = {worst:.5f} ({worst_nm}) -> {'PASS' if worst > 0.999 else 'FAIL'}")
def wpos(name):
    ui = tidx2(name)
    return tuple(round(v, 3) for v in Pt[ui])
def tidx2(nm): return next(k for k, n in enumerate(bnodes) if n.get("name", "").lower() == nm.lower())
def wdelta(hand, shoulder):
    return round(Pt[tidx2(hand)][1] - Pt[tidx2(shoulder)][1], 3)
for nm in ["pelvis", "Head", "foot_l", "foot_r", "hand_l", "hand_r"]:
    print("  ", nm, wpos(nm))
print("  hand_y_minus_shoulder:", wdelta("hand_l", "clavicle_l"), wdelta("hand_r", "clavicle_r"))

# ---------- 末端接触校正：臂链两骨 IK ----------
# 纯旋转传递保不住跨骨架的末端接触点：UAL2 与源骨架的肩位/臂长比例不同，
# 源里挠到头顶的手重定向后只停在下巴高度（实测差 ~0.2m）。以头关节为锚，
# 按骨架尺寸比把源手腕位置映射到目标，再对上臂+前臂做两骨 IK；锁骨与手
# 的朝向保持传递结果，肘部平面取自传递姿态，保证逐帧连续不翻肘。
# RETARGET_NO_ARM_IK=1 可关闭（回到纯旋转传递）。
import os as _os

ik_sides = []
chains = {}
ik_scale = 1.0
if not _os.environ.get("RETARGET_NO_ARM_IK"):
    def _bid(nm):
        return next((k for k, n in enumerate(bnodes) if (n.get("name") or "").lower() == nm), None)
    def _vsub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
    def _vlen(a): return math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])
    def _vdot(a, b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
    def _vcross(a, b):
        return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
    def _vnorm(a):
        l = _vlen(a)
        if l < 1e-9: raise ValueError("zero vector")
        return (a[0]/l, a[1]/l, a[2]/l)
    def _arc(a, b):
        # 把向量 a 转到 b 的最短弧旋转（四元数）。
        axis = _vcross(a, b)
        w = 1.0 + _vdot(a, b)
        if w < 1e-9:
            perp = (1.0, 0.0, 0.0) if abs(a[0]) < 0.9 else (0.0, 1.0, 0.0)
            axis = _vcross(a, perp)
            w = 0.0
        return qnorm((axis[0], axis[1], axis[2], w))

    t_head = _bid("head")
    a_head = a_by_name.get("head")
    if t_head is not None and a_head is not None:
        # 目标每帧世界位置（最终平移轨道 + 已解世界旋转的前向运动学）。
        bt_posF = {}
        for ui in b_order:
            p = bparent.get(ui)
            trs = out_trans.get(ui)
            base_t = target_base_local_trans[ui]
            if p is None:
                bt_posF[ui] = [trs[f] if trs else base_t for f in range(F)]
            else:
                bt_posF[ui] = [
                    tuple(bt_posF[p][f][k] + qrot_vec(bt_worldF[p][f], trs[f] if trs else base_t)[k] for k in range(3))
                    for f in range(F)
                ]

        # 骨架尺寸比：自然站姿头关节高度之比，把源手腕偏移缩放到目标尺寸。
        src_head_y = a_posF[a_head][0][1]
        tgt_head_y = bt_posF[t_head][0][1]
        ik_scale = min(2.0, max(0.5, tgt_head_y / src_head_y)) if src_head_y > 1e-6 else 1.0

        # 第一遍：为每条臂链计算逐帧期望手腕位置（头锚定映射）。
        chains = {}
        for side in ("l", "r"):
            chain = [_bid("clavicle_" + side), _bid("upperarm_" + side), _bid("lowerarm_" + side), _bid("hand_" + side)]
            a_hand = a_by_name.get("hand_" + side)
            if any(ui is None for ui in chain) or a_hand is None: continue
            t_clav, t_upper, t_lower, t_hand = chain
            if any(ui not in out_rot or ui not in t2s for ui in chain): continue
            chains[side] = {
                "t_clav": t_clav, "t_upper": t_upper, "t_lower": t_lower, "t_hand": t_hand,
                "a_hand": a_hand,
                "l1": _vlen(target_base_local_trans[t_lower]),
                "l2": _vlen(target_base_local_trans[t_hand]),
                "child_upper": _vnorm(target_base_local_trans[t_lower]),
                "child_lower": _vnorm(target_base_local_trans[t_hand]),
            }
            chains[side]["reach_max"] = chains[side]["l1"] + chains[side]["l2"] - 1e-4
            chains[side]["reach_min"] = abs(chains[side]["l1"] - chains[side]["l2"]) + 1e-4
            ik_sides.append(side)

        desired_targets = {}
        for side, info in chains.items():
            a_hand = info["a_hand"]
            desired_targets[side] = [
                tuple(bt_posF[t_head][f][k] + (a_posF[a_hand][f][k] - a_posF[a_head][f][k]) * ik_scale for k in range(3))
                for f in range(F)
            ]

        # 双手接触校正：源双手贴近（鼓掌、合十等）时，两臂期望目标绕中点
        # 缩放回源间距（按骨架比例），保证重定向后手能真实拍到一起，而不是
        # 各自漂移或互相穿过。
        if "l" in chains and "r" in chains:
            contact_frames = 0
            for f in range(F):
                src_gap = _vlen(_vsub(a_posF[chains["l"]["a_hand"]][f], a_posF[chains["r"]["a_hand"]][f]))
                if src_gap > 0.15: continue
                contact_frames += 1
                tl, tr = desired_targets["l"][f], desired_targets["r"][f]
                mid = tuple((tl[k] + tr[k]) / 2 for k in range(3))
                d = _vsub(tr, tl)
                g = _vlen(d)
                if g > 1e-6:
                    factor = (src_gap * ik_scale) / g
                    desired_targets["l"][f] = tuple(mid[k] - d[k] * factor / 2 for k in range(3))
                    desired_targets["r"][f] = tuple(mid[k] + d[k] * factor / 2 for k in range(3))
                else:
                    desired_targets["l"][f] = mid
                    desired_targets["r"][f] = mid
            if contact_frames:
                print("hand-contact merge on %d frames (source wrists within 0.15m)" % contact_frames)

        # 第二遍：两骨 IK 到期望手腕位置。
        unreachable = {side: [False] * F for side in chains}
        for side, info in chains.items():
            for f in range(F):
                S = bt_posF[info["t_upper"]][f]
                E_old = bt_posF[info["t_lower"]][f]
                W_old = bt_posF[info["t_hand"]][f]
                plane = _vcross(_vsub(E_old, S), _vsub(W_old, S))
                if _vlen(plane) < 1e-6: continue  # 传递姿态手臂完全伸直时无弯肘平面，保持该帧
                desired = desired_targets[side][f]
                l1, l2 = info["l1"], info["l2"]
                u = _vsub(desired, S)
                raw_dist = _vlen(u)
                d = min(max(raw_dist, info["reach_min"]), info["reach_max"])
                if raw_dist > info["reach_max"]:
                    # 目标超出臂展：手臂指向目标并完全伸展，属于该骨架的几何极限。
                    unreachable[side][f] = True
                u = _vnorm(u)
                cos_a = min(1.0, max(-1.0, (l1*l1 + d*d - l2*l2) / (2*l1*d)))
                sin_a = math.sqrt(1.0 - cos_a*cos_a)
                v = _vnorm(_vcross(_vnorm(plane), u))
                if _vdot(_vsub(E_old, S), v) < 0: sin_a = -sin_a
                e_dir = tuple(cos_a*u[k] + sin_a*v[k] for k in range(3))
                E_new = tuple(S[k] + e_dir[k]*l1 for k in range(3))
                w_dir = _vnorm(_vsub(desired, E_new))
                wq_upper = qmul(_arc(qrot_vec(bt_worldF[info["t_upper"]][f], info["child_upper"]), e_dir), bt_worldF[info["t_upper"]][f])
                wq_lower = qmul(_arc(qrot_vec(bt_worldF[info["t_lower"]][f], info["child_lower"]), w_dir), bt_worldF[info["t_lower"]][f])
                # 手保持传递的世界朝向，手指随之，不参与 IK。
                locals_ = (
                    (info["t_upper"], qmul(qconj(bt_worldF[info["t_clav"]][f]), wq_upper)),
                    (info["t_lower"], qmul(qconj(wq_upper), wq_lower)),
                    (info["t_hand"], qmul(qconj(wq_lower), bt_worldF[info["t_hand"]][f])),
                )
                for ui, lq in locals_:
                    prev = out_rot[ui][f-1] if f > 0 else None
                    lq = qnorm(lq)
                    if prev is not None and qdot(prev, lq) < 0:
                        lq = tuple(-x for x in lq)
                    out_rot[ui][f] = lq
        if ik_sides:
            print("arm end-effector IK applied on %s (scale %.3f)" % ("/".join(ik_sides), ik_scale))

    # 末端到达校验：源手腕-头最贴近的接触帧上，目标手腕相对头的高度差应与源一致。
    reach_failures = []
    ik_tracks = {ui: {"rotation": (grid, out_rot[ui])} for ui in out_rot}
    for ui, frames in out_trans.items():
        ik_tracks.setdefault(ui, {})["translation"] = (grid, frames)
    for side in ik_sides:
        a_hand = a_by_name.get("hand_" + side)
        t_hand = _bid("hand_" + side)
        t_head2 = _bid("head")
        src_d = [_vlen(_vsub(a_posF[a_hand][f], a_posF[a_head][f])) for f in range(F)]
        cf = min(range(F), key=lambda f: src_d[f])
        _Wc, Pc = compose(ik_tracks, grid[cf])
        src_dy = a_posF[a_hand][cf][1] - a_posF[a_head][cf][1]
        tgt_dy = Pc[t_hand][1] - Pc[t_head2][1]
        # 接触姿态（|src_dy| 小）要求严格；被动垂臂等远端姿态按比例放宽；
        # 目标超出臂展时手臂已满伸展指向目标，属于目标骨架的几何极限，放行。
        if unreachable[side][cf]:
            ok = True
            note = "(target beyond arm reach, fully extended)"
        else:
            ok = abs(tgt_dy - src_dy * ik_scale) <= max(0.05, 0.12 * abs(src_dy))
            note = ""
        print("reach check %s @t=%.2fs: src dy=%+.3f tgt dy=%+.3f -> %s %s" % (
            side, grid[cf], src_dy, tgt_dy, "PASS" if ok else "FAIL", note))
        if not ok: reach_failures.append(side)
    # 双手接触校验：源双手最贴近的帧，目标双手间距不得超过源间距×比例 + 5cm。
    if "l" in chains and "r" in chains:
        src_gap_curve = [
            _vlen(_vsub(a_posF[chains["l"]["a_hand"]][f], a_posF[chains["r"]["a_hand"]][f]))
            for f in range(F)
        ]
        cf = min(range(F), key=lambda f: src_gap_curve[f])
        if src_gap_curve[cf] <= 0.15:  # 只有源确实存在双手接触时才校验
            _Wc, Pc = compose(ik_tracks, grid[cf])
            tgt_gap = _vlen(_vsub(Pc[chains["l"]["t_hand"]], Pc[chains["r"]["t_hand"]]))
            limit = src_gap_curve[cf] * ik_scale + 0.05
            ok = tgt_gap <= limit
            print("hand-contact check @t=%.2fs: src gap=%.3f tgt gap=%.3f -> %s" % (
                grid[cf], src_gap_curve[cf], tgt_gap, "PASS" if ok else "FAIL"))
            if not ok: reach_failures.append("hand-contact")
    if reach_failures:
        raise SystemExit("arm end-effector IK failed for: %s" % ", ".join(reach_failures))

# ---------- 手指阻尼 ----------
# UAL2 是低模手：三节手指没有修正混合形，源动画的全握拳（每节 ~70°）完整
# 传递会把手指整根折进掌心，穿模成一团；源掌骨弯曲份量又因目标无此骨骼而
# 丢失，弯曲集中到三节上更尖锐。把手指相对站立基准的旋转增量按
# RETARGET_FINGER_SCALE（默认 0.6）缩放，握拳变成自然半握。
_finger_scale = float(_os.environ.get("RETARGET_FINGER_SCALE", "0.6"))
if _finger_scale < 0.999:
    import re as _re
    _finger_pat = _re.compile(r"(thumb|index|middle|ring|pinky)_0[123]_[lr]$")
    _damped = 0
    for ui in list(out_rot.keys()):
        nm = (bnodes[ui].get("name") or "").lower()
        if not _finger_pat.match(nm): continue
        base_l = target_base_local_rot.get(ui) or rest_rot(bnodes[ui])
        out_rot[ui] = [qslerp(base_l, lq, _finger_scale) for lq in out_rot[ui]]
        _damped += 1
    if _damped:
        print("finger damping x%.2f on %d joints" % (_finger_scale, _damped))

# IK 修正后刷新 SVG/位置所用姿态（沿用原中点帧）。
solved_tracks = {ui: {"rotation": (grid, out_rot[ui])} for ui in out_rot}
for ui, frames in out_trans.items():
    solved_tracks.setdefault(ui, {})["translation"] = (grid, frames)
Wt, Pt = compose(solved_tracks, tm)

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
