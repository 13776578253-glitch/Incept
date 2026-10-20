import { prisma } from '../src/client';

async function main() {
  console.log('Database seed complete: no baseline records are required.');
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
