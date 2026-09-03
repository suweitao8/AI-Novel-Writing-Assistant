# -*- coding: utf-8 -*-
"""Assemble native UE5 skeletal meshes and AnimSequences into paired GLBs.

The source mesh and every animation are exported by UE5's GLTFExporter from
the same native ``SK_Mannequin`` skeleton.  This module only remaps animation
node indices by bone name and copies the animation accessors into the mesh
container.  It deliberately contains no retargeting, IK, axis correction, or
bone transform math: a skeleton mismatch is a hard error.
"""

import argparse
import copy
import json
import math
import statistics
import struct
from pathlib import Path


MOTION_MODES = {"in-place", "root-motion"}
ROOT_TRANSLATION_MAX_RANGE_METERS = 0.03
EXPECTED_PROFILES = ("manny", "quinn")
BASE_POSE_CLIP_NAME = "standing"


def _align4(value):
    return (value + 3) & ~3


def read_glb(path_or_bytes):
    data = Path(path_or_bytes).read_bytes() if isinstance(path_or_bytes, (str, Path)) else bytes(path_or_bytes)
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError("not a GLB")
    version, total_length = struct.unpack_from("<II", data, 4)
    if version != 2:
        raise ValueError("only GLB version 2 is supported")
    if total_length > len(data):
        raise ValueError("GLB length exceeds file size")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("GLB does not start with a JSON chunk")
    json_start = 20
    json_end = json_start + json_length
    document = json.loads(data[json_start:json_end].decode("utf-8"))
    cursor = json_end
    if cursor + 8 > len(data):
        raise ValueError("GLB has no binary chunk")
    binary_length, binary_type = struct.unpack_from("<II", data, cursor)
    if binary_type != 0x004E4942:
        raise ValueError("GLB has no BIN chunk")
    binary_start = cursor + 8
    binary_end = binary_start + binary_length
    if binary_end > len(data):
        raise ValueError("GLB binary chunk exceeds file size")
    return document, data[binary_start:binary_end]


def build_glb(document, binary=b""):
    output_document = copy.deepcopy(document)
    output_document.setdefault("buffers", [{"byteLength": len(binary)}])
    if not output_document["buffers"]:
        output_document["buffers"] = [{"byteLength": len(binary)}]
    output_document["buffers"][0]["byteLength"] = len(binary)
    json_bytes = json.dumps(
        output_document,
        ensure_ascii=False,
        separators=(",", ":"),
    ).encode("utf-8")
    json_bytes += b" " * ((_align4(len(json_bytes))) - len(json_bytes))
    binary_bytes = bytes(binary)
    binary_bytes += b"\0" * ((_align4(len(binary_bytes))) - len(binary_bytes))
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary_bytes)
    return b"".join(
        (
            struct.pack("<4sII", b"glTF", 2, total_length),
            struct.pack("<II", len(json_bytes), 0x4E4F534A),
            json_bytes,
            struct.pack("<II", len(binary_bytes), 0x004E4942),
            binary_bytes,
        )
    )


def _node_name_map(document, label):
    names = {}
    for index, node in enumerate(document.get("nodes", [])):
        name = str(node.get("name", "")).strip()
        if not name:
            continue
        key = name.casefold()
        if key in names:
            raise ValueError("%s contains duplicate node name %s" % (label, name))
        names[key] = (index, name)
    return names


def _skin_joint_names(document, label):
    skins = document.get("skins", [])
    if len(skins) != 1:
        raise ValueError("%s must contain exactly one native skeleton skin" % label)
    skin = skins[0]
    nodes = document.get("nodes", [])
    joints = skin.get("joints")
    if not isinstance(joints, list) or not joints:
        raise ValueError("%s native skeleton has no joints" % label)
    names = []
    for joint in joints:
        if not isinstance(joint, int) or joint < 0 or joint >= len(nodes):
            raise ValueError("%s native skeleton has an invalid joint index" % label)
        name = str(nodes[joint].get("name", "")).strip()
        if not name:
            raise ValueError("%s native skeleton contains an unnamed joint" % label)
        names.append(name)
    normalized = [name.casefold() for name in names]
    if len(set(normalized)) != len(normalized):
        raise ValueError("%s native skeleton contains duplicate joint names" % label)
    return names


