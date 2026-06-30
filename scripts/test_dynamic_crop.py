#!/usr/bin/env python3
"""Build an FFmpeg dynamic crop command from track_subject.py JSON and render a test clip."""
import json
import math
import subprocess
import sys
from pathlib import Path


def build_dynamic_crop_filter(tracking):
    """Reproduce the Node worker's buildDynamicCropFilter in Python."""
    if not tracking or tracking.get("mode") == "fit-blur" or not tracking.get("tracked") or not tracking.get("keyframes"):
        return None

    kfs = tracking["keyframes"]
    out_w = tracking.get("cropW", kfs[0]["w"] if kfs else 1080)
    out_h = tracking.get("cropH", kfs[0]["h"] if kfs else 1920)

    if len(kfs) == 1:
        return {
            "outW": out_w,
            "outH": out_h,
            "xExpr": str(round(kfs[0]["x"])),
            "yExpr": str(round(kfs[0]["y"])),
        }

    x_expr = ""
    y_expr = ""
    for i, kf in enumerate(kfs):
        next_kf = kfs[i + 1] if i + 1 < len(kfs) else None
        x0 = round(kf["x"])
        y0 = round(kf["y"])
        t0 = kf["t"]

        if next_kf is None:
            x_expr += str(x0)
            y_expr += str(y0)
            opens = len(kfs) - 1
            x_expr += ")" * opens
            y_expr += ")" * opens
            break

        x1 = round(next_kf["x"])
        y1 = round(next_kf["y"])
        t1 = next_kf["t"]
        dt = max(0.001, t1 - t0)
        x_slope = (x1 - x0) / dt
        y_slope = (y1 - y0) / dt

        if i == 0:
            x_expr = f"if(lt(t,{t1}),{x0}+({x_slope})*(t-{t0}),"
            y_expr = f"if(lt(t,{t1}),{y0}+({y_slope})*(t-{t0}),"
        else:
            x_expr += f"if(lt(t,{t1}),{x0}+({x_slope})*(t-{t0}),"
            y_expr += f"if(lt(t,{t1}),{y0}+({y_slope})*(t-{t0}),"

    return {"outW": out_w, "outH": out_h, "xExpr": x_expr, "yExpr": y_expr}


def main():
    if len(sys.argv) < 3:
        print("Usage: python scripts/test_dynamic_crop.py <track_json> <input_video> [output_mp4]")
        sys.exit(1)

    json_path = Path(sys.argv[1])
    input_video = Path(sys.argv[2])
    output_path = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("storage/tmp/test_dynamic_crop.mp4")

    tracking = json.loads(json_path.read_text())
    dyn_crop = build_dynamic_crop_filter(tracking)

    if not dyn_crop:
        print("No dynamic crop available (fit-blur or no keyframes).")
        sys.exit(1)

    print(f"crop={dyn_crop['outW']}:{dyn_crop['outH']}:{dyn_crop['xExpr']}:{dyn_crop['yExpr']}")

    filter_complex = (
        f"[0:v]crop={dyn_crop['outW']}:{dyn_crop['outH']}:{dyn_crop['xExpr']}:{dyn_crop['yExpr']},"
        f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[v_crop]"
    )

    cmd = [
        "ffmpeg", "-y", "-ss", "0", "-t", "5",
        "-i", str(input_video),
        "-filter_complex", filter_complex,
        "-map", "[v_crop]", "-an",
        str(output_path),
    ]
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True)
    print(f"Saved {output_path}")


if __name__ == "__main__":
    main()
