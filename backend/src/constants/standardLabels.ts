// Standard seeded `manual` labels (see prisma/seed.ts). Equipment and make-ahead/storage
// vocabulary (plan 25) is deliberately implemented as plain `manual` labels — dedicated
// `equipment`/`makeAhead` label *types* existed once and were migrated away from (see the
// type migration in prisma/seed.ts). Do NOT reintroduce label types.
//
// plan 37 references these exact name strings for make-ahead/storage detection — do not
// rename without checking there.
export interface StandardLabel {
  type: string;
  name: string;
}

export const STANDARD_LABELS: StandardLabel[] = [
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
