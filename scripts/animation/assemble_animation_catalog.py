# -*- coding: utf-8 -*-
"""Convert the curated FBX exports and append them to the shared UAL2 GLB.

The operation is resumable in the external Cine57-exported directory. It never
deletes source exports and only copies the verified final GLB into the client
after the complete clip-name set has been checked.
"""

import argparse
import json
import shutil
import struct
import subprocess
import sys
from pathlib import Path

ROOT_TRANSLATION_MAX_RANGE_METERS = 0.03


def read_glb_json(path):
    data = Path(path).read_bytes()
    if data[:4] != b"glTF":
        raise ValueError("not a GLB: %s" % path)
    json_length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + json_length].decode("utf-8"))


def read_glb(path):
    data = Path(path).read_bytes()
    if data[:4] != b"glTF":
        raise ValueError("not a GLB: %s" % path)
    json_length = struct.unpack_from("<I", data, 12)[0]
    json_start = 20
    glb = json.loads(data[json_start:json_start + json_length].decode("utf-8"))
    binary_header = json_start + json_length
    if data[binary_header + 4:binary_header + 8] != b"BIN\x00":
        raise ValueError("GLB has no binary chunk: %s" % path)
    binary_length = struct.unpack_from("<I", data, binary_header)[0]
    return glb, data, binary_header + 8, binary_length


def read_accessor_values(glb, data, binary_start, accessor_index):
    accessor = glb.get("accessors", [])[accessor_index]
    view = glb.get("bufferViews", [])[accessor["bufferView"]]
    component_count = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[accessor["type"]]
    component_type = accessor.get("componentType", 5126)
    component_formats = {
        5126: ("<f", 4),
        5125: ("<I", 4),
        5123: ("<H", 2),
        5121: ("<B", 1),
    }
    component_format, component_size = component_formats[component_type]
    offset = binary_start + view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", component_count * component_size)
    values = []
    for index in range(accessor["count"]):
        row_offset = offset + index * stride
        row = [
            struct.unpack_from(component_format, data, row_offset + component * component_size)[0]
            for component in range(component_count)
        ]
        values.append(row if component_count > 1 else row[0])
    return values


def animation_names(path):
    return [animation.get("name") for animation in read_glb_json(path).get("animations", [])]


def has_root_translation_channel(glb, animation_name=None):
    root_nodes = {
        index
        for index, node in enumerate(glb.get("nodes", []))
        if str(node.get("name", "")).lower() == "root"
    }
    animations = glb.get("animations", [])
    if animation_name is not None:
        animations = [animation for animation in animations if animation.get("name") == animation_name]
    return any(
        channel.get("target", {}).get("node") in root_nodes
        and channel.get("target", {}).get("path") == "translation"
        for animation in animations
        for channel in animation.get("channels", [])
    )


def _translation_samples(values):
    if values is None:
        return []
    values = list(values)
    if not values:
        return []
    if isinstance(values[0], (list, tuple)):
        return [list(map(float, value[:3])) for value in values]
    return [
        [float(values[index]), float(values[index + 1]), float(values[index + 2])]
        for index in range(0, len(values) - 2, 3)
    ]


def root_translation_metrics(glb, accessors, animation_name=None):
    root_nodes = {
        index
        for index, node in enumerate(glb.get("nodes", []))
        if str(node.get("name", "")).lower() == "root"
    }
    animations = glb.get("animations", [])
    if animation_name is not None:
        animations = [animation for animation in animations if animation.get("name") == animation_name]
    samples = []
    for animation in animations:
        for channel in animation.get("channels", []):
            target = channel.get("target", {})
            if target.get("path") != "translation" or target.get("node") not in root_nodes:
                continue
            sampler = animation.get("samplers", [])[channel["sampler"]]
            samples.extend(_translation_samples(accessors.get(sampler["output"], [])))

    if not samples:
        return {
            "sampleCount": 0,
            "min": [0.0, 0.0, 0.0],
            "max": [0.0, 0.0, 0.0],
            "range": [0.0, 0.0, 0.0],
            "maxRange": 0.0,
            "net": [0.0, 0.0, 0.0],
            "maxNet": 0.0,
        }

    minimum = [min(sample[component] for sample in samples) for component in range(3)]
    maximum = [max(sample[component] for sample in samples) for component in range(3)]
    ranges = [maximum[component] - minimum[component] for component in range(3)]
    net = [samples[-1][component] - samples[0][component] for component in range(3)]
    return {
        "sampleCount": len(samples),
        "min": minimum,
        "max": maximum,
        "range": ranges,
        "maxRange": max(ranges),
        "net": net,
        "maxNet": max(abs(value) for value in net),
    }


def root_translation_metrics_from_path(path, animation_name=None):
    glb, data, binary_start, _binary_length = read_glb(path)
    accessor_values = {
        index: read_accessor_values(glb, data, binary_start, index)
        for index in range(len(glb.get("accessors", [])))
    }
    return root_translation_metrics(glb, accessor_values, animation_name)


def is_root_translation_within_limit(glb, accessors=None, max_range=ROOT_TRANSLATION_MAX_RANGE_METERS):
    if accessors is None:
        accessors = {}
    metrics = root_translation_metrics(glb, accessors)
    return metrics["maxRange"] <= max_range + 1e-6 and metrics["maxNet"] <= max_range + 1e-6


def is_root_translation_path_within_limit(path, animation_name=None, max_range=ROOT_TRANSLATION_MAX_RANGE_METERS):
    metrics = root_translation_metrics_from_path(path, animation_name)
    return metrics["maxRange"] <= max_range + 1e-6 and metrics["maxNet"] <= max_range + 1e-6


