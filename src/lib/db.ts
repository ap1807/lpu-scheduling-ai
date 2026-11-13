import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function resolveSqliteUrl(): string | undefined {
  const candidates = [
    path.resolve(process.cwd(), 'db', 'custom.db'),
    path.resolve(process.cwd(), 'prisma', 'custom.db'),
    path.resolve(process.cwd(), 'prisma', 'db', 'custom.db'),
    path.resolve(process.cwd(), '.next', 'standalone', 'db', 'custom.db'),
    '/app/db/custom.db',
    '/app/prisma/custom.db',
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const normalized = candidate.replace(/\\/g, '/')
      return `file:${normalized}`
    }
  }

  const defaultDir = path.resolve(process.cwd(), 'db')
  if (!fs.existsSync(defaultDir)) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true })
    } catch {}
  }

  return undefined
}

const resolvedUrl = resolveSqliteUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    ...(resolvedUrl ? { datasources: { db: { url: resolvedUrl } } } : {}),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
