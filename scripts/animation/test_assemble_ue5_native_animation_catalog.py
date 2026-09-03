import struct
import sys
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from assemble_ue5_native_animation_catalog import (  # noqa: E402
    build_glb,
    merge_animation_glb,
    read_glb,
)


def make_glb(document, binary=b""):
    return build_glb(document, binary)


def make_fixture_documents():
    base = {
        "asset": {"version": "2.0", "generator": "test"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [
            {"name": "root", "children": [1]},
            {"name": "hand_l"},
        ],
        "skins": [{"joints": [0, 1], "skeleton": 0}],
        "meshes": [{"primitives": [{"attributes": {"JOINTS_0": 0, "WEIGHTS_0": 1}}]}],
        "buffers": [{"byteLength": 0}],
        "bufferViews": [],
        "accessors": [],
    }

    # Two tightly packed VEC3/VEC4 animation accessors: time, root translation.
    binary = struct.pack("<ff" "fff" "fff", 0.0, 1.0, 0.0, 0.0, 0.0, 0.4, 0.0, 0.0)
    animation = {
        "asset": {"version": "2.0", "generator": "test"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [
            {"name": "root", "children": [1]},
            {"name": "hand_l"},
        ],
        "skins": [{"joints": [0, 1], "skeleton": 0}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": 8},
            {"buffer": 0, "byteOffset": 8, "byteLength": 24},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 2, "type": "SCALAR", "min": [0], "max": [1]},
            {"bufferView": 1, "componentType": 5126, "count": 2, "type": "VEC3", "min": [0, 0, 0], "max": [0.4, 0, 0]},
        ],
        "animations": [{
            "name": "MM_Attack_01",
            "samplers": [{"input": 0, "output": 1, "interpolation": "LINEAR"}],
            "channels": [{"sampler": 0, "target": {"node": 0, "path": "translation"}}],
        }],
    }
    return base, animation, binary


class NativeAssemblyTest(unittest.TestCase):
    def test_merges_native_animation_by_joint_name_without_retargeting(self):
        base, animation, binary = make_fixture_documents()
        merged = merge_animation_glb(make_glb(base), make_glb(animation, binary), "C57_attack_01")
        document, merged_binary = read_glb(merged)

        self.assertEqual([item["name"] for item in document["animations"]], ["C57_attack_01"])
        channel = document["animations"][0]["channels"][0]
        self.assertEqual(channel["target"], {"node": 0, "path": "translation"})
        self.assertGreaterEqual(len(merged_binary), len(binary))
        self.assertEqual(document["buffers"][0]["byteLength"], len(merged_binary))

    def test_rejects_a_different_native_skeleton(self):
        base, animation, binary = make_fixture_documents()
        animation["nodes"][1]["name"] = "hand_r"
        with self.assertRaisesRegex(ValueError, "骨架|skeleton"):
            merge_animation_glb(make_glb(base), make_glb(animation, binary), "C57_attack_01")


if __name__ == "__main__":
    unittest.main()
