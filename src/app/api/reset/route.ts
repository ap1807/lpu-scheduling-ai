import { requireRole } from '@/lib/session';
import { seedDatabase } from '@/lib/data/seed';

export async function POST() {
  try {
    const user = await requireRole(['ADMIN']);
    const summary = await seedDatabase();
    return Response.json({ reseeded: true, summary });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: err instanceof Error ? err.message : 'Reseed failed' }, { status: 500 });
  }
}
