import argparse
import json
import sys


def check_package(name):
    try:
        __import__(name)
        return True
    except Exception:
        return False


def test_cuda():
    try:
        import torch
        if not torch.cuda.is_available():
            return {"available": False, "message": "PyTorch reports CUDA is not available."}
        return {"available": True, "message": f"CUDA available: {torch.cuda.get_device_name(0)}"}
    except Exception as exc:
        return {"available": False, "message": f"CUDA check failed: {exc}"}


def main():
    parser = argparse.ArgumentParser(description="Check AutoClip AI Python environment.")
    parser.add_argument("--test-cuda", action="store_true", help="Also test CUDA availability.")
    args = parser.parse_args()

    packages = {
        "faster_whisper": "faster_whisper",
        "cv2": "cv2",
        "mediapipe": "mediapipe",
        "numpy": "numpy",
    }

    result = {
        "ok": True,
        "python_executable": sys.executable,
        "python_version": ".".join(str(p) for p in sys.version_info[:3]),
        "packages": {key: check_package(module) for key, module in packages.items()},
        "cuda": {"requested": args.test_cuda, "available": False, "message": "Not tested."},
    }

    if args.test_cuda:
        result["cuda"] = {**result["cuda"], **test_cuda()}

    result["ok"] = all(result["packages"].values())

    if not result["ok"]:
        missing = [name for name, ok in result["packages"].items() if not ok]
        result["error"] = f"Missing Python packages: {', '.join(missing)}"
        result["missing_packages"] = missing

    print(json.dumps(result, ensure_ascii=False))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
