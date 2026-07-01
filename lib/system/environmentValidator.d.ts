export interface EnvironmentValidationResult {
  ok: boolean;
  ffmpeg: { ok: boolean; path: string | null; version: string | null };
  ffprobe: { ok: boolean; path: string | null; version: string | null };
  python: { ok: boolean; path: string | null; version: string | null };
  packages: {
    faster_whisper: boolean;
    cv2: boolean;
    mediapipe: boolean;
    numpy: boolean;
  };
  cuda: {
    requested: boolean;
    available: boolean;
    fallbackToCpu: boolean;
    message: string;
  };
  warnings: string[];
  errors: string[];
  installCommand: string | null;
  paths: { ffmpeg: string | null; ffprobe: string | null; python: string | null };
  whisper: { engine: string; model: string; device: string };
}

export function validateEnvironment(): Promise<EnvironmentValidationResult>;
