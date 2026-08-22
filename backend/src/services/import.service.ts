import { safeFetch } from '../utils/safeFetch.js';
import { normalizeUnit } from '../constants/units.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedIngredient {
  name: string;
  originalName: string;
  amount: number | null;
  unit: string | null;
  isOptional: boolean;
  orderIndex: number;
}

export interface ParsedStep {
  orderIndex: number;
  instruction: string;
  timeMinutes: number | null;
  isActiveTime: boolean;
}

export interface ParsedRecipe {
  title: string;
  servings: number;
  totalTime: number | null;
  activeTime: number | null;
  source: string | null;
  authorNotes: string | null;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
}

// ---------------------------------------------------------------------------
// URL import (JSON-LD schema.org/Recipe)
// ---------------------------------------------------------------------------

interface SchemaRecipe {
  '@type'?: string | string[];
  name?: string;
  recipeIngredient?: string[];
  recipeInstructions?: unknown;
  recipeYield?: string | number | string[];
  totalTime?: string;
  cookTime?: string;
  prepTime?: string;
  description?: string;
  url?: string;
  author?: { name?: string } | string;
}

function parseDuration(iso: string | undefined): number | null {
  if (!iso) return null;
  // ISO 8601 duration: PT1H30M, PT45M, P0DT1H
  const match = iso.match(/(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  const hours = parseInt(match[1] ?? '0', 10);
  const mins = parseInt(match[2] ?? '0', 10);
  const total = hours * 60 + mins;
  return total > 0 ? total : null;
}

function parseServings(raw: string | number | string[] | undefined): number {
  if (raw === undefined || raw === null) return 4;
  const str = Array.isArray(raw) ? raw[0] : String(raw);
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : 4;
}

function extractJsonLd(html: string): SchemaRecipe | null {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      // Could be a single object or array
      const items: unknown[] = Array.isArray(data)
        ? data
        : data['@graph']
          ? (data['@graph'] as unknown[])
          : [data];

      for (const item of items) {
        const obj = item as SchemaRecipe;
        const type = obj['@type'];
        const types = Array.isArray(type) ? type : [type ?? ''];
        if (types.some((t) => t === 'Recipe')) return obj;
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

function parseInstructionText(raw: unknown): string {
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj['text'] === 'string') return obj['text'].trim();
    if (typeof obj['name'] === 'string') return obj['name'].trim();
  }
  return '';
}

function schemaToRecipe(schema: SchemaRecipe, url: string): ParsedRecipe {
  const instructions = schema.recipeInstructions ?? [];
  const steps: ParsedStep[] = [];

  if (Array.isArray(instructions)) {
    instructions.forEach((instr, i) => {
      const text = parseInstructionText(instr);
      if (text) steps.push({ orderIndex: i, instruction: text, timeMinutes: null, isActiveTime: true });
    });
  } else if (typeof instructions === 'string') {
    instructions.split(/\n+/).forEach((line, i) => {
      const text = line.trim();
      if (text) steps.push({ orderIndex: i, instruction: text, timeMinutes: null, isActiveTime: true });
    });
  }

  const ingredients = (schema.recipeIngredient ?? []).map((raw, i) =>
    parseIngredientLine(raw, i),
  );

  const totalTime = parseDuration(schema.totalTime) ??
    addDurations(parseDuration(schema.cookTime), parseDuration(schema.prepTime));
  const prepTime = parseDuration(schema.prepTime);

  return {
    title: schema.name ?? 'Untitled Recipe',
    servings: parseServings(schema.recipeYield),
    totalTime,
    activeTime: prepTime,
    source: url,
    authorNotes: schema.description?.slice(0, 2000) ?? null,
    ingredients,
    steps,
  };
}

function addDurations(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

export async function importFromUrl(url: string): Promise<ParsedRecipe> {
  // safeFetch hardens this against SSRF — it only fetches public http(s) URLs.
  const { body: html } = await safeFetch(url);
  const schema = extractJsonLd(html);

  if (schema) {
    return schemaToRecipe(schema, url);
  }

  // Fallback: extract plain text and parse heuristically
  const text = stripHtml(html);
  const parsed = parseTextRecipe(text);
  return { ...parsed, source: url };
}

// ---------------------------------------------------------------------------
// Text-based parsing (shared for DOCX, PDF, plain text)
// ---------------------------------------------------------------------------

const UNITS = new Set([
  'cup', 'cups', 'c',
  'tablespoon', 'tablespoons', 'tbsp', 'tbs', 'T',
  'teaspoon', 'teaspoons', 'tsp', 't',
  'ounce', 'ounces', 'oz',
  'pound', 'pounds', 'lb', 'lbs',
  'gram', 'grams', 'g',
  'kilogram', 'kilograms', 'kg',
  'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres',
  'liter', 'liters', 'litre', 'litres', 'l', 'L',
  'pinch', 'pinches', 'dash', 'dashes',
  'slice', 'slices', 'piece', 'pieces',
  'clove', 'cloves', 'head', 'bunch', 'bunches',
  'can', 'cans', 'package', 'packages', 'pkg',
  'stick', 'sticks',
]);

const FRACTION_MAP: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  '1/2': 0.5, '1/3': 1 / 3, '2/3': 2 / 3, '1/4': 0.25, '3/4': 0.75,
  '1/8': 0.125, '3/8': 0.375, '5/8': 0.625, '7/8': 0.875,
  '1/6': 1 / 6, '5/6': 5 / 6, '1/5': 0.2, '2/5': 0.4,
  '3/5': 0.6, '4/5': 0.8,
};

function parseAmount(token: string): number | null {
  // Try fraction glyph / slash fraction
  if (FRACTION_MAP[token] !== undefined) return FRACTION_MAP[token];
  const n = parseFloat(token);
  return isNaN(n) ? null : n;
}

export function parseIngredientLine(line: string, index: number): ParsedIngredient {
  const original = line.trim();
  let remaining = original;

  // Strip leading bullet or numbered-list marker (e.g. "- ", "• ", "1. ", "2) ")
  // but NOT plain digits that are part of an amount (e.g. "2 cups flour")
  remaining = remaining.replace(/^[-•*·]\s*|^\d+[.)]\s+/, '');

  // Optional flag
  const isOptional = /optional/i.test(remaining);

  // Try to extract amount (integer, decimal, fraction glyph, slash fraction)
  let amount: number | null = null;
  let unit: string | null = null;

  // Try slash fractions and fraction glyphs before plain integers to avoid "1" matching "1/4"
  const amountRe = /^(½|⅓|⅔|¼|¾|⅛|⅜|⅝|⅞|\d+\/\d+|[\d,]+(?:\.\d+)?)\s*/;
  const amtMatch = remaining.match(amountRe);
  if (amtMatch) {
    const raw = amtMatch[1].replace(',', '.');
    amount = parseAmount(raw);
    remaining = remaining.slice(amtMatch[0].length);

    // Possible fraction following a whole number: "1 ½"
    const fracMatch = remaining.match(/^(½|⅓|⅔|¼|¾|⅛|⅜|⅝|⅞|\d+\/\d+)\s*/);
    if (fracMatch && amount !== null) {
      const frac = parseAmount(fracMatch[1]);
      if (frac !== null) {
        amount += frac;
        remaining = remaining.slice(fracMatch[0].length);
      }
    }
  }

  // Try to extract unit
  const unitRe = new RegExp(`^(${[...UNITS].join('|')})s?\\b\\.?\\s*`, 'i');
  const unitMatch = remaining.match(unitRe);
  if (unitMatch) {
    // Normalize to canonical form here too — the parser's output feeds the import preview and
    // may reach the DB before hitting the recipe schema, so canonicalize at the source.
    unit = normalizeUnit(unitMatch[1]);
    remaining = remaining.slice(unitMatch[0].length);
  }

  // Remaining text is the name
  const name = remaining
    .replace(/\(optional\)/i, '')
    .replace(/,\s*$/, '')
    .trim() || original;

  return {
    name,
    originalName: original,
    amount,
    unit,
    isOptional,
    orderIndex: index,
  };
}

function parseTimeFromText(text: string): number | null {
  const match = text.match(/(\d+)\s*(?:hour|hr)s?(?:\s*(?:and\s*)?(\d+)\s*(?:min(?:ute)?s?))?/i)
    ?? text.match(/(\d+)\s*(?:min(?:ute)?s?)/i);
  if (!match) return null;
  if (match[0].match(/hour|hr/i)) {
    return parseInt(match[1], 10) * 60 + parseInt(match[2] ?? '0', 10);
  }
  return parseInt(match[1], 10);
}

// Heuristic: split text into title / ingredients / steps sections
export function parseTextRecipe(text: string): ParsedRecipe {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return {
      title: 'Imported Recipe',
      servings: 4,
      totalTime: null,
      activeTime: null,
      source: null,
      authorNotes: null,
      ingredients: [],
      steps: [],
    };
  }

  // First non-empty line is likely the title
  const title = lines[0];

  // Detect section headers
  const ingredientHeaderRe = /^ingredients?:?\s*$/i;
  const instructionHeaderRe = /^(instructions?|directions?|method|steps?|preparation):?\s*$/i;
  const servingsRe = /serv(?:es|ings?):?\s*(\d+)/i;
  const timeRe = /(?:total\s+)?(?:prep\s+)?time:?\s*([\d\s\w]+)/i;

  let ingredientStart = -1;
  let instructionStart = -1;
  let servings = 4;
  let totalTime: number | null = null;

  for (let i = 1; i < lines.length; i++) {
    if (ingredientHeaderRe.test(lines[i])) { ingredientStart = i + 1; continue; }
    if (instructionHeaderRe.test(lines[i])) { instructionStart = i + 1; continue; }
    const sm = lines[i].match(servingsRe);
    if (sm) servings = parseInt(sm[1], 10);
    const tm = lines[i].match(timeRe);
    if (tm) totalTime = parseTimeFromText(tm[1]) ?? totalTime;
  }

  // Classify lines as ingredients or steps heuristically if no headers found
  const ingredientLines: string[] = [];
  const stepLines: string[] = [];

  if (ingredientStart >= 0 && instructionStart > ingredientStart) {
    // Clear sections
    const ingEnd = instructionStart - 1;
    for (let i = ingredientStart; i < ingEnd; i++) ingredientLines.push(lines[i]);
    for (let i = instructionStart; i < lines.length; i++) stepLines.push(lines[i]);
  } else {
    // Heuristic: short lines with amounts → ingredients; long lines → steps
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (/^\d/.test(line) && line.length > 80) {
        stepLines.push(line);
      } else if (line.length < 80 && /\d/.test(line)) {
        ingredientLines.push(line);
      } else if (stepLines.length > 0 || line.length > 80) {
        stepLines.push(line);
      } else {
        ingredientLines.push(line);
      }
    }
  }

  return {
    title,
    servings,
    totalTime,
    activeTime: null,
    source: null,
    authorNotes: null,
    ingredients: ingredientLines.map((l, i) => parseIngredientLine(l, i)),
    steps: stepLines.map((l, i) => ({
      orderIndex: i,
      instruction: l.replace(/^\d+\.\s*/, '').trim(),
      timeMinutes: null,
      isActiveTime: true,
    })).filter((s) => s.instruction.length > 0),
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, '\n')
    .trim();
}

// ---------------------------------------------------------------------------
// DOCX import
// ---------------------------------------------------------------------------

export async function importFromDocx(buffer: Buffer): Promise<ParsedRecipe> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  return parseTextRecipe(value);
}

// ---------------------------------------------------------------------------
// PDF import
// ---------------------------------------------------------------------------

export async function importFromPdf(buffer: Buffer): Promise<ParsedRecipe> {
  // pdf-parse v2 replaced the v1 default-function export with a PDFParse class.
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const { text } = await parser.getText();
    return parseTextRecipe(text);
  } finally {
    await parser.destroy();
  }
}
