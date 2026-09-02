# -*- coding: utf-8 -*-
"""Regression test for retargeting the Cine57 run-forward body chain."""

import json
import math
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_GLB = Path(os.environ.get(
    "CINE57_RUN_FORWARD_SOURCE",
    "D:/UnrealWorkspace/Cine57-exported/animation_catalog/"
    "unreal-daily-male-locomotion-run-forward.glb",
))
TARGET_GLB = REPO_ROOT / "client/public/viewer-kit/quaternius/ual2/UAL2_Standard.glb"
PUBLISHED_CATALOG = REPO_ROOT / "client/public/anims/cine57/UAL2_UE_Anims.glb"
ACTIVE_SELECTION = REPO_ROOT / "scripts/animation/animationCatalogSelection.json"
REFERENCE_FIXTURE = REPO_ROOT / "scripts/animation/fixtures/run_forward_body_segments.json"
ANIMATION_NAME = "C57_unreal_daily_male_locomotion_run_forward"
BODY_SEGMENTS = (
    ("pelvis", "spine_01"),
    ("spine_01", "spine_02"),
    ("spine_02", "spine_03"),
    ("spine_03", "neck_01"),
    ("neck_01", "head"),
    ("clavicle_l", "upperarm_l"),
    ("upperarm_l", "lowerarm_l"),
    ("lowerarm_l", "hand_l"),
    ("clavicle_r", "upperarm_r"),
    ("upperarm_r", "lowerarm_r"),
    ("lowerarm_r", "hand_r"),
    ("thigh_l", "calf_l"),
    ("calf_l", "foot_l"),
    ("thigh_r", "calf_r"),
    ("calf_r", "foot_r"),
)


def read_glb(path):
    data = Path(path).read_bytes()
    json_length = struct.unpack_from("<I", data, 12)[0]
    glb = json.loads(data[20:20 + json_length].decode("utf-8"))
    binary_header = 20 + json_length
    binary_length = struct.unpack_from("<I", data, binary_header)[0]
    return glb, data[binary_header + 8:binary_header + 8 + binary_length]


