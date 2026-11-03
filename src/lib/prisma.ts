import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Connects Prisma to PostgreSQL using the connection string from .env
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

// Next.js reloads files constantly during development. Storing the client
// globally stops it from opening a new database connection on every reload.
const globalForPrisma = global as unknown as {
  prisma: PrismaClient;
};

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
