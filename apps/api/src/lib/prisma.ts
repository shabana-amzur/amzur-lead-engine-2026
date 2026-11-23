import { PrismaClient } from '@prisma/client';

// Reuse one client per serverless instance / dev process.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? new PrismaClient();
globalForPrisma.prisma = prisma;

export default prisma;
