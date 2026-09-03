# -*- coding: utf-8 -*-
"""Scan Anim57 mannequin animation assets without changing the UE project.

This is intentionally a read-only discovery command.  The native import
pipeline needs one real standing clip for the 3D blocking viewer, but that
clip is an implementation asset and must not be guessed from a filename.
"""

import json
import os
import sys

import unreal


ROOT = "/Game/Characters/Mannequins/Anims"
EXPECTED_SKELETON = "/Game/Characters/Mannequins/Meshes/SK_Mannequin.SK_Mannequin"


def log(message):
    unreal.log_warning("[UE5-MANNEQUIN-SCAN] %s" % message)


def object_path(value):
    if value is None:
        return None
    if hasattr(value, "get_path_name"):
        return value.get_path_name()
    return str(value)


def asset_object_path(asset_data):
    return "%s.%s" % (str(asset_data.package_name), str(asset_data.asset_name))


def class_name(asset_data):
    value = getattr(asset_data, "asset_class_path", None)
    if value is not None:
        name = getattr(value, "asset_name", None)
        return str(name if name is not None else value).rsplit(".", 1)[-1]
    return str(getattr(asset_data, "asset_class", ""))


def asset_length(asset):
    for method_name in ("get_play_length", "get_sequence_length"):
        method = getattr(asset, method_name, None)
        if method is not None:
            try:
                return round(float(method()), 6)
            except Exception:
                pass
    for property_name in ("sequence_length", "play_length"):
        try:
            return round(float(asset.get_editor_property(property_name)), 6)
        except Exception:
            pass
    return None


def skeleton_path(asset):
    try:
        return object_path(asset.get_editor_property("skeleton"))
    except Exception:
        return None


def main():
    output_path = os.environ.get(
        "CINE57_ANIMATION_NATIVE_SCAN_OUTPUT",
        sys.argv[1] if len(sys.argv) > 1 else "D:/UnrealWorkspace/Cine57-exported/runs/manual-native-scan/mannequin-assets.json",
    )
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    editor_assets = unreal.EditorAssetLibrary
    rows = []
    load_errors = []
    asset_data_list = registry.get_assets_by_path(ROOT, recursive=True)
    log("found %d asset registry rows under %s" % (len(asset_data_list), ROOT))
    for asset_data in asset_data_list:
        if class_name(asset_data) != "AnimSequence":
            continue
        object_path_value = asset_object_path(asset_data)
        try:
            asset = editor_assets.load_asset(object_path_value)
        except Exception as error:
            load_errors.append({"assetPath": object_path_value, "error": str(error)})
            continue
        if asset is None:
            load_errors.append({"assetPath": object_path_value, "error": "load returned None"})
            continue
        rows.append({
            "assetPath": object_path_value,
            "assetName": str(asset_data.asset_name),
            "skeleton": skeleton_path(asset),
            "durationSeconds": asset_length(asset),
        })
    rows.sort(key=lambda row: row["assetPath"])
    payload = {
        "schemaVersion": 1,
        "root": ROOT,
        "expectedSkeleton": EXPECTED_SKELETON,
        "assetCount": len(rows),
        "loadErrorCount": len(load_errors),
        "animations": rows,
        "loadErrors": load_errors,
    }
    parent = os.path.dirname(output_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    matching = sum(1 for row in rows if row["skeleton"] == EXPECTED_SKELETON)
    log("wrote %d AnimSequence rows (%d SK_Mannequin) -> %s" % (len(rows), matching, output_path))


main()
