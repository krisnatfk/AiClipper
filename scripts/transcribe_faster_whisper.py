"""Chunked audio transcription with faster-whisper for memory safety."""
import argparse
import glob
import json
import os
import shutil
import site
import subprocess
import sys
import tempfile

# Set memory-safe threading limits BEFORE importing heavy libraries.
os.environ.setdefault("OMP_NUM_THREADS", os.environ.get("OMP_NUM_THREADS", "4"))
os.environ.setdefault("MKL_NUM_THREADS", os.environ.get("MKL_NUM_THREADS", "4"))
os.environ.setdefault("NUMEXPR_NUM_THREADS", os.environ.get("NUMEXPR_NUM_THREADS", "4"))

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


def log_json(obj):
    print(json.dumps(obj, ensure_ascii=False), flush=True)


def log_json_stderr(obj):
    print(json.dumps(obj, ensure_ascii=False), file=sys.stderr, flush=True)


def is_memory_error(exc):
    msg = str(exc).lower()
    return any(keyword in msg for keyword in ["mkl_malloc", "failed to allocate memory", "out of memory", "memoryerror", "unable to allocate"])


def is_cuda_library_error(exc):
    msg = str(exc).lower()
    return any(keyword in msg for keyword in ["cublas", "cudnn", "cuda", "no cuda", "cuda runtime"])


def get_ffmpeg_cmd():
    return os.environ.get("FFMPEG_PATH", "ffmpeg")


def get_ffprobe_cmd():
    return os.environ.get("FFPROBE_PATH", "ffprobe")


