import { PrismaClient } from '@prisma/client';

// Single shared Prisma instance across the app (avoids exhausting DB connections
// in dev with hot-reload, and keeps a single pool in production).
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
