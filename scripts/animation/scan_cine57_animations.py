# -*- coding: utf-8 -*-
"""Scan Cine57 animation assets without modifying the Unreal project.

Run with UE 5.7's UnrealEditor-Cmd Python commandlet.  The output is an
evidence manifest used to curate the browser animation library; it records
source paths, pack names, skeletons, and durations so the catalog is not
based on filename guesses alone.
"""

import json
import os
import sys

import unreal


SOURCE_GROUPS = {
    "daily": "/Game/_AnimDaily",
    "daily-interact": "/Game/_AnimDailyInteract",
    "daily-misc": "/Game/_AnimDailyMisc",
    "battle-hand": "/Game/_AnimBattleHand",
    "battle-weapon": "/Game/_AnimBattleWeapon",
}
DEFAULT_OUTPUT = "D:/UnrealWorkspace/Cine57-exported/animation_catalog_scan.json"
SUPPORTED_ASSET_CLASSES = {"AnimSequence"}


def log(message):
    unreal.log_warning("[ANIM-SCAN] %s" % message)


def as_path(value):
    if value is None:
        return None
    if hasattr(value, "get_path_name"):
        return value.get_path_name()
    return str(value)


def package_path(object_path):
    return str(object_path).split(".", 1)[0]


def asset_object_path(asset_data):
    package_name = str(getattr(asset_data, "package_name"))
    asset_name = str(getattr(asset_data, "asset_name"))
    return "%s.%s" % (package_name, asset_name)


def pack_name(source_root, asset_path):
    relative = asset_path[len(source_root):].strip("/")
    return relative.split("/", 1)[0] if relative else "(root)"


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


def skeleton_path(asset):
    for property_name in ("skeleton", "preview_skeletal_mesh"):
        try:
            value = asset.get_editor_property(property_name)
            path = as_path(value)
            if path:
                return path
        except Exception:
            pass
    return None


def is_animation_asset(asset_data):
    class_path = ""
    for property_name in ("asset_class_path", "asset_class_path_name"):
        try:
            value = getattr(asset_data, property_name)
            if value is not None:
                asset_name = getattr(value, "asset_name", None)
                class_path = str(asset_name if asset_name is not None else value)
                if class_path:
                    break
        except Exception:
            pass
    class_name = class_path.rsplit(".", 1)[-1]
    if not class_name:
        try:
            legacy_class = getattr(asset_data, "asset_class", "")
            class_name = str(legacy_class) if legacy_class else ""
        except Exception:
            class_name = ""
    return class_name in SUPPORTED_ASSET_CLASSES


def main():
    output_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUTPUT
    registry = unreal.AssetRegistryHelpers.get_asset_registry()
    editor_assets = unreal.EditorAssetLibrary
    rows = []
    counters = {}
    load_errors = []

    for group_id, source_root in SOURCE_GROUPS.items():
        group_rows = []
        asset_data_list = registry.get_assets_by_path(source_root, recursive=True)
        if group_id == "daily":
            log("daily raw asset count=%d" % len(asset_data_list))
        for asset_data in asset_data_list:
            if not is_animation_asset(asset_data):
                continue
            object_path = asset_object_path(asset_data)
            try:
                asset = editor_assets.load_asset(object_path)
            except Exception as error:
                load_errors.append({
                    "groupId": group_id,
                    "assetPath": object_path,
                    "error": str(error),
                })
                continue
            if asset is None:
                continue
            row = {
                "groupId": group_id,
                "sourceRoot": source_root,
                "pack": pack_name(source_root, object_path),
                "assetPath": object_path,
                "assetName": str(asset_data.asset_name),
                "assetClass": str(getattr(getattr(asset_data, "asset_class_path", None), "asset_name", "")),
                "skeleton": skeleton_path(asset),
                "durationSeconds": asset_length(asset),
            }
            group_rows.append(row)
        rows.extend(group_rows)
        counters[group_id] = len(group_rows)
        log("%s: %d animation assets" % (group_id, len(group_rows)))

    payload = {
        "project": "Cine57",
        "groups": SOURCE_GROUPS,
        "counts": counters,
        "loadErrors": load_errors,
        "animations": rows,
    }
    parent = os.path.dirname(output_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    log("wrote %d rows and skipped %d load errors -> %s" % (len(rows), len(load_errors), output_path))


main()