def get_audio_duration(audio_path):
    """Get audio duration in seconds using ffprobe."""
    cmd = [
        get_ffprobe_cmd(), "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", audio_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except Exception:
        return None


def split_audio_with_ffmpeg(audio_path, chunk_dir, chunk_seconds):
    """Split audio into chunk files using FFmpeg segment muxer."""
    os.makedirs(chunk_dir, exist_ok=True)
    pattern = os.path.join(chunk_dir, "chunk_%03d.wav")
    cmd = [
        get_ffmpeg_cmd(), "-y", "-i", audio_path,
        "-vn", "-ac", "1", "-ar", "16000",
        "-f", "segment", "-segment_time", str(chunk_seconds),
        "-c", "pcm_s16le",
        pattern,
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)
    chunks = sorted(glob.glob(os.path.join(chunk_dir, "chunk_*.wav")))
    return chunks


def transcribe_with_model(model, audio_path, language, vad_params):
    segments_iter, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True,
        word_timestamps=True,
        condition_on_previous_text=False,
        beam_size=5,
        vad_parameters=vad_params,
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

    return {
        "language": getattr(info, "language", language),
        "languageProbability": getattr(info, "language_probability", None),
        "duration": getattr(info, "duration", None),
        "fullText": " ".join(full_text_parts).strip(),
        "segments": segments,
        "words": words,
    }


def transcribe_chunk(model, chunk_path, language, vad_params, offset):
    """Transcribe one chunk and offset its segment timestamps."""
    result = transcribe_with_model(model, chunk_path, language, vad_params)
    for segment in result["segments"]:
        segment["start"] = round(segment["start"] + offset, 3)
        segment["end"] = round(segment["end"] + offset, 3)
    for word in result["words"]:
        word["start"] = round(word["start"] + offset, 3)
        word["end"] = round(word["end"] + offset, 3)
    return result


def merge_chunk_results(results):
    if not results:
        return {"language": None, "languageProbability": None, "duration": 0, "fullText": "", "segments": [], "words": []}
    base = results[0]
    for result in results[1:]:
        base["fullText"] = (base["fullText"] + " " + result["fullText"]).strip()
        base["segments"].extend(result["segments"])
        base["words"].extend(result["words"])
    base["duration"] = round(base["segments"][-1]["end"] if base["segments"] else 0, 3)
    return base


def transcribe_full(model, audio_path, language, vad_params, chunk_seconds, max_retries):
    duration = get_audio_duration(audio_path)
    log_json({"event": "audio_duration", "duration_seconds": duration, "duration_minutes": round(duration / 60, 1) if duration else None})

    if duration is None:
        raise RuntimeError("Could not detect audio duration with ffprobe.")

    # Short audio: transcribe directly without chunking.
    if duration <= chunk_seconds:
        log_json({"event": "transcribe_start", "chunked": False})
        return transcribe_with_model(model, audio_path, language, vad_params)

    chunk_dir = tempfile.mkdtemp(prefix="whisper_chunks_")
    try:
        log_json({"event": "chunking_start", "chunk_seconds": chunk_seconds, "total_duration": duration})
        chunks = split_audio_with_ffmpeg(audio_path, chunk_dir, chunk_seconds)
        total_chunks = len(chunks)
        log_json({"event": "chunks_created", "total_chunks": total_chunks, "chunk_seconds": chunk_seconds})

        results = []
        for idx, chunk_path in enumerate(chunks, start=1):
            offset = (idx - 1) * chunk_seconds
            log_json({"event": "transcribe_chunk_start", "chunk": idx, "total_chunks": total_chunks, "offset_seconds": offset})

            last_error = None
            for attempt in range(max(1, max_retries + 1)):
                try:
                    result = transcribe_chunk(model, chunk_path, language, vad_params, offset)
                    results.append(result)
                    break
                except Exception as exc:
                    last_error = exc
                    if is_memory_error(exc) and attempt < max_retries:
                        log_json_stderr({"warning": f"Memory error transcribing chunk {idx}/{total_chunks}, retrying.", "details": str(exc), "attempt": attempt + 1})
                    else:
                        raise RuntimeError(
                            f"Transcription chunk failed at minute {round(offset / 60)}-{round((offset + chunk_seconds) / 60)}. {exc}"
                        ) from exc
            log_json({"event": "transcribe_chunk_done", "chunk": idx, "total_chunks": total_chunks})

        log_json({"event": "merging_chunks", "total_chunks": total_chunks})
        merged = merge_chunk_results(results)
        log_json({"event": "transcription_completed", "total_chunks": total_chunks})
        return merged
    finally:
        shutil.rmtree(chunk_dir, ignore_errors=True)


def load_model(model_name, device, compute_type, cpu_threads, num_workers):
    from faster_whisper import WhisperModel
    return WhisperModel(
        model_name,
        device=device,
        compute_type=compute_type,
        cpu_threads=cpu_threads,
        num_workers=num_workers,
    )


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with faster-whisper using chunked processing for memory safety.")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default=os.environ.get("WHISPER_MODEL", "base"))
    parser.add_argument("--device", default=os.environ.get("WHISPER_DEVICE", "cpu"))
    parser.add_argument("--compute-type", default=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"))
    parser.add_argument("--language", default="auto")
    parser.add_argument("--chunk-seconds", type=int, default=int(os.environ.get("TRANSCRIBE_CHUNK_SECONDS", "300")))
    parser.add_argument("--max-retries", type=int, default=int(os.environ.get("TRANSCRIBE_MAX_RETRIES", "2")))
    parser.add_argument("--max-threads", type=int, default=int(os.environ.get("TRANSCRIBE_MAX_THREADS", "4")))
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except Exception as exc:
        log_json_stderr({
            "error": "Python package faster-whisper is not installed. Install it with the command shown in Settings → System Health.",
            "details": str(exc),
        })
        return 2

    device = args.device
    compute_type = args.compute_type or ("int8_float16" if device == "cuda" else "int8")
    language = None if args.language == "auto" else args.language

    vad_params = {
        "min_silence_duration_ms": 500,
        "speech_pad_ms": 200,
    }

    model_names = [args.model]
    if args.model == "small" and "base" not in model_names:
        model_names.extend(["base", "tiny"])
    elif args.model == "base" and "tiny" not in model_names:
        model_names.append("tiny")

    last_error = None
    for model_name in model_names:
        try:
            log_json({"event": "loading_model", "model": model_name, "device": device, "compute_type": compute_type})
            model = load_model(model_name, device, compute_type, args.max_threads, 1)
            result = transcribe_full(model, args.audio, language, vad_params, args.chunk_seconds, args.max_retries)
            if model_name != args.model:
                result["model_fallback"] = model_name
            break
        except RuntimeError as exc:
            last_error = exc
            if device == "cuda" and is_cuda_library_error(exc):
                log_json_stderr({"warning": "CUDA transcription failed. Falling back to CPU.", "details": str(exc), "recommendation": "Set WHISPER_DEVICE=cpu to avoid CUDA initialization."})
                try:
                    model = load_model(model_name, "cpu", "int8", args.max_threads, 1)
                    result = transcribe_full(model, args.audio, language, vad_params, args.chunk_seconds, args.max_retries)
                    result["fallback"] = "cpu"
                    break
                except Exception as cpu_exc:
                    last_error = cpu_exc
                    log_json_stderr({"warning": f"Model {model_name} CPU fallback failed.", "details": str(cpu_exc)})
            elif is_memory_error(exc) and model_name != model_names[-1]:
                log_json_stderr({"warning": f"Memory error with model {model_name}, retrying with lighter model.", "details": str(exc)})
            else:
                log_json_stderr({"error": f"Transcription failed because the audio is too long for available memory. The system retried with smaller chunks and a lighter Whisper model.", "details": str(exc)})
                return 1
        except Exception as exc:
            last_error = exc
            log_json_stderr({"error": f"Transcription failed: {exc}", "details": str(exc)})
            return 1
    else:
        log_json_stderr({"error": "Transcription failed because the audio is too long for available memory. The system retried with smaller chunks and a lighter Whisper model.", "details": str(last_error)})
        return 1

    output_json = json.dumps(result, ensure_ascii=False)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
    else:
        print(output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
