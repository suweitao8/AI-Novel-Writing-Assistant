"""Regression tests for the Anim57 bare-hand attack retarget contract."""

import os
import math
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_GLB = Path(os.environ.get(
    "CINE57_ATTACK_01_SOURCE",
    "D:/UnrealWorkspace/Cine57-exported/runs/20260903-anim57-unarmed-attack-smoke-v7/"
    "glb/anim57-unarmed-attack-mm-attack-01.glb",
))
TARGET_BASE_GLB = Path(os.environ.get(
    "CINE57_ANIMATION_BASE_GLB",
    "D:/UnrealWorkspace/Cine57-exported/base/UAL2_AnimationBase.glb",
))
PUBLISHED_CATALOG = REPO_ROOT / "client/public/anims/cine57/UAL2_UE_Anims.glb"
ATTACK_01 = "C57_anim57_unarmed_attack_mm_attack_01"
ATTACK_02 = "C57_anim57_unarmed_attack_mm_attack_02"
ATTACK_NAMES = (
    ATTACK_01,
    ATTACK_02,
    "C57_anim57_unarmed_attack_mm_attack_03",
    "C57_anim57_unarmed_attack_mm_charged_attack",
)

# The exported source uses five spine joints while UAL2 has three.  These are
# the anatomical correspondences that must be compared after collapsing the
# source chain; comparing equal-numbered names would let a twisted torso pass.
COLLAPSED_TORSO_SEGMENTS = (
    ("pelvis", "spine_01", "pelvis", "spine_03"),
    ("spine_01", "spine_02", "spine_03", "spine_04"),
    ("spine_02", "spine_03", "spine_04", "spine_05"),
    ("spine_03", "neck_01", "spine_05", "neck_02"),
    ("neck_01", "head", "neck_02", "head"),
)


sys.path.insert(0, str(Path(__file__).parent))
from test_run_forward_retarget import (  # noqa: E402
    animation_by_name,
    direction,
    load_animation,
    parents,
    read_accessor,
    read_glb,
    sample,
    topological_order,
    world_positions,
)


ACCESSOR_COMPONENT_COUNTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}
ACCESSOR_COMPONENT_FORMATS = {
    5120: "b",
    5121: "B",
    5122: "h",
    5123: "H",
    5125: "I",
    5126: "f",
}
ACCESSOR_COMPONENT_SIZES = {
    5120: 1,
    5121: 1,
    5122: 2,
    5123: 2,
    5125: 4,
    5126: 4,
}


def read_generic_accessor(glb, binary, accessor_index):
    accessor = glb["accessors"][accessor_index]
    view = glb["bufferViews"][accessor["bufferView"]]
    component_count = ACCESSOR_COMPONENT_COUNTS[accessor["type"]]
    component_type = accessor["componentType"]
    component_size = ACCESSOR_COMPONENT_SIZES[component_type]
    stride = view.get("byteStride", component_count * component_size)
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    component_format = ACCESSOR_COMPONENT_FORMATS[component_type]
    return [
        struct.unpack_from(
            f"<{component_format * component_count}",
            binary,
            offset + row * stride,
        )
        for row in range(accessor["count"])
    ]


def matrix_multiply(left, right):
    return tuple(
        sum(left[row * 4 + pivot] * right[pivot * 4 + column] for pivot in range(4))
        for row in range(4)
        for column in range(4)
    )


def matrix_vector(matrix, vector):
    return tuple(
        sum(matrix[row * 4 + column] * vector[column] for column in range(4))
        for row in range(4)
    )


def matrix_inverse_affine(matrix):
    values = [matrix[row * 4 + column] for row in range(3) for column in range(3)]
    determinant = (
        values[0] * (values[4] * values[8] - values[5] * values[7])
        - values[1] * (values[3] * values[8] - values[5] * values[6])
        + values[2] * (values[3] * values[7] - values[4] * values[6])
    )
    if abs(determinant) < 1e-10:
        raise ValueError("mesh transform is singular")
    inverse = (
        (values[4] * values[8] - values[5] * values[7]) / determinant,
        (values[2] * values[7] - values[1] * values[8]) / determinant,
        (values[1] * values[5] - values[2] * values[4]) / determinant,
        (values[5] * values[6] - values[3] * values[8]) / determinant,
        (values[0] * values[8] - values[2] * values[6]) / determinant,
        (values[2] * values[3] - values[0] * values[5]) / determinant,
        (values[3] * values[7] - values[4] * values[6]) / determinant,
        (values[1] * values[6] - values[0] * values[7]) / determinant,
        (values[0] * values[4] - values[1] * values[3]) / determinant,
    )
    translation = matrix[3], matrix[7], matrix[11]
    return (
        inverse[0], inverse[1], inverse[2], 0,
        inverse[3], inverse[4], inverse[5], 0,
        inverse[6], inverse[7], inverse[8], 0,
        -(inverse[0] * translation[0] + inverse[1] * translation[1] + inverse[2] * translation[2]),
        -(inverse[3] * translation[0] + inverse[4] * translation[1] + inverse[5] * translation[2]),
        -(inverse[6] * translation[0] + inverse[7] * translation[1] + inverse[8] * translation[2]),
        1,
    )


