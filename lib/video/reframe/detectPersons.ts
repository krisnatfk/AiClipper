import type { TimedDetection } from './types';

export async function detectPersons(): Promise<TimedDetection[]> {
  throw new Error('Person detection runs through scripts/track_subject.py in this MVP.');
}
