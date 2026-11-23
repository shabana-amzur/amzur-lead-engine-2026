import { PrismaClient } from '@prisma/client';

// Read-only operations are safe to repeat, so retry them when the database
// connection hiccups (seen on serverless cold starts when several requests
// arrive at once).
const READ_OPERATIONS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
]);
const RETRY_DELAYS_MS = [200, 600];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createClient = () =>
  new PrismaClient().$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, model, args, query }) {
          if (!READ_OPERATIONS.has(operation)) {
            return query(args);
          }

          for (let attempt = 0; ; attempt++) {
            try {
              return await query(args);
            } catch (error: any) {
              if (attempt >= RETRY_DELAYS_MS.length) throw error;
              console.warn(
                `Retrying ${model}.${operation} after database error (${error?.code ?? error?.errorCode ?? error?.name}): ${error?.message}`
              );
              await sleep(RETRY_DELAYS_MS[attempt]);
            }
          }
        },
      },
    },
  });

// Reuse one client per serverless instance / dev process.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

const prisma = globalForPrisma.prisma ?? createClient();
globalForPrisma.prisma = prisma;

export default prisma;
