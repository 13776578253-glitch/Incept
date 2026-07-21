import { prisma } from '../src/client';

async function main() {
  await prisma.user.upsert({
    where: { username: 'system' },
    update: { role: 'content-system' },
    create: {
      username: 'system',
      role: 'content-system',
    },
  });

  console.log('Database seed complete: content system user is ready.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
