import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth-hash';
import type { Role } from '@/lib/engine/types';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'LPU Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({ where: { email: credentials.email.toLowerCase().trim() } });
        if (!user || !user.isActive) return null;
        if (!verifyPassword(credentials.password, user.passwordHash)) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          title: user.title ?? '',
          linkedFacultyId: user.linkedFacultyId ?? '',
          linkedGroupId: user.linkedGroupId ?? '',
        };
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.title = (user as { title: string }).title;
        token.linkedFacultyId = (user as { linkedFacultyId: string }).linkedFacultyId;
        token.linkedGroupId = (user as { linkedGroupId: string }).linkedGroupId;
      }
      return token;
    },
    async session({ session, token }) {
      const u = session.user as Record<string, unknown>;
      u.id = token.id as string;
      u.role = token.role as Role;
      u.title = token.title as string;
      u.linkedFacultyId = (token.linkedFacultyId as string) ?? '';
      u.linkedGroupId = (token.linkedGroupId as string) ?? '';
      return session;
    },
  },
  pages: { signIn: '/' },
  secret: process.env.NEXTAUTH_SECRET ?? 'lpu-agentic-scheduling-demo-secret-key-2026',
};