def validate_native_skeleton(base_document, animation_document):
    """Return the source-to-base node map after enforcing a native skeleton match."""

    base_nodes = _node_name_map(base_document, "base mesh")
    animation_nodes = _node_name_map(animation_document, "animation")
    base_joints = _skin_joint_names(base_document, "base mesh")
    animation_joints = _skin_joint_names(animation_document, "animation")
    base_joint_keys = {name.casefold() for name in base_joints}
    animation_joint_keys = {name.casefold() for name in animation_joints}
    if base_joint_keys != animation_joint_keys:
        missing = sorted(base_joint_keys - animation_joint_keys)
        extra = sorted(animation_joint_keys - base_joint_keys)
        raise ValueError(
            "native skeleton mismatch: missing=%s extra=%s"
            % (missing[:8], extra[:8])
        )

    base_skin = base_document["skins"][0]
    animation_skin = animation_document["skins"][0]
    for label, document, skin, nodes in (
        ("base mesh", base_document, base_skin, base_nodes),
        ("animation", animation_document, animation_skin, animation_nodes),
    ):
        skeleton_index = skin.get("skeleton")
        if skeleton_index is not None:
            if not isinstance(skeleton_index, int) or skeleton_index not in range(len(document.get("nodes", []))):
                raise ValueError("%s native skeleton root index is invalid" % label)
    base_root = base_skin.get("skeleton")
    animation_root = animation_skin.get("skeleton")
    if base_root is not None and animation_root is not None:
        base_root_name = str(base_document["nodes"][base_root].get("name", "")).casefold()
        animation_root_name = str(animation_document["nodes"][animation_root].get("name", "")).casefold()
        if base_root_name != animation_root_name:
            raise ValueError(
                "native skeleton root mismatch: %s != %s"
                % (base_root_name, animation_root_name)
            )

    node_map = {}
    for source_index, (key, (_index, source_name)) in enumerate(animation_nodes.items()):
        _ = source_index
        if key in base_nodes:
            node_map[_index] = base_nodes[key][0]
    return node_map


def _source_view_bytes(document, binary, view_index):
    views = document.get("bufferViews", [])
    if not isinstance(view_index, int) or view_index < 0 or view_index >= len(views):
        raise ValueError("animation references an invalid bufferView")
    view = views[view_index]
    if view.get("buffer", 0) != 0:
        raise ValueError("animation GLB must use buffer 0")
    offset = int(view.get("byteOffset", 0))
    length = int(view.get("byteLength", 0))
    if offset < 0 or length < 0 or offset + length > len(binary):
        raise ValueError("animation bufferView exceeds its GLB binary chunk")
    return binary[offset:offset + length]


