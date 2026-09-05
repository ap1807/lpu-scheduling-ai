import { requireRole } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  try {
    await requireRole(['ADMIN']);
    const users = await db.user.findMany({ select: { id: true, email: true, name: true, role: true, title: true, isActive: true, createdAt: true } });
    return Response.json({ users });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Failed to load users' }, { status: 500 });
  }
}

export async function PUT() {
  return Response.json({ error: 'User management is read-only in the demo build' }, { status: 400 });
}

void db;
