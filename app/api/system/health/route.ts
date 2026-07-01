import { NextResponse } from 'next/server';
import { validateEnvironment } from '@/lib/system/environmentValidator.mjs';

export async function GET() {
  const result = await validateEnvironment();
  return NextResponse.json({ data: result });
}