def merge_animation_glb(base_glb, animation_glb, animation_name):
    """Append one native animation to a mesh GLB and return new GLB bytes."""

    base_document, base_binary = read_glb(base_glb)
    animation_document, animation_binary = read_glb(animation_glb)
    if not isinstance(animation_name, str) or not animation_name.strip():
        raise ValueError("animation name must be non-empty")
    animations = animation_document.get("animations", [])
    if len(animations) != 1:
        raise ValueError("native animation GLB must contain exactly one animation")
    source_animation = animations[0]
    if any(item.get("name") == animation_name for item in base_document.get("animations", [])):
        raise ValueError("duplicate animation name: %s" % animation_name)
    source_to_base_nodes = validate_native_skeleton(base_document, animation_document)

    base_document.setdefault("accessors", [])
    base_document.setdefault("bufferViews", [])
    base_document.setdefault("animations", [])
    merged_binary = bytearray(base_binary)
    source_view_to_base_view = {}
    source_accessor_to_base_accessor = {}

    def copy_view(source_view_index):
        if source_view_index in source_view_to_base_view:
            return source_view_to_base_view[source_view_index]
        source_view = animation_document["bufferViews"][source_view_index]
        payload = _source_view_bytes(animation_document, animation_binary, source_view_index)
        aligned_offset = _align4(len(merged_binary))
        merged_binary.extend(b"\0" * (aligned_offset - len(merged_binary)))
        merged_binary.extend(payload)
        destination_view = copy.deepcopy(source_view)
        destination_view["buffer"] = 0
        destination_view["byteOffset"] = aligned_offset
        destination_index = len(base_document["bufferViews"])
        base_document["bufferViews"].append(destination_view)
        source_view_to_base_view[source_view_index] = destination_index
        return destination_index

    def copy_accessor(source_accessor_index):
        if source_accessor_index in source_accessor_to_base_accessor:
            return source_accessor_to_base_accessor[source_accessor_index]
        source_accessors = animation_document.get("accessors", [])
        if not isinstance(source_accessor_index, int) or source_accessor_index < 0 or source_accessor_index >= len(source_accessors):
            raise ValueError("native animation references an invalid accessor")
        source_accessor = source_accessors[source_accessor_index]
        if "bufferView" not in source_accessor:
            raise ValueError("native animation accessor without bufferView is unsupported")
        destination_accessor = copy.deepcopy(source_accessor)
        destination_accessor["bufferView"] = copy_view(source_accessor["bufferView"])
        destination_index = len(base_document["accessors"])
        base_document["accessors"].append(destination_accessor)
        source_accessor_to_base_accessor[source_accessor_index] = destination_index
        return destination_index

    destination_animation = copy.deepcopy(source_animation)
    destination_animation["name"] = animation_name
    destination_samplers = []
    for sampler in source_animation.get("samplers", []):
        destination_sampler = copy.deepcopy(sampler)
        if "input" not in sampler or "output" not in sampler:
            raise ValueError("native animation sampler is missing input/output")
        destination_sampler["input"] = copy_accessor(sampler["input"])
        destination_sampler["output"] = copy_accessor(sampler["output"])
        destination_samplers.append(destination_sampler)
    destination_animation["samplers"] = destination_samplers

    destination_channels = []
    source_samplers = source_animation.get("samplers", [])
    for channel in source_animation.get("channels", []):
        sampler_index = channel.get("sampler")
        if not isinstance(sampler_index, int) or sampler_index < 0 or sampler_index >= len(source_samplers):
            raise ValueError("native animation channel references an invalid sampler")
        target = channel.get("target")
        if not isinstance(target, dict) or "node" not in target:
            raise ValueError("native animation channel has no target node")
        source_node = target["node"]
        if source_node not in source_to_base_nodes:
            source_name = animation_document.get("nodes", [])[source_node].get("name", source_node)
            raise ValueError("native animation channel targets an unknown skeleton node: %s" % source_name)
        destination_channel = copy.deepcopy(channel)
        destination_channel["sampler"] = sampler_index
        destination_channel["target"]["node"] = source_to_base_nodes[source_node]
        destination_channels.append(destination_channel)
    destination_animation["channels"] = destination_channels
    base_document["animations"].append(destination_animation)
    base_document["buffers"][0]["byteLength"] = len(merged_binary)
    return build_glb(base_document, merged_binary)


def _component_format(component_type):
    formats = {5126: ("<f", 4)}
    if component_type not in formats:
        raise ValueError("native animation accessor must use float components")
    return formats[component_type]


