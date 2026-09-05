/**
 * Server-side RBAC guards. Every API route enforces permissions here —
 * never relying on frontend-only restrictions.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Role } from '@/lib/engine/types';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  linkedFacultyId: string;
  linkedGroupId: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const u = session.user as Record<string, unknown>;
  return {
    id: (u.id as string) ?? '',
    name: (u.name as string) ?? '',
    email: (u.email as string) ?? '',
    role: (u.role as Role) ?? 'STUDENT',
    title: (u.title as string) ?? '',
    linkedFacultyId: (u.linkedFacultyId as string) ?? '',
    linkedGroupId: (u.linkedGroupId as string) ?? '',
  };
}

export function hasRole(user: SessionUser, roles: Role[]): boolean {
  return roles.includes(user.role);
}

/** Returns the user or throws a 401 JSON response. */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw Response.json({ error: 'Authentication required' }, { status: 401 });
  }
  return user;
}

/** Returns the user if role allowed, else throws 403 JSON response. */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!hasRole(user, roles)) {
    throw Response.json({ error: `Forbidden: this action requires role ${roles.join(' or ')}` }, { status: 403 });
  }
  return user;
}

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'System Administrator',
  SCHEDULER: 'Academic Scheduler',
  FACULTY: 'Faculty Member',
  STUDENT: 'Student',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: 'Full system visibility, approval authority, rules & user management',
  SCHEDULER: 'Manage schedules, investigate conflicts, run AI analysis & simulations',
  FACULTY: 'View own schedule, relevant conflicts and permitted recommendations',
  STUDENT: 'Read-only access to own timetable and relevant schedule information',
};