def read_accessor(glb, binary, index):
    accessor = glb["accessors"][index]
    view = glb["bufferViews"][accessor["bufferView"]]
    components = {"SCALAR": 1, "VEC3": 3, "VEC4": 4}[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    values = struct.unpack_from(
        "<%df" % (accessor["count"] * components),
        binary,
        offset,
    )
    return [
        tuple(values[row * components:(row + 1) * components])
        for row in range(accessor["count"])
    ]


def load_animation(glb, binary, name=None):
    animation = next(
        animation
        for animation in glb.get("animations", [])
        if name is None or animation.get("name") == name
    )
    tracks = {}
    for channel in animation["channels"]:
        sampler = animation["samplers"][channel["sampler"]]
        tracks.setdefault(channel["target"]["node"], {})[
            channel["target"]["path"]
        ] = (
            [row[0] for row in read_accessor(glb, binary, sampler["input"])],
            read_accessor(glb, binary, sampler["output"]),
        )
    return tracks


def animation_by_name(glb, name):
    return next(
        (animation for animation in glb.get("animations", [])
         if animation.get("name") == name),
        None,
    )


def read_body_reference():
    return json.loads(REFERENCE_FIXTURE.read_text(encoding="utf-8"))


def qmul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by + ay * bw + az * bx - ax * bz,
        aw * bz + az * bw + ax * by - ay * bx,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def qnorm(q):
    length = math.sqrt(sum(value * value for value in q))
    return tuple(value / length for value in q)


def qrot(q, vector):
    x, y, z, w = q
    uv = (
        y * vector[2] - z * vector[1],
        z * vector[0] - x * vector[2],
        x * vector[1] - y * vector[0],
    )
    uuv = (
        y * uv[2] - z * uv[1],
        z * uv[0] - x * uv[2],
        x * uv[1] - y * uv[0],
    )
    return tuple(
        vector[index] + 2 * (w * uv[index] + uuv[index])
        for index in range(3)
    )


def parents(glb):
    return {
        child: index
        for index, node in enumerate(glb["nodes"])
        for child in node.get("children", [])
    }


def topological_order(glb, parent):
    order = []
    seen = set()

    def visit(index):
        if index in seen:
            return
        if index in parent:
            visit(parent[index])
        seen.add(index)
        order.append(index)

    for index in range(len(glb["nodes"])):
        visit(index)
    return order


def sample(track, time):
    times, values = track
    if time <= times[0]:
        return values[0]
    if time >= times[-1]:
        return values[-1]
    index = 0
    while index < len(times) - 2 and times[index + 1] <= time:
        index += 1
    fraction = (time - times[index]) / (times[index + 1] - times[index])
    left, right = values[index], values[index + 1]
    if len(left) == 4:
        left = qnorm(left)
        right = qnorm(right)
        dot = sum(left[component] * right[component] for component in range(4))
        if dot < 0:
            right = tuple(-value for value in right)
            dot = -dot
        if dot > 0.9995:
            return qnorm(tuple(
                left[component] + (right[component] - left[component]) * fraction
                for component in range(4)
            ))
        angle = math.acos(min(1.0, dot))
        sine = math.sin(angle)
        return tuple(
            (left[component] * math.sin((1 - fraction) * angle) +
             right[component] * math.sin(fraction * angle)) / sine
            for component in range(4)
        )
    return tuple(
        left[component] + (right[component] - left[component]) * fraction
        for component in range(len(left))
    )


def world_positions(glb, tracks, time):
    parent = parents(glb)
    positions = {}
    rotations = {}
    for index in topological_order(glb, parent):
        node = glb["nodes"][index]
        rotation = qnorm(tuple(node.get("rotation", (0, 0, 0, 1))))
        translation = tuple(node.get("translation", (0, 0, 0)))
        track = tracks.get(index, {})
        if "rotation" in track:
            rotation = qnorm(sample(track["rotation"], time))
        if "translation" in track:
            translation = sample(track["translation"], time)
        parent_index = parent.get(index)
        if parent_index is None:
            rotations[index] = rotation
            positions[index] = translation
            continue
        rotations[index] = qmul(rotations[parent_index], rotation)
        offset = qrot(rotations[parent_index], translation)
        positions[index] = tuple(
            positions[parent_index][component] + offset[component]
            for component in range(3)
        )
    return positions


def direction(positions, by_name, parent_name, child_name):
    start = positions[by_name[parent_name]]
    end = positions[by_name[child_name]]
    vector = tuple(end[index] - start[index] for index in range(3))
    length = math.sqrt(sum(value * value for value in vector))
    return tuple(value / length for value in vector)


class RunForwardRetargetTest(unittest.TestCase):
    def assert_body_chain_follows_source(self, source_path, output_path):
        source_glb, source_binary = read_glb(source_path)
        output_glb, output_binary = read_glb(output_path)
        source_tracks = load_animation(source_glb, source_binary)
        output_tracks = load_animation(output_glb, output_binary, ANIMATION_NAME)
        source_times = next(
            track["rotation"][0]
            for track in source_tracks.values()
            if "rotation" in track
        )
        source_names = {
            node.get("name", "").lower(): index
            for index, node in enumerate(source_glb["nodes"])
        }
        output_names = {
            node.get("name", "").lower(): index
            for index, node in enumerate(output_glb["nodes"])
        }

        for frame, time in enumerate(source_times):
            source_positions = world_positions(source_glb, source_tracks, time)
            output_positions = world_positions(output_glb, output_tracks, time)
            for parent_name, child_name in BODY_SEGMENTS:
                source_direction = direction(
                    source_positions, source_names, parent_name, child_name,
                )
                output_direction = direction(
                    output_positions, output_names, parent_name, child_name,
                )
                alignment = sum(
                    source_direction[index] * output_direction[index]
                    for index in range(3)
                )
                self.assertGreaterEqual(
                    alignment,
                    0.985,
                    f"frame {frame}: {parent_name}->{child_name} direction drifted",
                )

    def assert_output_matches_reference(self, output_path, reference):
        output_glb, output_binary = read_glb(output_path)
        output_tracks = load_animation(output_glb, output_binary, ANIMATION_NAME)
        output_names = {
            node.get("name", "").lower(): index
            for index, node in enumerate(output_glb["nodes"])
        }
        reference_times = reference["times"]
        for frame, time in enumerate(reference_times):
            output_positions = world_positions(output_glb, output_tracks, time)
            for parent_name, child_name in BODY_SEGMENTS:
                output_direction = direction(
                    output_positions, output_names, parent_name, child_name,
                )
                source_direction = reference["segments"][
                    f"{parent_name}->{child_name}"
                ][frame]
                alignment = sum(
                    source_direction[index] * output_direction[index]
                    for index in range(3)
                )
                self.assertGreaterEqual(
                    alignment,
                    0.985,
                    f"published frame {frame}: {parent_name}->{child_name} direction drifted",
                )

    def test_body_chain_directions_follow_source_animation(self):
        if not SOURCE_GLB.is_file():
            self.skipTest("Cine57 run-forward source GLB is not available")

        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "run-forward.glb"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(REPO_ROOT / "scripts/animation/retarget_ual2.py"),
                    str(SOURCE_GLB),
                    str(TARGET_GLB),
                    str(output),
                    ANIMATION_NAME,
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                env={
                    key: value
                    for key, value in os.environ.items()
                    if key not in {"RETARGET_USE_LIMB_IK", "RETARGET_NO_ARM_IK"}
                },
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            self.assert_body_chain_follows_source(SOURCE_GLB, output)

    def test_published_catalog_contains_valid_run_forward_track(self):
        self.assertTrue(
            PUBLISHED_CATALOG.is_file(),
            f"published animation catalog is missing: {PUBLISHED_CATALOG}",
        )
        catalog_glb, catalog_binary = read_glb(PUBLISHED_CATALOG)
        animation = animation_by_name(catalog_glb, ANIMATION_NAME)
        if ACTIVE_SELECTION.is_file():
            selection = json.loads(ACTIVE_SELECTION.read_text(encoding="utf-8"))
            selected_names = {
                clip.get("clipName")
                for clip in selection.get("clips", [])
            }
            if ANIMATION_NAME not in selected_names:
                self.assertIsNone(
                    animation,
                    "当前动画 smoke 清单未选中 run-forward，活动 GLB 不应残留该旧片段",
                )
                return
        self.assertIsNotNone(animation, "published run-forward animation is missing")
        self.assertEqual(len(animation["channels"]), 55)
        self.assertEqual(len(animation["samplers"]), 55)

        skin_joint_indices = {
            joint
            for skin in catalog_glb.get("skins", [])
            for joint in skin.get("joints", [])
        }
        self.assertTrue(skin_joint_indices, "published catalog has no skin joints")
        for channel in animation["channels"]:
            target = channel["target"]
            self.assertIn(target["node"], skin_joint_indices)
            self.assertIn(target["path"], {"rotation", "translation"})
            sampler = animation["samplers"][channel["sampler"]]
            input_accessor = catalog_glb["accessors"][sampler["input"]]
            output_accessor = catalog_glb["accessors"][sampler["output"]]
            self.assertEqual(input_accessor["type"], "SCALAR")
            self.assertEqual(input_accessor["count"], 15)
            self.assertEqual(output_accessor["count"], input_accessor["count"])
            expected_type = "VEC4" if target["path"] == "rotation" else "VEC3"
            self.assertEqual(output_accessor["type"], expected_type)
            if target["path"] == "rotation":
                for quaternion in read_accessor(
                    catalog_glb, catalog_binary, sampler["output"],
                ):
                    self.assertTrue(all(math.isfinite(value) for value in quaternion))
                    self.assertAlmostEqual(
                        math.sqrt(sum(value * value for value in quaternion)),
                        1.0,
                        places=3,
                    )

        published_tracks = load_animation(
            catalog_glb, catalog_binary, ANIMATION_NAME,
        )
        published_times = next(
            track["rotation"][0]
            for track in published_tracks.values()
            if "rotation" in track
        )
        published_names = {
            node.get("name", "").lower(): index
            for index, node in enumerate(catalog_glb["nodes"])
        }
        published_positions = [
            world_positions(catalog_glb, published_tracks, time)
            for time in published_times
        ]
        for frame, positions in enumerate(published_positions):
            for parent_name, child_name in BODY_SEGMENTS:
                start = positions[published_names[parent_name]]
                end = positions[published_names[child_name]]
                length = math.sqrt(
                    sum((end[index] - start[index]) ** 2 for index in range(3))
                )
                self.assertTrue(
                    math.isfinite(length) and length > 1e-4,
                    f"published frame {frame}: {parent_name}->{child_name} is degenerate",
                )
        for endpoint in ("foot_l", "foot_r", "hand_l", "hand_r"):
            trajectory = [
                positions[published_names[endpoint]]
                for positions in published_positions
            ]
            self.assertGreater(
                max(
                    math.sqrt(
                        sum((position[index] - trajectory[0][index]) ** 2
                            for index in range(3))
                    )
                    for position in trajectory
                ),
                0.01,
                f"published {endpoint} track is static",
            )

        self.assertTrue(REFERENCE_FIXTURE.is_file(), "body-chain reference fixture is missing")
        reference = read_body_reference()
        self.assertEqual(len(reference["times"]), len(published_times))
        self.assert_output_matches_reference(PUBLISHED_CATALOG, reference)

        if SOURCE_GLB.is_file():
            self.assert_body_chain_follows_source(SOURCE_GLB, PUBLISHED_CATALOG)

    def test_forced_limb_ik_passes_final_gate(self):
        if not SOURCE_GLB.is_file():
            self.skipTest("Cine57 run-forward source GLB is not available")

        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "run-forward-forced-ik.glb"
            environment = {
                key: value
                for key, value in os.environ.items()
                if key not in {"RETARGET_USE_LIMB_IK", "RETARGET_NO_ARM_IK"}
            }
            environment["RETARGET_USE_LIMB_IK"] = "1"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(REPO_ROOT / "scripts/animation/retarget_ual2.py"),
                    str(SOURCE_GLB),
                    str(TARGET_GLB),
                    str(output),
                    ANIMATION_NAME,
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                env=environment,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            output_glb, output_binary = read_glb(output)
            output_animation = animation_by_name(output_glb, ANIMATION_NAME)
            self.assertIsNotNone(output_animation)
            self.assertEqual(len(output_animation["channels"]), 55)


if __name__ == "__main__":
    unittest.main()
