# 25 — Equipment & make-ahead labeling

> **🚫 Abandoned — not planned.** Users can already create their own manual labels for
> equipment and make-ahead handling, so seeding a fixed global vocabulary adds maintenance
> (and picker clutter) for little gain. Nothing depends on this plan: plan 38 (cooking
> timeline) states explicitly that these labels are **not** a dependency, and no other plan
> references it. The rest of this file is kept as-is for the record — including the standing
> design decision not to reintroduce `equipment`/`makeAhead` `Label.type` values — in case it
> is ever revived.

**Size:** S-M | **Depends on:** nothing

## Goal
Spec §2 lists equipment labels (slow cooker…) and make-ahead/refrigeration metadata. 

⚠️ **Respect a prior design decision**: dedicated `equipment`/`makeAhead` label *types* existed
once and were deliberately migrated into `type: 'manual'` (see `prisma/seed.ts:127-142`, which
migrates old types and seeds standard manual labels "Make-ahead", "Freezable", "Quick",
"Budget-friendly"). Do NOT reintroduce label types. Implement this as an expanded seeded set of
standard manual labels + filter UI affordance.

## Implementation

1. Extend `STANDARD_LABELS` in `prisma/seed.ts` (findFirst+create, idempotent, global
   `userId: null`):
   - Equipment: `Slow cooker`, `Instant Pot / pressure cooker`, `Air fryer`, `Oven`, `Stovetop
     only`, `No-cook`, `Grill`, `Blender / food processor`, `Stand mixer`.
   - Make-ahead/storage: `Make-ahead` (exists), `Freezable` (exists), `Refrigerate up to 3
     days`, `Night-before prep`.
2. Recipe form label picker already lists global + own manual labels — verify the grown list
   renders manageably (the picker in `RecipeForm.tsx`; group or alphabetize if it's a flat
   unordered list, judge in situ).
3. FilterPanel already filters by labels — verify multi-select works with the larger set; no
   logic change expected.
4. Timeline groundwork (used by plan 37): make-ahead detection should NOT depend on label
   string matching alone — that's plan 37's concern; here just ensure the seeded names above
   are stable strings (document in the seed file: "plan 37 references these names").
5. Tests: seed idempotency (run twice, count stable); labels endpoint returns the new globals;
   user labels unaffected.

## Acceptance
Fresh seed provides the equipment/make-ahead vocabulary; recipes can be labeled and filtered by
them; no schema change; spec §8 status updated.