def quaternion_matrix(quaternion):
    x, y, z, w = quaternion
    return (
        1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0,
        2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0,
        2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0,
        0, 0, 0, 1,
    )


def node_matrix(node, rotation=None, translation=None):
    if "matrix" in node:
        return tuple(
            node["matrix"][column * 4 + row]
            for row in range(4)
            for column in range(4)
        )
    scale = node.get("scale", (1, 1, 1))
    rotation_matrix = quaternion_matrix(
        rotation if rotation is not None else node.get("rotation", (0, 0, 0, 1))
    )
    position = translation if translation is not None else node.get("translation", (0, 0, 0))
    return (
        rotation_matrix[0] * scale[0], rotation_matrix[1] * scale[1], rotation_matrix[2] * scale[2], position[0],
        rotation_matrix[4] * scale[0], rotation_matrix[5] * scale[1], rotation_matrix[6] * scale[2], position[1],
        rotation_matrix[8] * scale[0], rotation_matrix[9] * scale[1], rotation_matrix[10] * scale[2], position[2],
        0, 0, 0, 1,
    )


def animation_world_matrices(glb, binary, animation_name, time):
    tracks = load_animation(glb, binary, animation_name)
    parent_map = parents(glb)
    worlds = {}
    for index in topological_order(glb, parent_map):
        node = glb["nodes"][index]
        track = tracks.get(index, {})
        rotation = sample(track["rotation"], time) if "rotation" in track else None
        translation = sample(track["translation"], time) if "translation" in track else None
        local = node_matrix(node, rotation, translation)
        parent_index = parent_map.get(index)
        worlds[index] = (
            matrix_multiply(worlds[parent_index], local)
            if parent_index is not None
            else local
        )
    return worlds


def skinned_minimum_y(glb, binary, animation_name):
    animation = animation_by_name(glb, animation_name)
    tracks = load_animation(glb, binary, animation_name)
    times = next(track["rotation"][0] for track in tracks.values() if "rotation" in track)
    mesh_node_index = next(index for index, node in enumerate(glb["nodes"]) if node.get("mesh") == 0)
    mesh_world = animation_world_matrices(glb, binary, animation_name, times[0])[mesh_node_index]
    mesh_inverse = matrix_inverse_affine(mesh_world)
    skin = glb["skins"][0]
    inverse_bind_matrices = [
        tuple(raw[column * 4 + row] for row in range(4) for column in range(4))
        for raw in read_generic_accessor(glb, binary, skin["inverseBindMatrices"])
    ]
    vertices = []
    for primitive in glb["meshes"][0]["primitives"]:
        positions = read_generic_accessor(glb, binary, primitive["attributes"]["POSITION"])
        joints = read_generic_accessor(glb, binary, primitive["attributes"]["JOINTS_0"])
        weights = read_generic_accessor(glb, binary, primitive["attributes"]["WEIGHTS_0"])
        vertices.extend(
            (
                (position[0], position[1], position[2], 1),
                tuple(zip(joint_row, weight_row)),
            )
            for position, joint_row, weight_row in zip(positions, joints, weights)
        )

    minimum_y = float("inf")
    minimum_frame = None
    for frame, time in enumerate(times):
        worlds = animation_world_matrices(glb, binary, animation_name, time)
        joint_matrices = [
            matrix_multiply(
                matrix_multiply(mesh_inverse, worlds[joint]),
                inverse_bind_matrices[index],
            )
            for index, joint in enumerate(skin["joints"])
        ]
        frame_minimum = float("inf")
        for vertex, influences in vertices:
            deformed = [0, 0, 0, 0]
            for joint_index, weight in influences:
                transformed = matrix_vector(joint_matrices[joint_index], vertex)
                for component in range(4):
                    deformed[component] += transformed[component] * weight
            world_vertex = matrix_vector(mesh_world, deformed)
            frame_minimum = min(frame_minimum, world_vertex[1])
        if frame_minimum < minimum_y:
            minimum_y = frame_minimum
            minimum_frame = frame
    return minimum_y, minimum_frame


