import { NextResponse } from 'next/server';

// Liveness probe — used by Cell 2.7 verification and any future
// orchestration. Intentionally has no DB dependency.
export function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'web',
    timestamp: new Date().toISOString(),
  });
}