def read_accessor_values(document, binary, accessor_index):
    accessors = document.get("accessors", [])
    if not isinstance(accessor_index, int) or accessor_index < 0 or accessor_index >= len(accessors):
        raise ValueError("invalid accessor index")
    accessor = accessors[accessor_index]
    if "bufferView" not in accessor:
        raise ValueError("accessor without bufferView")
    view = document.get("bufferViews", [])[accessor["bufferView"]]
    component_counts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    component_count = component_counts.get(accessor.get("type"))
    if component_count is None:
        raise ValueError("unsupported animation accessor type: %s" % accessor.get("type"))
    component_format, component_size = _component_format(accessor.get("componentType", 5126))
    base_offset = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
    stride = int(view.get("byteStride", component_count * component_size))
    values = []
    for index in range(int(accessor.get("count", 0))):
        row_offset = base_offset + index * stride
        row = [
            struct.unpack_from(component_format, binary, row_offset + component * component_size)[0]
            for component in range(component_count)
        ]
        values.append(row[0] if component_count == 1 else row)
    return values


def _animation_duration(document, binary, animation):
    duration = 0.0
    deltas = []
    for sampler in animation.get("samplers", []):
        times = read_accessor_values(document, binary, sampler["input"])
        for time in times:
            duration = max(duration, float(time))
        for left, right in zip(times, times[1:]):
            delta = float(right) - float(left)
            if delta > 1e-6 and math.isfinite(delta):
                deltas.append(delta)
    if not deltas:
        frame_rate = 24
    else:
        frame_rate = round(1 / statistics.median(deltas))
    return round(duration, 6), max(1, frame_rate)


def root_translation_metrics(document, binary, animation):
    root_nodes = {
        index
        for index, node in enumerate(document.get("nodes", []))
        if str(node.get("name", "")).casefold() == "root"
    }
    samples = []
    for channel in animation.get("channels", []):
        target = channel.get("target", {})
        if target.get("path") != "translation" or target.get("node") not in root_nodes:
            continue
        sampler = animation.get("samplers", [])[channel["sampler"]]
        values = read_accessor_values(document, binary, sampler["output"])
        if sampler.get("interpolation") == "CUBICSPLINE":
            values = values[1::3]
        samples.extend(values)
    if not samples:
        return {
            "sampleCount": 0,
            "maxRange": 0.0,
            "maxNet": 0.0,
            "min": [0.0, 0.0, 0.0],
            "max": [0.0, 0.0, 0.0],
        }
    minimum = [min(float(value[component]) for value in samples) for component in range(3)]
    maximum = [max(float(value[component]) for value in samples) for component in range(3)]
    net = [float(samples[-1][component]) - float(samples[0][component]) for component in range(3)]
    return {
        "sampleCount": len(samples),
        "maxRange": max(maximum[component] - minimum[component] for component in range(3)),
        "maxNet": max(abs(value) for value in net),
        "min": minimum,
        "max": maximum,
    }


def validate_mesh_document(document):
    _skin_joint_names(document, "profile mesh")
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            attributes = primitive.get("attributes", {})
            if "JOINTS_0" not in attributes or "WEIGHTS_0" not in attributes:
                raise ValueError("profile mesh is missing JOINTS_0/WEIGHTS_0 skin attributes")
    if not document.get("meshes"):
        raise ValueError("profile mesh contains no mesh")


def validate_clip_motion_contract(clip):
    mode = clip.get("motionMode")
    if mode not in MOTION_MODES:
        raise ValueError("%s motionMode must be one of %s" % (clip.get("id"), sorted(MOTION_MODES)))
    expected_in_place = mode == "in-place"
    if clip.get("inPlace") is not expected_in_place:
        raise ValueError("%s inPlace does not match motionMode" % clip.get("id"))
    return mode


