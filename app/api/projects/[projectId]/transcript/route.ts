import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { transcripts } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

function parseSrtTimestamp(value: string) {
  const match = value.trim().match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
  if (!match) return null;
  const [, hh, mm, ss, ms] = match;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
}

function parseSrt(content: string) {
  const blocks = content
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const segments = [];
  const words = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timeLine = lines.find((line) => line.includes('-->'));
    if (!timeLine) continue;
    const [startRaw, endRaw] = timeLine.split('-->').map((part) => part.trim().split(/\s+/)[0]);
    const start = parseSrtTimestamp(startRaw);
    const end = parseSrtTimestamp(endRaw);
    if (start == null || end == null || end <= start) continue;
    const textStart = lines.indexOf(timeLine) + 1;
    const text = lines.slice(textStart).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const textWords = text.split(/\s+/).filter(Boolean);
    const wordDuration = (end - start) / Math.max(1, textWords.length);
    const segmentWords = textWords.map((word, index) => ({
      word,
      start: Number((start + index * wordDuration).toFixed(3)),
      end: Number((start + (index + 1) * wordDuration).toFixed(3)),
    }));
    segments.push({ start, end, text, words: segmentWords });
    words.push(...segmentWords);
  }

  return {
    fullText: segments.map((segment) => segment.text).join(' ').trim(),
    segments,
    words,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.project_id, params.projectId))
      .orderBy(desc(transcripts.created_at))
      .limit(1);

    if (!transcript) {
      // No transcript yet is not an error — it just hasn't been generated.
      // Return 200 with null so the frontend polling loop doesn't log 404s
      // every 20s before the worker reaches the TRANSCRIBING step.
      return NextResponse.json({
        data: null,
        meta: {
          projectId: params.projectId,
          status: 'pending',
        },
      });
    }

    return NextResponse.json({
      data: transcript,
      meta: {
        projectId: params.projectId,
      },
    });
  } catch (error) {
    console.error('Failed to fetch transcript:', error);

    return NextResponse.json(
      {
        error: {
          code: 'FETCH_TRANSCRIPT_ERROR',
          message: 'Failed to fetch transcript',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'SRT file is required.' } },
        { status: 400 }
      );
    }

    if (!file.name.toLowerCase().endsWith('.srt')) {
      return NextResponse.json(
        { error: { code: 'INVALID_SRT', message: 'Please upload a .srt subtitle file.' } },
        { status: 400 }
      );
    }

    const content = await file.text();
    const parsed = parseSrt(content);
    if (!parsed.segments.length || !parsed.fullText) {
      return NextResponse.json(
        { error: { code: 'INVALID_SRT', message: 'The SRT file has no valid timestamped subtitle blocks.' } },
        { status: 400 }
      );
    }

    await db.delete(transcripts).where(eq(transcripts.project_id, params.projectId));
    await db.insert(transcripts).values({
      project_id: params.projectId,
      language: 'uploaded',
      full_text: parsed.fullText,
      segments: parsed.segments,
      words: parsed.words,
      engine: 'uploaded-srt',
      raw_response: {
        source: 'uploaded-srt',
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      data: { projectId: params.projectId, uploaded: true },
      meta: { segments: parsed.segments.length, words: parsed.words.length },
    });
  } catch (error) {
    console.error('Failed to upload SRT:', error);
    return NextResponse.json(
      {
        error: {
          code: 'UPLOAD_SRT_ERROR',
          message: error instanceof Error ? error.message : 'Failed to upload SRT file',
        },
      },
      { status: 500 }
    );
  }
}
