export function getEnvPath(key: string, options?: { required?: boolean }): string | null;
export function getPythonPath(): string;
export function getFfmpegPath(): string;
export function getFfprobePath(): string;
export function getWhisperConfig(): { engine: string; model: string; device: string };
