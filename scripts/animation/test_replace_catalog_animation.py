import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from replace_catalog_animation import (
    find_animation_index,
    read_glb,
    replace_animation,
    write_glb,
)


def build_glb_file(path, glb, buffer_bytes):
    write_glb(path, glb, buffer_bytes)
    return path


def rot(qs, times):
    """rotation track accessors: input SCALAR times + output VEC4 quats"""
    inputs = struct.pack("<%sf" % len(times), *times)
    outputs = b"".join(struct.pack("<4f", *q) for q in qs)
    return inputs, outputs, len(times)


class ReplaceCatalogAnimationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(self.enterContext(tempdir()))
        # 目录 GLB：两个动画（keep / target），各自带一条旋转轨道。
        times = [0.0, 0.5, 1.0]
        quats_a = [(0.0, 0.0, 0.0, 1.0)] * 3
        quats_b_old = [(0.0, 0.0, 0.0, 1.0)] * 3
        bin_parts = []
        accessors = []
        views = []
        offset = 0
        for data in (
            struct.pack("<3f", *times),
            b"".join(struct.pack("<4f", *q) for q in quats_a),
            struct.pack("<3f", *times),
            b"".join(struct.pack("<4f", *q) for q in quats_b_old),
        ):
            views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
            accessors.append({"bufferView": len(views) - 1, "componentType": 5126,
                              "count": len(times), "type": "SCALAR" if len(data) == len(times) * 4 and len(data) == 12 else "VEC4"})
            bin_parts.append(data)
            offset += len(data) + ((4 - len(data) % 4) % 4)
        # 修正上面简化判断：accessor 0/2 是 SCALAR(时间)，1/3 是 VEC4
        accessors[0]["type"] = "SCALAR"
        accessors[2]["type"] = "SCALAR"
        accessors[1]["type"] = "VEC4"
        accessors[3]["type"] = "VEC4"
        self.catalog_bin = b"".join(bin_parts)
        self.catalog = {
            "nodes": [{"name": "root"}, {"name": "pelvis"}],
            "accessors": accessors,
            "bufferViews": views,
            "buffers": [{"byteLength": len(self.catalog_bin)}],
            "animations": [
                {"name": "keep", "samplers": [{"input": 0, "output": 1}],
                 "channels": [{"target": {"node": 1, "path": "rotation"}, "sampler": 0}]},
                {"name": "target", "samplers": [{"input": 2, "output": 3}],
                 "channels": [{"target": {"node": 1, "path": "rotation"}, "sampler": 0}]},
            ],
        }
        # 替换 GLB：同名 target，姿态不同（绕 z 转 90°），buffer 独立。
        repl_inputs = struct.pack("<3f", *times)
        repl_outputs = b"".join(struct.pack("<4f", 0.0, 0.7071, 0.0, 0.7071) for _ in times)
        self.repl_bin = repl_inputs + b"\0" * 0 + repl_outputs
        self.replacement = {
            "nodes": [{"name": "root"}, {"name": "pelvis"}],
            "accessors": [
                {"bufferView": 0, "componentType": 5126, "count": 3, "type": "SCALAR"},
                {"bufferView": 1, "componentType": 5126, "count": 3, "type": "VEC4"},
            ],
            "bufferViews": [
                {"buffer": 0, "byteOffset": 0, "byteLength": 12},
                {"buffer": 0, "byteOffset": 12, "byteLength": 48},
            ],
            "buffers": [{"byteLength": len(self.repl_bin)}],
            "animations": [
                {"name": "target", "samplers": [{"input": 0, "output": 1}],
                 "channels": [{"target": {"node": 1, "path": "rotation"}, "sampler": 0}]},
            ],
        }

    def test_replaces_in_place_and_keeps_other_clips(self):
        out, buf = replace_animation(
            {**self.catalog, "accessors": [dict(a) for a in self.catalog["accessors"]],
             "bufferViews": [dict(v) for v in self.catalog["bufferViews"]],
             "animations": [dict(a) for a in self.catalog["animations"]]},
            self.catalog_bin,
            self.replacement,
            self.repl_bin,
            "target",
        )
        names = [a["name"] for a in out["animations"]]
        self.assertEqual(names, ["keep", "target"], "替换必须保持片段顺序")
        # keep 的采样器仍指向原 accessor（原 accessor 未删，索引不变）
        self.assertEqual(out["animations"][0]["samplers"][0]["output"], 1)
        # 新 accessor 追加在末尾，view 指向追加的 buffer 区段
        new_out = out["animations"][1]["samplers"][0]["output"]
        self.assertEqual(new_out, 5)
        new_view = out["bufferViews"][out["accessors"][new_out]["bufferView"]]
        self.assertEqual(new_view["byteOffset"], len(self.catalog_bin) + 12, "替换数据追加在旧 buffer 之后（时间轨道 12 字节本已对齐）")
        # 追加区段读出的就是替换姿态（绕 z 90°）
        q = struct.unpack_from("<4f", buf, new_view["byteOffset"])
        self.assertAlmostEqual(q[1], 0.7071, places=3)

    def test_rejects_mismatched_node_arrays(self):
        bad = {**self.replacement, "nodes": [{"name": "root"}]}
        with self.assertRaises(SystemExit):
            replace_animation(self.catalog, self.catalog_bin, bad, self.repl_bin, "target")

    def test_rejects_missing_animation_name(self):
        with self.assertRaises(SystemExit):
            replace_animation(self.catalog, self.catalog_bin, self.replacement, self.repl_bin, "missing")

    def test_glb_round_trip(self):
        path = build_glb_file(self.tmp / "t.glb", self.catalog, self.catalog_bin)
        glb, buf = read_glb(path)
        self.assertEqual([a["name"] for a in glb["animations"]], ["keep", "target"])
        self.assertEqual(len(buf), len(self.catalog_bin))


import contextlib


@contextlib.contextmanager
def tempdir():
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        yield Path(d)


if __name__ == "__main__":
    unittest.main()
