import { ensureSeeded } from '@/lib/data/seed';

export async function POST() {
  try {
    const seeded = await ensureSeeded();
    return Response.json({ seeded, message: seeded ? 'Database seeded with LPU sample data' : 'Database already contains data' });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Bootstrap failed' }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}