class AttackRetargetTest(unittest.TestCase):
    def test_attack_01_preserves_collapsed_torso_direction(self):
        if not SOURCE_GLB.is_file() or not TARGET_BASE_GLB.is_file():
            self.skipTest("Anim57 attack source/base GLB is not available")

        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "attack-01.glb"
            environment = {
                key: value
                for key, value in os.environ.items()
                if key not in {"RETARGET_USE_LIMB_IK", "RETARGET_NO_ARM_IK"}
            }
            completed = subprocess.run(
                [
                    sys.executable,
                    str(REPO_ROOT / "scripts/animation/retarget_ual2.py"),
                    str(SOURCE_GLB),
                    str(TARGET_BASE_GLB),
                    str(output),
                    ATTACK_01,
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                env=environment,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)

            source_glb, source_binary = read_glb(SOURCE_GLB)
            output_glb, output_binary = read_glb(output)
            source_tracks = load_animation(source_glb, source_binary)
            output_tracks = load_animation(output_glb, output_binary, ATTACK_01)
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

            minimum_alignment = 1.0
            worst_frame = None
            for frame, time in enumerate(source_times):
                source_positions = world_positions(source_glb, source_tracks, time)
                output_positions = world_positions(output_glb, output_tracks, time)
                for target_parent, target_child, source_parent, source_child in COLLAPSED_TORSO_SEGMENTS:
                    source_direction = direction(
                        source_positions,
                        source_names,
                        source_parent,
                        source_child,
                    )
                    output_direction = direction(
                        output_positions,
                        output_names,
                        target_parent,
                        target_child,
                    )
                    alignment = sum(
                        source_direction[index] * output_direction[index]
                        for index in range(3)
                    )
                    if alignment < minimum_alignment:
                        minimum_alignment = alignment
                        worst_frame = (frame, target_parent, target_child)

            self.assertGreaterEqual(
                minimum_alignment,
                0.94,
                f"collapsed torso direction drifted at {worst_frame}: {minimum_alignment:.4f}",
            )

    def test_attack_02_hand_head_contact_does_not_fail_reach_gate(self):
        attack_02_source = SOURCE_GLB.with_name(
            "anim57-unarmed-attack-mm-attack-02.glb"
        )
        if not attack_02_source.is_file() or not TARGET_BASE_GLB.is_file():
            self.skipTest("Anim57 attack source/base GLB is not available")

        with tempfile.TemporaryDirectory() as temporary_directory:
            output = Path(temporary_directory) / "attack-02.glb"
            environment = {
                key: value
                for key, value in os.environ.items()
                if key not in {"RETARGET_USE_LIMB_IK", "RETARGET_NO_ARM_IK"}
            }
            completed = subprocess.run(
                [
                    sys.executable,
                    str(REPO_ROOT / "scripts/animation/retarget_ual2.py"),
                    str(attack_02_source),
                    str(TARGET_BASE_GLB),
                    str(output),
                    ATTACK_02,
                ],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                env=environment,
                check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
            self.assertIn("hand-head check", completed.stdout)

    def test_published_attack_root_translation_lifts_feet_clear_of_ground(self):
        self.assertTrue(PUBLISHED_CATALOG.is_file(), "published animation catalog is missing")
        catalog_glb, catalog_binary = read_glb(PUBLISHED_CATALOG)
        root_index = next(
            index
            for index, node in enumerate(catalog_glb["nodes"])
            if node.get("name", "").lower() == "root"
        )

        for animation_name in ATTACK_NAMES:
            animation = animation_by_name(catalog_glb, animation_name)
            self.assertIsNotNone(animation, f"missing published animation: {animation_name}")
            root_channels = [
                channel
                for channel in animation["channels"]
                if channel["target"] == {"node": root_index, "path": "translation"}
            ]
            self.assertEqual(
                len(root_channels),
                1,
                f"{animation_name} must carry a root translation ground offset",
            )
            sampler = animation["samplers"][root_channels[0]["sampler"]]
            translations = read_accessor(catalog_glb, catalog_binary, sampler["output"])
            minimum_y = min(value[1] for value in translations)
            self.assertGreaterEqual(
                minimum_y,
                0.14,
                f"{animation_name} root lift is too small: min y={minimum_y:.4f}",
            )

    def test_published_attack_skinned_geometry_stays_above_ground(self):
        self.assertTrue(PUBLISHED_CATALOG.is_file(), "published animation catalog is missing")
        catalog_glb, catalog_binary = read_glb(PUBLISHED_CATALOG)

        for animation_name in ATTACK_NAMES:
            minimum_y, minimum_frame = skinned_minimum_y(
                catalog_glb,
                catalog_binary,
                animation_name,
            )
            self.assertGreaterEqual(
                minimum_y,
                0.01,
                f"{animation_name} skinned geometry penetrates ground at frame "
                f"{minimum_frame}: min y={minimum_y:.4f}",
            )


if __name__ == "__main__":
    unittest.main()
