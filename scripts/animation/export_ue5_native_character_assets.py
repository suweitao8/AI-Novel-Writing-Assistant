# -*- coding: utf-8 -*-
"""Export native UE5 Manny/Quinn meshes and AnimSequences as GLB files.

The script runs inside UnrealEditor-Cmd with the engine GLTFExporter plugin.
It exports the four curated Anim57 sequences plus one explicit neutral base
pose.  All of them use the same native SK_Mannequin skeleton for both paired
meshes.  No FBX export, retargeting, temporary UE assets, or project-content
writes are performed here.
"""

import json
import os
import sys
from pathlib import Path

import unreal


DEFAULT_SELECTION = os.environ.get(
    "CINE57_ANIMATION_SELECTION",
    "D:/UnrealWorkspace/Cine57-exported/animationCatalogSelection.json",
)
DEFAULT_OUTPUT_DIR = os.environ.get(
    "CINE57_ANIMATION_NATIVE_OUTPUT_DIR",
    "D:/UnrealWorkspace/Cine57-exported/runs/manual-export/native",
)
SOURCE_ASSET_ROOT = "/Game/Characters/Mannequins/Anims/Unarmed/Attack"
BASE_POSE_SOURCE_ASSET_PATH = "/Game/Characters/Mannequins/Anims/Unarmed/MM_Idle"
BASE_POSE_CLIP_NAME = "standing"
EXPECTED_MESH_SKELETON = "/Game/Characters/Mannequins/Meshes/SK_Mannequin.SK_Mannequin"
PROFILES = (
    {
        "id": "manny",
        "label": "UE5 Manny",
        "meshPath": "/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple",
        "meshFileName": "UE5_Manny_Simple.mesh.glb",
    },
    {
        "id": "quinn",
        "label": "UE5 Quinn",
        "meshPath": "/Game/Characters/Mannequins/Meshes/SKM_Quinn_Simple",
        "meshFileName": "UE5_Quinn_Simple.mesh.glb",
    },
)


def log(message):
    unreal.log_warning("[UE5-NATIVE-EXPORT] %s" % message)


def argument_after(flag, default):
    for index, value in enumerate(sys.argv):
        if value == flag and index + 1 < len(sys.argv):
            return sys.argv[index + 1]
        if value.startswith(flag + "="):
            return value.split("=", 1)[1]
    return default


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


def set_export_option(options, property_name, value):
    """Set an explicit GLTF option and fail if this UE build lacks it."""

    try:
        options.set_editor_property(property_name, value)
        return
    except Exception as first_error:
        try:
            setattr(options, property_name, value)
            return
        except Exception as second_error:
            raise RuntimeError(
                "GLTFExportOptions 缺少 %s：%s / %s"
                % (property_name, first_error, second_error)
            )


def make_export_options(preview_mesh):
    options_type = getattr(unreal, "GLTFExportOptions", None)
    if options_type is None:
        raise RuntimeError("当前 UE 没有加载 GLTFExportOptions；请确认 GLTFExporter 插件可用")
    options = options_type()
    set_export_option(options, "export_uniform_scale", 0.01)
    set_export_option(options, "export_preview_mesh", bool(preview_mesh))
    set_export_option(options, "export_vertex_skin_weights", True)
    set_export_option(options, "export_animation_sequences", not preview_mesh)
    set_export_option(options, "export_level_sequences", False)
    return options


def run_asset_export_task(asset, exporter_name, output_path, options):
    exporter_type = getattr(unreal, exporter_name, None)
    if exporter_type is None:
        raise RuntimeError("当前 UE 没有加载 %s；请确认 GLTFExporter 插件可用" % exporter_name)
    exporter = exporter_type()
    task = unreal.AssetExportTask()
    task.object = asset
    task.filename = str(output_path)
    task.automated = True
    task.prompt = False
    task.replace_identical = True
    task.exporter = exporter
    try:
        task.options = options
    except Exception:
        task.set_editor_property("options", options)
    runner = getattr(exporter, "run_asset_export_task", None)
    if runner is None:
        exporter_base = getattr(unreal, "Exporter", None)
        runner = getattr(exporter_base, "run_asset_export_task", None) if exporter_base else None
    if runner is None or not runner(task):
        raise RuntimeError("%s 导出任务返回失败：%s" % (exporter_name, output_path))
    if not output_path.is_file() or output_path.stat().st_size < 32:
        raise RuntimeError("%s 导出后没有生成有效 GLB：%s" % (exporter_name, output_path))


def load_asset(asset_path):
    asset = unreal.EditorAssetLibrary.load_asset(asset_path)
    if asset is None:
        raise RuntimeError("无法加载 UE 资产：%s" % asset_path)
    return asset


def validate_selection(selection):
    if selection.get("sourceProject") != "Anim57":
        raise RuntimeError("native export requires sourceProject=Anim57")
    if selection.get("sourceAssetRoot") != SOURCE_ASSET_ROOT:
        raise RuntimeError("源动画目录不匹配：%s" % selection.get("sourceAssetRoot"))
    clips = selection.get("clips")
    if not isinstance(clips, list) or len(clips) != 4:
        raise RuntimeError("native smoke export requires exactly four attack clips")
    base_pose = selection.get("nativeBasePose")
    if not isinstance(base_pose, dict):
        raise RuntimeError("native export requires an explicit nativeBasePose")
    if base_pose.get("clipName") != BASE_POSE_CLIP_NAME:
        raise RuntimeError("native base pose must be named %s" % BASE_POSE_CLIP_NAME)
    if base_pose.get("sourceAssetPath") != BASE_POSE_SOURCE_ASSET_PATH:
        raise RuntimeError(
            "native base pose asset must be %s" % BASE_POSE_SOURCE_ASSET_PATH
        )
    if base_pose.get("sourceSkeleton") != EXPECTED_MESH_SKELETON:
        raise RuntimeError("native base pose skeleton must be SK_Mannequin")
    for clip in clips:
        source_path = clip.get("sourceAssetPath")
        if not isinstance(source_path, str) or not source_path.startswith(SOURCE_ASSET_ROOT + "/"):
            raise RuntimeError("动画不在指定徒手攻击目录：%s" % source_path)
        if clip.get("motionMode") not in ("in-place", "root-motion"):
            raise RuntimeError("动画缺少有效 motionMode：%s" % clip.get("id"))


def native_animation_filename(clip):
    old_name = clip.get("nativeAnimationFileName") or clip.get("glbFileName") or clip.get("id")
    return "%s.glb" % Path(str(old_name)).stem


def main():
    selection_path = Path(argument_after("--selection", DEFAULT_SELECTION)).resolve()
    output_dir = Path(argument_after("--output-dir", DEFAULT_OUTPUT_DIR)).resolve()
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    validate_selection(selection)
    output_dir.mkdir(parents=True, exist_ok=True)
    profiles_dir = output_dir / "profiles"
    animations_dir = output_dir / "animations"
    profiles_dir.mkdir(parents=True, exist_ok=True)
    animations_dir.mkdir(parents=True, exist_ok=True)

    exported_profiles = []
    profile_skeletons = set()
    for profile in PROFILES:
        mesh_asset = load_asset(profile["meshPath"])
        skeleton = asset_skeleton(mesh_asset)
        if skeleton != EXPECTED_MESH_SKELETON:
            raise RuntimeError(
                "%s 使用的骨架不是 SK_Mannequin：%s" % (profile["label"], skeleton)
            )
        output_path = profiles_dir / profile["meshFileName"]
        run_asset_export_task(
            mesh_asset,
            "GLTFSkeletalMeshExporter",
            output_path,
            make_export_options(preview_mesh=False),
        )
        profile_skeletons.add(skeleton)
        exported_profiles.append({
            **profile,
            "sourceSkeleton": skeleton,
            "meshGlbPath": str(output_path),
            "meshBytes": output_path.stat().st_size,
        })
        log("exported %s -> %s" % (profile["meshPath"], output_path))

    exported_animations = []
    animation_skeletons = set()
    base_pose = selection["nativeBasePose"]
    base_asset = load_asset(base_pose["sourceAssetPath"])
    base_skeleton = asset_skeleton(base_asset)
    if base_skeleton != EXPECTED_MESH_SKELETON:
        raise RuntimeError(
            "%s 使用的骨架不是 SK_Mannequin：%s" % (base_pose.get("id"), base_skeleton)
        )
    base_output_path = animations_dir / native_animation_filename(base_pose)
    run_asset_export_task(
        base_asset,
        "GLTFAnimSequenceExporter",
        base_output_path,
        make_export_options(preview_mesh=False),
    )
    animation_skeletons.add(base_skeleton)
    exported_base_pose = {
        "id": base_pose["id"],
        "clipName": base_pose["clipName"],
        "purpose": base_pose.get("purpose"),
        "sourceAssetPath": base_pose["sourceAssetPath"],
        "sourceAssetName": base_pose["sourceAssetName"],
        "sourceSkeleton": base_skeleton,
        "sourceDurationSeconds": asset_length(base_asset),
        "animationGlbPath": str(base_output_path),
        "animationGlbFileName": base_output_path.name,
        "animationBytes": base_output_path.stat().st_size,
    }
    log("exported %s -> %s" % (base_pose["sourceAssetPath"], base_output_path))

    for clip in selection["clips"]:
        asset = load_asset(clip["sourceAssetPath"])
        skeleton = asset_skeleton(asset)
        if skeleton != EXPECTED_MESH_SKELETON:
            raise RuntimeError(
                "%s 使用的骨架不是 SK_Mannequin：%s" % (clip.get("id"), skeleton)
            )
        output_path = animations_dir / native_animation_filename(clip)
        run_asset_export_task(
            asset,
            "GLTFAnimSequenceExporter",
            output_path,
            make_export_options(preview_mesh=False),
        )
        animation_skeletons.add(skeleton)
        exported_animations.append({
            "id": clip["id"],
            "clipName": clip["clipName"],
            "sourceAssetPath": clip["sourceAssetPath"],
            "sourceAssetName": clip["sourceAssetName"],
            "sourceSkeleton": skeleton,
            "sourceDurationSeconds": asset_length(asset),
            "animationGlbPath": str(output_path),
            "animationGlbFileName": output_path.name,
            "animationBytes": output_path.stat().st_size,
        })
        log("exported %s -> %s" % (clip["sourceAssetPath"], output_path))

    all_skeletons = profile_skeletons | animation_skeletons
    if all_skeletons != {EXPECTED_MESH_SKELETON}:
        raise RuntimeError("native 导出结果没有统一使用 SK_Mannequin：%s" % sorted(all_skeletons))
    manifest = {
        "schemaVersion": 1,
        "pipeline": "ue5-native-no-retarget",
        "sourceProject": selection.get("sourceProject"),
        "sourceProjectPath": selection.get("sourceProjectPath"),
        "sourceAssetRoot": selection.get("sourceAssetRoot"),
        "selectionPath": str(selection_path),
        "basePose": exported_base_pose,
        "profiles": exported_profiles,
        "animations": exported_animations,
    }
    manifest_path = output_dir / "native-export-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    log("wrote native manifest -> %s" % manifest_path)


main()