def assemble_profile(selection, export_manifest, profile_id, output_path):
    profiles = {item.get("id"): item for item in export_manifest.get("profiles", [])}
    profile = profiles.get(profile_id)
    if not profile:
        raise ValueError("native export manifest missing profile %s" % profile_id)
    mesh_path = Path(profile["meshGlbPath"])
    if not mesh_path.is_file():
        raise ValueError("native profile mesh does not exist: %s" % mesh_path)
    base_document, _base_binary = read_glb(mesh_path)
    validate_mesh_document(base_document)
    current = mesh_path.read_bytes()
    base_pose = selection.get("nativeBasePose")
    base_pose_row = export_manifest.get("basePose")
    if not isinstance(base_pose, dict) or base_pose.get("clipName") != BASE_POSE_CLIP_NAME:
        raise ValueError("native selection is missing the standing base pose")
    if not isinstance(base_pose_row, dict) or base_pose_row.get("id") != base_pose.get("id"):
        raise ValueError("native export manifest is missing the standing base pose")
    base_pose_path = Path(base_pose_row["animationGlbPath"])
    if not base_pose_path.is_file():
        raise ValueError("native base pose GLB does not exist: %s" % base_pose_path)
    current = merge_animation_glb(current, base_pose_path.read_bytes(), BASE_POSE_CLIP_NAME)
    document, binary = read_glb(current)
    base_animation = next(
        item for item in document.get("animations", []) if item.get("name") == BASE_POSE_CLIP_NAME
    )
    base_duration, base_frame_rate = _animation_duration(document, binary, base_animation)
    base_evidence = {
        "id": base_pose.get("id"),
        "clipName": BASE_POSE_CLIP_NAME,
        "sourceAnimationGlbPath": str(base_pose_path),
        "durationSeconds": base_duration,
        "frameRate": base_frame_rate,
    }
    animation_rows = {item.get("id"): item for item in export_manifest.get("animations", [])}
    evidence = []
    for clip in selection.get("clips", []):
        validate_clip_motion_contract(clip)
        row = animation_rows.get(clip.get("id"))
        if not row:
            raise ValueError("native export manifest missing animation %s" % clip.get("id"))
        animation_path = Path(row["animationGlbPath"])
        if not animation_path.is_file():
            raise ValueError("native animation GLB does not exist: %s" % animation_path)
        current = merge_animation_glb(current, animation_path.read_bytes(), clip["clipName"])

        document, binary = read_glb(current)
        animation = next(item for item in document.get("animations", []) if item.get("name") == clip["clipName"])
        duration, frame_rate = _animation_duration(document, binary, animation)
        root_metrics = root_translation_metrics(document, binary, animation)
        if clip["motionMode"] == "in-place" and (
            root_metrics["maxRange"] > ROOT_TRANSLATION_MAX_RANGE_METERS + 1e-6
            or root_metrics["maxNet"] > ROOT_TRANSLATION_MAX_RANGE_METERS + 1e-6
        ):
            raise ValueError("in-place animation exceeds root translation limit: %s" % clip["id"])
        if clip["motionMode"] == "root-motion" and (
            root_metrics["sampleCount"] == 0
            or max(root_metrics["maxRange"], root_metrics["maxNet"]) <= ROOT_TRANSLATION_MAX_RANGE_METERS
        ):
            raise ValueError("root-motion animation lost observable root translation: %s" % clip["id"])
        evidence.append({
            "id": clip["id"],
            "clipName": clip["clipName"],
            "sourceAnimationGlbPath": str(animation_path),
            "durationSeconds": duration,
            "frameRate": frame_rate,
            "rootTranslationMetrics": root_metrics,
        })

    document, _binary = read_glb(current)
    names = [animation.get("name") for animation in document.get("animations", [])]
    expected_names = [clip["clipName"] for clip in selection.get("clips", [])]
    expected_names = [BASE_POSE_CLIP_NAME, *expected_names]
    if names != expected_names:
        raise ValueError("native profile animation order/name mismatch: %s != %s" % (names, expected_names))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(current)
    return {"basePose": base_evidence, "clips": evidence}


