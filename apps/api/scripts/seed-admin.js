const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@amzur.com' },
    update: {},
    create: {
      email: 'admin@amzur.com',
      passwordHash,
    },
  });
  console.log('Admin account is ready.');
}

main()
  .catch((error) => {
    console.error('Failed to seed admin account:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });