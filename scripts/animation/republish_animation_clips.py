# -*- coding: utf-8 -*-
"""Regenerate published clips with the current retarget pipeline and splice
them back into the assembled catalog GLB.

Usage:
  python republish_animation_clips.py --glb-dir <in-place-glb-dir> \
      [--catalog <UAL2_UE_Anims.glb>] [--base-glb <UAL2_Standard.glb>] \
      [--only <clip-id> ...] [--include-unpublished]

Clips whose regeneration fails the built-in reach/contact/translation gates
keep their previous animation data and are reported at the end, so a batch run
never degrades the catalog.
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from replace_catalog_animation import read_glb, replace_animation, write_glb

REPO_ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb-dir", required=True, type=Path,
                        help="目录包含策选清单引用的单片段源 GLB（Cine57-exported 的 in-place 目录）")
    parser.add_argument("--catalog", type=Path,
                        default=REPO_ROOT / "client/public/anims/cine57/UAL2_UE_Anims.glb")
    parser.add_argument("--base-glb", type=Path,
                        default=REPO_ROOT / "client/public/viewer-kit/quaternius/ual2/UAL2_Standard.glb")
    parser.add_argument("--only", nargs="*", help="只处理这些 clip id（默认全部已发布片段）")
    parser.add_argument("--include-unpublished", action="store_true",
                        help="连同 published=false 的片段一起重新生成")
    args = parser.parse_args()

    selection = json.loads(
        (Path(__file__).parent / "animationCatalogSelection.json").read_text(encoding="utf-8")
    )
    clips = selection["clips"]
    if not args.include_unpublished:
        clips = [clip for clip in clips if clip.get("published", True)]
    if args.only:
        wanted = set(args.only)
        clips = [clip for clip in clips if clip["id"] in wanted]
    if not clips:
        raise SystemExit("no clips matched the given filters")

    catalog, catalog_bin = read_glb(args.catalog)
    replaced, failed, missing = [], [], []
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for index, clip in enumerate(clips, start=1):
            source = args.glb_dir / clip["glbFileName"]
            if not source.is_file():
                missing.append(clip["id"])
                print("[WARN] missing source GLB: %s" % source)
                continue
            out_glb = tmp / (clip["id"] + ".glb")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).parent / "retarget_ual2.py"),
                    str(source),
                    str(args.base_glb),
                    str(out_glb),
                    clip["clipName"],
                ],
                capture_output=True,
                text=True,
            )
            if completed.returncode != 0:
                failed.append(clip["id"])
                tail = (completed.stdout + completed.stderr).strip().splitlines()[-2:]
                print("[FAIL] %s | %s" % (clip["id"], " | ".join(tail)))
                continue
            repl_glb, repl_bin = read_glb(out_glb)
            catalog, catalog_bin = replace_animation(
                catalog, catalog_bin, repl_glb, repl_bin, clip["clipName"]
            )
            replaced.append(clip["id"])
            print("[%d/%d] replaced %s" % (index, len(clips), clip["id"]))

    if replaced:
        write_glb(args.catalog, catalog, catalog_bin)
    print("done: replaced=%d failed=%d missing=%d (total=%d)"
          % (len(replaced), len(failed), len(missing), len(clips)))
    if failed:
        print("failed clips:", ", ".join(failed))
    if missing:
        print("missing sources:", ", ".join(missing))
    if failed or missing:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