def sync_selection_evidence(selection_path, selection, export_manifest, evidence):
    exported_by_id = {item.get("id"): item for item in export_manifest.get("animations", [])}
    evidence_by_id = {item["id"]: item for item in evidence}
    skeletons = set()
    for clip in selection.get("clips", []):
        exported = exported_by_id.get(clip.get("id"))
        audited = evidence_by_id.get(clip.get("id"))
        if not exported or not audited:
            raise ValueError("native evidence missing %s" % clip.get("id"))
        source_skeleton = exported.get("sourceSkeleton")
        if not source_skeleton:
            raise ValueError("native export missing source skeleton: %s" % clip.get("id"))
        skeletons.add(source_skeleton)
        clip["sourceSkeleton"] = source_skeleton
        clip["sourceDurationSeconds"] = exported.get("sourceDurationSeconds")
        clip["catalogDurationSeconds"] = audited["durationSeconds"]
        clip["durationSeconds"] = audited["durationSeconds"]
        clip["frameRate"] = audited["frameRate"]
        clip["rootTranslationMaxRangeMeters"] = round(audited["rootTranslationMetrics"]["maxRange"], 6)
        clip["rootTranslationMaxNetMeters"] = round(audited["rootTranslationMetrics"]["maxNet"], 6)
    if len(skeletons) != 1:
        raise ValueError("native animations must use one source skeleton")
    max_range = max((clip.get("rootTranslationMaxRangeMeters", 0) for clip in selection.get("clips", [])), default=0)
    max_net = max((clip.get("rootTranslationMaxNetMeters", 0) for clip in selection.get("clips", [])), default=0)
    selection["rootTranslationAudit"] = {
        "rule": "in-place clips must stay within 0.03m; root-motion clips must preserve the exported root translation channel",
        "auditedClipCount": len(selection.get("clips", [])),
        "rejectedClipCount": 0,
        "maxRangeMeters": round(max_range, 6),
        "maxNetMeters": round(max_net, 6),
    }
    selection_path.write_text(json.dumps(selection, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", required=True, type=Path)
    parser.add_argument("--native-export-manifest", required=True, type=Path)
    parser.add_argument("--native-dir", required=True, type=Path)
    parser.add_argument("--output-manny", required=True, type=Path)
    parser.add_argument("--output-quinn", required=True, type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    export_manifest = json.loads(args.native_export_manifest.read_text(encoding="utf-8"))
    if selection.get("target") != "UE5-native":
        raise RuntimeError("native assembly requires selection target=UE5-native")
    clips = selection.get("clips", [])
    if len(clips) != 4:
        raise RuntimeError("native smoke assembly requires exactly four clips")
    profiles = {item.get("id") for item in export_manifest.get("profiles", [])}
    if profiles != set(EXPECTED_PROFILES):
        raise RuntimeError("native export must contain exactly Manny and Quinn profiles")
    args.native_dir.mkdir(parents=True, exist_ok=True)

    manny_evidence = assemble_profile(selection, export_manifest, "manny", args.output_manny)
    quinn_evidence = assemble_profile(selection, export_manifest, "quinn", args.output_quinn)
    if [item["id"] for item in manny_evidence["clips"]] != [item["id"] for item in quinn_evidence["clips"]]:
        raise RuntimeError("Manny and Quinn native animation sets differ")
    sync_selection_evidence(args.selection, selection, export_manifest, manny_evidence["clips"])

    manifest_path = args.native_dir / "native-assembly-manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "pipeline": "ue5-native-no-retarget",
                "selection": str(args.selection),
                "nativeExportManifest": str(args.native_export_manifest),
                "profiles": {
                    "manny": {
                        "outputGlb": str(args.output_manny),
                        "basePose": manny_evidence["basePose"],
                        "animations": manny_evidence["clips"],
                    },
                    "quinn": {
                        "outputGlb": str(args.output_quinn),
                        "basePose": quinn_evidence["basePose"],
                        "animations": quinn_evidence["clips"],
                    },
                },
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print("[UE5-NATIVE-ASSEMBLE] wrote Manny and Quinn native catalogs")


if __name__ == "__main__":
    main()
