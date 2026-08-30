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


def read_glb_json(path):
    data = Path(path).read_bytes()
    if data[:4] != b"glTF":
        raise ValueError("not a GLB: %s" % path)
    json_length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + json_length].decode("utf-8"))


def animation_names(path):
    return [animation.get("name") for animation in read_glb_json(path).get("animations", [])]


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
        converted.append({"id": clip["id"], "fbxPath": str(fbx_path), "glbPath": str(glb_path)})

    current = args.base_glb
    for index, clip in enumerate(clips, start=1):
        source_glb = args.glb_dir / clip["glbFileName"]
        output_glb = retarget_dir / ("step-%04d.glb" % index)
        expected_names = set(animation_names(current)) | {clip["clipName"]}
        if output_glb.is_file() and set(animation_names(output_glb)) == expected_names:
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
