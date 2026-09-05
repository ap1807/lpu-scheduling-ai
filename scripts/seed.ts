/**
 * Seed the database with the LPU sample dataset.
 * Run: bun run scripts/seed.ts
 */
import { seedDatabase } from '../src/lib/data/seed';

seedDatabase()
  .then((summary) => {
    console.log('Seed complete:');
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
