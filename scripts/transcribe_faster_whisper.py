import argparse
import json
import os
import site
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

if os.name == "nt" and hasattr(os, "add_dll_directory"):
    for base in site.getsitepackages() + [site.getusersitepackages()]:
        nvidia_root = os.path.join(base, "nvidia")
        for rel in (
            os.path.join("cublas", "bin"),
            os.path.join("cudnn", "bin"),
            os.path.join("cuda_nvrtc", "bin"),
        ):
            dll_dir = os.path.join(nvidia_root, rel)
            if os.path.isdir(dll_dir):
                os.add_dll_directory(dll_dir)


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper and return JSON.")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--language", default="auto")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        print(
            json.dumps(
                {
                    "error": (
                        "Python package faster-whisper is not installed. "
                        "Install it with: python -m pip install faster-whisper"
                    ),
                    "details": str(exc),
                }
            ),
            file=sys.stderr,
        )
        return 2

    model = WhisperModel(args.model, device=args.device, compute_type="int8")
    language = None if args.language == "auto" else args.language
    # Memory-safe settings for low-RAM / CPU environments
    # word_timestamps disabled by default to keep memory/stdout small; the worker only needs segment-level text
    segments_iter, info = model.transcribe(
        args.audio,
        language=language,
        vad_filter=True,
        word_timestamps=False,
        condition_on_previous_text=False,
        beam_size=5,
        vad_parameters={"min_silence_duration_ms": 500, "speech_pad_ms": 200},
    )

    segments = []
    words = []
    full_text_parts = []

    for segment in segments_iter:
        segment_words = []
        for word in segment.words or []:
            item = {
                "word": word.word.strip(),
                "start": round(float(word.start), 3),
                "end": round(float(word.end), 3),
            }
            words.append(item)
            segment_words.append(item)

        text = segment.text.strip()
        full_text_parts.append(text)
        segments.append(
            {
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
                "text": text,
                "words": segment_words,
            }
        )

    print(
        json.dumps(
            {
                "language": getattr(info, "language", args.language),
                "languageProbability": getattr(info, "language_probability", None),
                "duration": getattr(info, "duration", None),
                "fullText": " ".join(full_text_parts).strip(),
                "segments": segments,
                "words": words,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
