/**
 * One-time data migration: rewrite existing ingredient + grocery units to their canonical
 * abbreviations (see src/constants/units.ts).
 *
 * Run once after deploying plan 18:  npm run db:normalize-units
 *
 * No schema change — safe to run anytime, and idempotent: rows already canonical are skipped,
 * and re-running converges to the same result. Only rows whose unit actually changes are written.
 */

import { config } from 'dotenv';
config();

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { normalizeUnit } from '../src/constants/units.js';

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Normalizing ingredient + grocery units…');

  let ingredientsChanged = 0;
  const ingredients = await prisma.ingredient.findMany({ select: { id: true, unit: true } });
  for (const ing of ingredients) {
    const canonical = normalizeUnit(ing.unit);
    if (canonical !== ing.unit) {
      await prisma.ingredient.update({ where: { id: ing.id }, data: { unit: canonical } });
      ingredientsChanged++;
    }
  }

  let groceryChanged = 0;
  const groceryItems = await prisma.groceryItem.findMany({ select: { id: true, unit: true } });
  for (const item of groceryItems) {
    const canonical = normalizeUnit(item.unit);
    if (canonical !== item.unit) {
      await prisma.groceryItem.update({ where: { id: item.id }, data: { unit: canonical } });
      groceryChanged++;
    }
  }

  console.log(`  Ingredients updated: ${ingredientsChanged} / ${ingredients.length}`);
  console.log(`  Grocery items updated: ${groceryChanged} / ${groceryItems.length}`);
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
