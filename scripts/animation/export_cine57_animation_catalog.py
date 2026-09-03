# -*- coding: utf-8 -*-
"""Export the curated Cine57 AnimSequence catalog to individual FBX files.

This script is intentionally data-driven: the checked-in selection manifest is
the only source of export targets. It does not modify the UE project or create
assets inside it.
"""

import json
import os
import sys

import unreal


DEFAULT_SELECTION = os.environ.get(
    "CINE57_ANIMATION_SELECTION",
    "D:/UnrealWorkspace/Cine57-exported/animationCatalogSelection.json",
)
DEFAULT_OUTPUT_DIR = os.environ.get(
    "CINE57_ANIMATION_OUTPUT_DIR",
    "D:/UnrealWorkspace/Cine57-exported/runs/manual-export/fbx",
)
MOTION_POLICY = "explicit-per-clip"
MOTION_MODES = ("in-place", "root-motion")


def log(message):
    unreal.log_warning("[ANIM-EXPORT] %s" % message)


def asset_length(asset):
    for method_name in ("get_play_length", "get_sequence_length"):
        method = getattr(asset, method_name, None)
        if method is not None:
            try:
                return round(float(method()), 4)
            except Exception:
                pass
    for property_name in ("sequence_length", "play_length"):
        try:
            return round(float(asset.get_editor_property(property_name)), 4)
        except Exception:
            pass
    return None


def object_path(value):
    if value is None:
        return None
    if hasattr(value, "get_path_name"):
        return value.get_path_name()
    return str(value)


def asset_skeleton(asset):
    try:
        return object_path(asset.get_editor_property("skeleton"))
    except Exception:
        return None


def argument_after(flag, default):
    for index, value in enumerate(sys.argv):
        if value == flag and index + 1 < len(sys.argv):
            return sys.argv[index + 1]
        if value.startswith(flag + "="):
            return value.split("=", 1)[1]
    return default


def export_clip(asset_path, output_path):
    asset = unreal.EditorAssetLibrary.load_asset(asset_path)
    if asset is None:
        raise RuntimeError("asset could not be loaded: %s" % asset_path)
    exporter = unreal.AnimSequenceExporterFBX()
    task = unreal.AssetExportTask()
    task.object = asset
    task.filename = output_path
    task.automated = True
    task.replace_identical = True
    task.exporter = exporter
    if not exporter.run_asset_export_task(task):
        raise RuntimeError("FBX exporter returned false")
    return asset


def validate_clip_motion_contract(clip):
    mode = clip.get("motionMode")
    if mode not in MOTION_MODES:
        raise RuntimeError("%s motionMode must be one of %s" % (clip.get("id"), ", ".join(MOTION_MODES)))
    if mode == "in-place" and clip.get("inPlace") is not True:
        raise RuntimeError("%s in-place clip must set inPlace=true" % clip.get("id"))
    if mode == "root-motion" and clip.get("inPlace") is not False:
        raise RuntimeError("%s root-motion clip must set inPlace=false" % clip.get("id"))
    return mode


def main():
    selection_path = argument_after("--selection", DEFAULT_SELECTION)
    output_dir = argument_after("--output-dir", DEFAULT_OUTPUT_DIR)
    with open(selection_path, "r", encoding="utf-8") as handle:
        selection = json.load(handle)
    if selection.get("motionPolicy") != MOTION_POLICY:
        raise RuntimeError("selection manifest must use the explicit-per-clip motion policy")
    for clip in selection.get("clips", []):
        validate_clip_motion_contract(clip)

    os.makedirs(output_dir, exist_ok=True)
    exported = []
    errors = []
    for clip in selection.get("clips", []):
        output_path = os.path.abspath(os.path.join(output_dir, clip["fbxFileName"]))
        try:
            asset = export_clip(clip["sourceAssetPath"], output_path)
            exported.append({
                "id": clip["id"],
                "motionMode": clip["motionMode"],
                "sourceAssetPath": clip["sourceAssetPath"],
                "sourceAssetName": clip["sourceAssetName"],
                "sourceDurationSeconds": asset_length(asset),
                "sourceSkeleton": asset_skeleton(asset),
                "fbxFileName": clip["fbxFileName"],
                "fbxPath": output_path,
            })
            log("exported %s" % clip["sourceAssetName"])
        except Exception as error:
            error_row = {
                "id": clip.get("id"),
                "sourceAssetPath": clip.get("sourceAssetPath"),
                "error": str(error),
            }
            errors.append(error_row)
            log("FAILED %s: %s" % (clip.get("sourceAssetPath"), error))

    manifest_path = os.path.join(output_dir, "export_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "schemaVersion": 1,
                "project": selection.get("project"),
                "sourceProject": selection.get("sourceProject"),
                "sourceProjectPath": selection.get("sourceProjectPath"),
                "sourceAssetRoot": selection.get("sourceAssetRoot"),
                "selectionPath": selection_path,
                "exported": exported,
                "errors": errors,
            },
            handle,
            ensure_ascii=False,
            indent=2,
        )
    log("wrote %d exports, %d errors -> %s" % (len(exported), len(errors), manifest_path))
    if errors:
        raise RuntimeError("animation catalog export failed for %d clips" % len(errors))


main()
