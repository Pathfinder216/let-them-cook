import { config } from 'dotenv';
config();

import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { INGREDIENT_CATALOG } from '../src/constants/ingredientCatalog.js';
import { SUBSTITUTION_SEED } from '../src/constants/substitutionSeed.js';
import { stemVariants } from '../src/utils/stemVariants.js';

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Synonym groups. The first member found in INGREDIENT_CATALOG becomes the canonical entry;
// all other members (including any duplicate catalog entries) become aliases pointing to it.
const ALIAS_GROUPS: string[][] = [
  ['green onion', 'scallion', 'spring onion'],
  ['cilantro', 'coriander'],
  ['eggplant', 'aubergine'],
  ['zucchini', 'courgette'],
  ['arugula', 'rocket'],
  ['chickpea', 'garbanzo bean'],
  ['heavy cream', 'double cream'],
  ['cornstarch', 'cornflour'],
  ['baking soda', 'bicarbonate of soda'],
  ['ground beef', 'beef mince'],
  ['shrimp', 'prawn'],
  ['bell pepper', 'capsicum'],
  ['snow pea', 'mangetout'],
  ['half-and-half', 'single cream'],
  ['golden raisin', 'sultana'],
  ["confectioners' sugar", 'icing sugar', 'powdered sugar'],
  ['rutabaga', 'swede'],
  ['semisweet chocolate', 'semi-sweet chocolate', 'dark chocolate'],
  ['all-purpose flour', 'plain flour'],
  ['whole wheat flour', 'wholemeal flour'],
];

// plan 37 references these exact name strings for make-ahead/storage detection — do not
// rename without checking there. Equipment/make-ahead labels are deliberately just `manual`
// labels (see the migration below) — do NOT reintroduce dedicated label types.
const STANDARD_LABELS: { type: string; name: string }[] = [
  { type: 'manual', name: 'Make-ahead' },
  { type: 'manual', name: 'Freezable' },
  { type: 'manual', name: 'Quick' },
  { type: 'manual', name: 'Budget-friendly' },
  { type: 'manual', name: 'Refrigerate up to 3 days' },
  { type: 'manual', name: 'Night-before prep' },
  { type: 'manual', name: 'Slow cooker' },
  { type: 'manual', name: 'Instant Pot / pressure cooker' },
  { type: 'manual', name: 'Air fryer' },
  { type: 'manual', name: 'Oven' },
  { type: 'manual', name: 'Stovetop only' },
  { type: 'manual', name: 'No-cook' },
  { type: 'manual', name: 'Grill' },
  { type: 'manual', name: 'Blender / food processor' },
  { type: 'manual', name: 'Stand mixer' },
];

