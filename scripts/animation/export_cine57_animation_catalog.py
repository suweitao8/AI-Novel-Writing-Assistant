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
    "D:/UnrealWorkspace/Cine57-exported/animation_catalog",
)


def log(message):
    unreal.log_warning("[ANIM-EXPORT] %s" % message)


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


def main():
    selection_path = argument_after("--selection", DEFAULT_SELECTION)
    output_dir = argument_after("--output-dir", DEFAULT_OUTPUT_DIR)
    with open(selection_path, "r", encoding="utf-8") as handle:
        selection = json.load(handle)
    if selection.get("inPlacePolicy") != "strict-source-in-place":
        raise RuntimeError("selection manifest must use the strict-source-in-place policy")
    invalid_clips = [clip.get("id") for clip in selection.get("clips", []) if clip.get("inPlace") is not True]
    if invalid_clips:
        raise RuntimeError("selection contains non-in-place clips: %s" % ", ".join(invalid_clips))

    os.makedirs(output_dir, exist_ok=True)
    exported = []
    errors = []
    for clip in selection.get("clips", []):
        output_path = os.path.abspath(os.path.join(output_dir, clip["fbxFileName"]))
        try:
            export_clip(clip["sourceAssetPath"], output_path)
            exported.append({
                "id": clip["id"],
                "sourceAssetPath": clip["sourceAssetPath"],
                "sourceAssetName": clip["sourceAssetName"],
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