def run(command, label):
    print("[ANIM-ASSEMBLE]", label)
    completed = subprocess.run(command, check=False)
    if completed.returncode != 0:
        raise RuntimeError("command failed (%d): %s" % (completed.returncode, " ".join(map(str, command))))


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", required=True, type=Path)
    parser.add_argument("--fbx-dir", required=True, type=Path)
    parser.add_argument("--glb-dir", required=True, type=Path)
    parser.add_argument("--base-glb", required=True, type=Path)
    parser.add_argument("--retarget-script", required=True, type=Path)
    parser.add_argument("--converter", required=True, type=Path)
    parser.add_argument("--output-glb", required=True, type=Path)
    return parser.parse_args()


def main():
    args = parse_args()
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    clips = selection.get("clips", [])
    if not clips:
        raise RuntimeError("selection manifest contains no clips")
    if selection.get("inPlacePolicy") != "strict-source-in-place":
        raise RuntimeError("selection manifest must use the strict-source-in-place policy")
    invalid_clips = [clip.get("id") for clip in clips if clip.get("inPlace") is not True]
    if invalid_clips:
        raise RuntimeError("selection contains non-in-place clips: %s" % ", ".join(invalid_clips))
    if not args.base_glb.is_file():
        raise RuntimeError("base GLB does not exist: %s" % args.base_glb)

    args.glb_dir.mkdir(parents=True, exist_ok=True)
    retarget_dir = args.glb_dir / "retarget"
    retarget_dir.mkdir(parents=True, exist_ok=True)

    node = shutil.which("node")
    if node is None:
        raise RuntimeError("node is not available on PATH")

    converted = []
    for index, clip in enumerate(clips, start=1):
        fbx_path = args.fbx_dir / clip["fbxFileName"]
        glb_path = args.glb_dir / clip["glbFileName"]
        if not fbx_path.is_file():
            raise RuntimeError("missing FBX for %s: %s" % (clip["id"], fbx_path))
        names = animation_names(glb_path) if glb_path.is_file() else []
        if len(names) != 1:
            run([node, str(args.converter), str(fbx_path), str(glb_path)],
                "convert %d/%d %s" % (index, len(clips), clip["id"]))
            names = animation_names(glb_path)
        if len(names) != 1:
            raise RuntimeError("converted GLB must contain exactly one animation: %s -> %s" % (fbx_path, names))
        source_metrics = root_translation_metrics_from_path(glb_path)
        if source_metrics["maxRange"] > ROOT_TRANSLATION_MAX_RANGE_METERS + 1e-6 \
                or source_metrics["maxNet"] > ROOT_TRANSLATION_MAX_RANGE_METERS + 1e-6:
            raise RuntimeError(
                "in-place source GLB exceeds root translation limit (%.6fm range, %.6fm net): %s -> %s" %
                (source_metrics["maxRange"], source_metrics["maxNet"], clip["id"], glb_path)
            )
        converted.append({"id": clip["id"], "fbxPath": str(fbx_path), "glbPath": str(glb_path)})

    current = args.base_glb
    for index, clip in enumerate(clips, start=1):
        source_glb = args.glb_dir / clip["glbFileName"]
        output_glb = retarget_dir / ("step-%04d.glb" % index)
        expected_names = set(animation_names(current)) | {clip["clipName"]}
        if output_glb.is_file() and set(animation_names(output_glb)) == expected_names:
            retarget_metrics = root_translation_metrics_from_path(output_glb, clip["clipName"])
            if retarget_metrics["maxRange"] > ROOT_TRANSLATION_MAX_RANGE_METERS + 1e-6 \
                    or retarget_metrics["maxNet"] > ROOT_TRANSLATION_MAX_RANGE_METERS + 1e-6:
                raise RuntimeError(
                    "reused retargeted animation exceeds root translation limit: %s -> %s" %
                    (clip["id"], output_glb)
                )
            current = output_glb
            print("[ANIM-ASSEMBLE] reuse retarget %d/%d %s" % (index, len(clips), clip["id"]))
            continue
        run(
            [
                sys.executable,
                str(args.retarget_script),
                str(source_glb),
                str(current),
                str(output_glb),
                clip["clipName"],
            ],
            "retarget %d/%d %s" % (index, len(clips), clip["id"]),
        )
        current = output_glb
        retarget_metrics = root_translation_metrics_from_path(current, clip["clipName"])
        if retarget_metrics["maxRange"] > ROOT_TRANSLATION_MAX_RANGE_METERS + 1e-6 \
                or retarget_metrics["maxNet"] > ROOT_TRANSLATION_MAX_RANGE_METERS + 1e-6:
            raise RuntimeError(
                "retargeted animation exceeds root translation limit: %s -> %s" %
                (clip["id"], current)
            )

    base_names = animation_names(args.base_glb)
    expected_names = base_names + [clip["clipName"] for clip in clips]
    final_names = animation_names(current)
    if final_names != expected_names:
        raise RuntimeError(
            "final animation order/name set mismatch: expected %d, got %d" %
            (len(expected_names), len(final_names))
        )
    if len(set(final_names)) != len(final_names):
        raise RuntimeError("final GLB contains duplicate animation names")

    args.output_glb.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(current, args.output_glb)
    manifest_path = args.glb_dir / "assembly_manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "schemaVersion": 1,
                "selection": str(args.selection),
                "baseGlb": str(args.base_glb),
                "outputGlb": str(args.output_glb),
                "baseAnimationCount": len(base_names),
                "selectedAnimationCount": len(clips),
                "finalAnimationCount": len(final_names),
                "converted": converted,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print("[ANIM-ASSEMBLE] wrote %d animations -> %s" % (len(final_names), args.output_glb))


if __name__ == "__main__":
    main()