async function main() {
  console.log('Seeding ingredient catalog…');

  // Full reseed — wipe existing catalog and aliases
  await prisma.ingredientAlias.deleteMany({});
  await prisma.ingredientCatalog.deleteMany({});

  const catalogNameSet = new Set(INGREDIENT_CATALOG.map(([name]) => name.toLowerCase()));

  // For each alias group, find the canonical name (first group member present in catalog)
  // and mark any other catalog members as secondaries to be merged.
  const aliasToCanonical = new Map<string, string>(); // any group alias → canonical catalog name
  const secondaryNames = new Set<string>();            // catalog entries to merge (not create)

  for (const group of ALIAS_GROUPS) {
    const lower = group.map((g) => g.toLowerCase());
    const primaryInCatalog = lower.find((m) => catalogNameSet.has(m));
    if (!primaryInCatalog) continue; // no catalog entry for this group — skip

    for (const member of lower) {
      aliasToCanonical.set(member, primaryInCatalog);
      if (member !== primaryInCatalog && catalogNameSet.has(member)) {
        secondaryNames.add(member);
      }
    }
  }

  // Create catalog entries (skip secondary names — they become aliases of their canonical)
  const catalogIds = new Map<string, string>(); // canonical name → catalog ID

  for (const [name, allergens, diets] of INGREDIENT_CATALOG) {
    const lower = name.toLowerCase();
    if (secondaryNames.has(lower)) continue;

    const entry = await prisma.ingredientCatalog.create({
      data: { displayAlias: lower, allergens, diets, isUserAdded: false },
    });
    catalogIds.set(lower, entry.id);
  }

  // Build the full set of aliases for each catalog entry.
  // Each entry gets: its own name + stem variants, secondary names + their stem variants,
  // and all alias group members + their stem variants.
  const entryAliases = new Map<string, Set<string>>(); // canonical name → alias strings
  for (const canonicalName of catalogIds.keys()) {
    entryAliases.set(canonicalName, new Set(stemVariants(canonicalName)));
  }

  // Add secondary catalog entries (merged into their canonical)
  for (const secondary of secondaryNames) {
    const canonical = aliasToCanonical.get(secondary)!;
    const aliases = entryAliases.get(canonical);
    if (!aliases) continue;
    for (const v of stemVariants(secondary)) aliases.add(v);
  }

  // Add all alias group members (including non-catalog ones like "scallion", "aubergine", etc.)
  for (const group of ALIAS_GROUPS) {
    const lower = group.map((g) => g.toLowerCase());
    const canonical = lower.find((m) => catalogIds.has(m));
    if (!canonical) continue;
    const aliases = entryAliases.get(canonical)!;
    for (const member of lower) {
      for (const v of stemVariants(member)) aliases.add(v);
    }
  }

  // Insert alias records. Dedupe globally across catalog entries (first entry wins for a
  // shared alias) — the [alias, userId] unique can't dedupe via skipDuplicates because SQLite
  // treats null userId as distinct, so we dedupe here. Seeded aliases are global (userId null).
  const aliasToCatalog = new Map<string, string>();
  for (const [canonical, aliases] of entryAliases) {
    const catalogId = catalogIds.get(canonical)!;
    for (const alias of aliases) {
      if (!aliasToCatalog.has(alias)) aliasToCatalog.set(alias, catalogId);
    }
  }
  await prisma.ingredientAlias.createMany({
    data: Array.from(aliasToCatalog, ([alias, catalogId]) => ({ alias, catalogId })),
  });

  console.log(`Seeded ${catalogIds.size} catalog entries.`);

  // Migrate old label types and seed standard labels
  await prisma.label.updateMany({
    where: { type: { in: ['makeAhead', 'equipment'] } },
    data: { type: 'manual' },
  });

  console.log('Seeding standard labels…');
  for (const { type, name } of STANDARD_LABELS) {
    // Global labels have userId = null; null can't be used in a compound-unique where, so
    // look up explicitly and create if absent.
    const existing = await prisma.label.findFirst({ where: { type, name, userId: null } });
    if (!existing) {
      await prisma.label.create({ data: { type, name } });
    }
  }
  console.log(`Seeded ${STANDARD_LABELS.length} standard labels.`);

  // Seed official/global substitutions. Idempotent: unlike the catalog above we do NOT wipe the
  // table — user-created substitutions (isOfficial: false) must survive reseeds. Compound uniques
  // can't dedupe globals in SQLite (null createdBy is distinct in the index), so match with
  // findFirst on (from, to, isOfficial) and create only when absent.
  console.log('Seeding official substitutions…');
  let createdSubs = 0;
  for (const { from, to, ratio, notes } of SUBSTITUTION_SEED) {
    const fromIngredient = from.toLowerCase();
    const toIngredient = to.toLowerCase();
    const existing = await prisma.ingredientSubstitution.findFirst({
      where: { fromIngredient, toIngredient, isOfficial: true },
    });
    if (!existing) {
      await prisma.ingredientSubstitution.create({
        data: { fromIngredient, toIngredient, ratio, notes, isOfficial: true, createdBy: null },
      });
      createdSubs++;
    }
  }
  console.log(`Seeded ${createdSubs} new official substitutions (${SUBSTITUTION_SEED.length} total in set).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
