# -*- coding: utf-8 -*-
"""Replace one animation inside the assembled catalog GLB.

Usage:
  python replace_catalog_animation.py <catalog.glb> <replacement.glb> <animation-name>

The replacement GLB must contain the same animation name (as produced by
retarget_ual2.py against the same base skeleton). The old animation entry is
overwritten in place so animation order and every other clip stay untouched;
new buffers are appended and old accessors/bufferViews are left behind as
valid orphans.
"""
import argparse
import json
import struct
from pathlib import Path


def read_glb(path):
    data = Path(path).read_bytes()
    if data[:4] != b"glTF":
        raise ValueError("not a GLB: %s" % path)
    json_length = struct.unpack_from("<I", data, 12)[0]
    glb = json.loads(data[20:20 + json_length].decode("utf-8"))
    bin_header = 20 + json_length
    if data[bin_header + 4:bin_header + 8] != b"BIN\x00":
        raise ValueError("GLB has no binary chunk: %s" % path)
    bin_length = struct.unpack_from("<I", data, bin_header)[0]
    return glb, data[bin_header + 8:bin_header + 8 + bin_length]


def write_glb(path, glb, buffer_bytes):
    padded = pad4(buffer_bytes)
    glb["buffers"][0]["byteLength"] = len(padded)
    enc = json.dumps(glb, separators=(",", ":")).encode("utf-8")
    enc += b" " * ((4 - len(enc) % 4) % 4)
    total = 12 + 8 + len(enc) + 8 + len(padded)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(enc), 0x4E4F534A) + enc
    out += struct.pack("<II", len(padded), 0x004E4942) + padded
    Path(path).write_bytes(out)


def pad4(b):
    return b + b"\0" * ((4 - len(b) % 4) % 4)


def find_animation_index(glb, name, label):
    matches = [i for i, a in enumerate(glb.get("animations", [])) if a.get("name") == name]
    if len(matches) != 1:
        raise SystemExit("%s must contain exactly one animation named %r, found %d" % (label, name, len(matches)))
    return matches[0]


def replace_animation(catalog, catalog_bin, replacement, repl_bin, animation_name):
    """Return (catalog, buffer) with the named animation swapped in place.

    Animation order and every other clip stay untouched; new accessor data is
    appended to the buffer and old accessors/bufferViews remain as valid
    orphans.
    """
    if len(catalog.get("nodes", [])) != len(replacement.get("nodes", [])):
        raise SystemExit("node arrays differ: the replacement must be retargeted against the same base skeleton")

    src_index = find_animation_index(replacement, animation_name, "replacement GLB")
    dst_index = find_animation_index(catalog, animation_name, "catalog GLB")

    anim = replacement["animations"][src_index]
    view_map = {}
    acc_map = {}
    bin_parts = []
    bin_len = len(catalog_bin)

    for sampler in anim.get("samplers", []):
        for key in ("input", "output"):
            acc_index = sampler[key]
            if acc_index in acc_map:
                continue
            accessor = replacement["accessors"][acc_index]
            view_index = accessor["bufferView"]
            if view_index not in view_map:
                view = replacement["bufferViews"][view_index]
                start = view.get("byteOffset", 0)
                data = repl_bin[start:start + view["byteLength"]]
                if len(data) != view["byteLength"]:
                    raise SystemExit("replacement binary chunk truncated for bufferView %d" % view_index)
                view_map[view_index] = len(catalog["bufferViews"])
                catalog["bufferViews"].append({
                    "buffer": 0,
                    "byteOffset": bin_len,
                    "byteLength": view["byteLength"],
                })
                padded = pad4(data)
                bin_parts.append(padded)
                bin_len += len(padded)
            accessor = dict(accessor)
            accessor["bufferView"] = view_map[view_index]
            acc_map[acc_index] = len(catalog["accessors"])
            catalog["accessors"].append(accessor)

    new_anim = {
        "name": anim.get("name"),
        "samplers": [
            {**sampler, "input": acc_map[sampler["input"]], "output": acc_map[sampler["output"]]}
            for sampler in anim.get("samplers", [])
        ],
        "channels": anim.get("channels", []),
    }
    catalog["animations"][dst_index] = new_anim
    return catalog, catalog_bin + b"".join(bin_parts)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("catalog")
    parser.add_argument("replacement")
    parser.add_argument("animation_name")
    args = parser.parse_args()

    catalog, catalog_bin = read_glb(args.catalog)
    replacement, repl_bin = read_glb(args.replacement)
    catalog, buffer_bytes = replace_animation(catalog, catalog_bin, replacement, repl_bin, args.animation_name)
    write_glb(args.catalog, catalog, buffer_bytes)
    print("replaced animation %r at index %d (%d samplers, +%d bytes buffer)"
          % (args.animation_name,
             find_animation_index(catalog, args.animation_name, "catalog GLB"),
             len(catalog["animations"][find_animation_index(catalog, args.animation_name, "catalog GLB")]["samplers"]),
             len(buffer_bytes) - len(catalog_bin)))


if __name__ == "__main__":
    main()
