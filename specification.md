# Kitchen Canon - Application Specification

## Overview
A recipe management application for collecting, consolidating, using, updating, and sharing recipes. Designed for personal use with potential for future public availability.

#### Possible Permanent Names
- En Place
- Mise
- Prepped
- Station

---

## 1. Recipe Management

### Adding Recipes
- Support multiple input sources: food blog webpages, email text, PDF/docx files, photos of index cards, etc.
- Automated extraction/parsing where possible
- Preserve original source (link/name) if applicable
- Automatically save to personal recipe collection

### Editing & Notes
- Author notes: separate from ingredients/steps (e.g., "use two 9x9 pans when doubling")
- Personal notes: temporary thoughts/variations to try without editing the recipe itself
- Both types editable during cooking/planning

### Versioning
- Every recipe edit creates a new version
- Users can view and restore old versions
- Meal history preserves the version used at that time

### Organization
- Archive recipes to hide from search (still visible in meal history, can be unarchived)

---

## 2. Recipe Data Model

### Ingredients
- **Standardization**: Ingredient names adapt to user localization (e.g., British "coriander" → US "cilantro")
- **Substitutions**:
  - Convert ingredients to common substitutes (e.g., fresh thyme → dried thyme)
  - Available when viewing, editing, planning, or cooking
  - User-selectable when multiple substitutes exist
  - User-contributed substitution data (e.g., egg substitutes for vegan options)
- **Optional ingredients**: Mark ingredients as optional (e.g., mushrooms in stir fry)

### Steps
- **Step-level timing**: Specify time required for each step
- **Active vs. inactive time**: Distinguish active work (chopping, stirring) from passive time (baking, simmering)
- **Percent-based ingredient references**: Steps can reference ingredients by percentage (e.g., "add half the oil"), automatically calculated based on scaled serving size

### Media
- **Images**: Support for finished product photo and per-step images
- **Video**: Record new or include existing videos (especially from food blogs)
- **Visibility control**: Toggle media on/off to avoid screen clutter when not needed

### Metadata
- **Servings**: Display and scale to arbitrary serving sizes (affects ingredient amounts)
- **Time**: Total time (start to finish) and active time
- **Courses**: Multiple courses per recipe, from a fixed taxonomy (appetizer, soup, salad, bread, main, side, dessert, breakfast, snack, drink, topping/condiment). *Design change during development: the original free-form "categories" concept was split into this fixed course enum plus free-form manual labels — courses drive structured filtering and future meal-composition features, while labels absorb everything ad hoc.*
- **Labels**:
  - Dietary restrictions (e.g., gluten-free, vegan) — auto-generated from the ingredient catalog, manually editable
  - Allergens — auto-generated from the ingredient catalog
  - Free-form manual labels for anything else
  - Easy-substitution suggestions (e.g., "can be made gluten-free with 1:1 flour swap")
  - Make-ahead capability and refrigeration/freezing requirements (future: new label type)
  - Equipment (e.g., slow cooker) (future: new label type)
  - All labeling/categorization is optional

---

## 3. Search & Discovery

### Search
- Search by text in recipe title

### Filtering
- Filter for recipes containing specific ingredients (one or more)
- Filter out recipes containing specific ingredients
- Filter by labels/categories

---

## 4. Meal Planning

### Recipe Selection
- Specify dietary restrictions/preferences to filter available recipes
- Multi-select recipes (shopping cart-style interface)
- **Future enhancement**: Suggest complementary recipes based on selections (e.g., if salad is selected as entrée, prioritize non-salad sides)

### Grocery List
- Consolidated list from all selected recipes
- Editable (remove items already on hand)
- Easy to copy/paste into other apps

### Meal History
- View history of planned meals
- Remake previous meals (regenerate grocery list, enter cook mode with same recipes)

### Cooking Timeline (Long-term Goal)
- Automatically generate cooking schedule: start times, order of operations
- Support concurrent cooking (e.g., start recipe B after putting recipe A in oven)
- Identify make-ahead components (e.g., dessert made the night before)
- Note: Design/architect with this in mind from the start

---

## 5. Cook Mode

### Interface
- Screen wake lock (prevent phone from going dark)
- Easy switching between recipes in planned meal
- Hide unnecessary UI elements
- Step navigation via tap or swipe

### Multi-Recipe Support
- Cook mode for individual recipes or full planned meals

---

## 6. Sharing & Export

### Sharing
- Multiple formats: raw text via email, PDF via email, shareable link

### Export
- Export all recipes in standardized format (e.g., schema.org Recipe)
- If standardized format loses custom data, also support proprietary format export

### Publishing (Stretch Goal)
- Publish recipes for other users to view, discover, and save

---

## 7. Technical Requirements

### Platform Support
- **Primary**: Mobile phone (adding, viewing, cooking, sharing)
- **Secondary**: Web/desktop (adding, sharing, editing)

### Offline Capability
- Full functionality without internet except discovering other users' recipes
- Critical for kitchen use with poor signal

### Data Storage
- **Initial**: Raspberry Pi SD card (SQLite database + media files in a Docker volume)
- **Requirement**: Abstract data API for easy migration to cloud providers (AWS, GCP, etc.) in future
  - Database access goes through Prisma, so a Postgres move is low-friction
  - Media storage is currently direct-filesystem; a storage-provider abstraction is still needed before a cloud move

### Hosting
- Self-hosted on Raspberry Pi via Docker Compose (single container: API + frontend + media)
- Deployed with `scripts/deploy-to-pi.sh`; designed to run continuously
- Must operate within Pi hardware constraints

### Accounts & Security
*(Added during development — originally a stretch goal, implemented early.)*
- Multi-user with self-service signup (optionally gated by an invite code); cookie-based sessions, CSRF protection
- Per-IP rate limiting on auth + import endpoints (brute-force / abuse protection)
- SSRF protection on import-from-URL: user-supplied URLs are validated and resolved against an allowlist of public addresses before fetching (blocks internal/cloud-metadata probing)
- Per-user data isolation: recipes and meal plans are private to their owner
- Shared global data (ingredient catalog, official substitutions, seeded labels) with per-user private additions layered on top
- Defense-in-depth: a strict Content-Security-Policy in production (no inline scripts) and a non-root (`node` user) Docker container

---

## 8. Scope & Future Enhancements

### Initial Version (v1)
- ~~Single-user application~~ → shipped with multi-user accounts and per-user data isolation (pulled forward from stretch goals)
- Offline-capable (partially met — see Implementation Status below)
- Self-hosted on Raspberry Pi, served over HTTPS (host nginx + Let's Encrypt in front of the
  container; secure cookies)
- All core features listed above except those marked as "future" or "long-term"

### Stretch Goals
- ~~User accounts~~ — done (sessions, signup, isolation); permissions/privacy controls beyond per-user privacy remain future
- Recipe sharing between users / publishing (requires public or share-token routes — today every route, including media, is behind login)
- Copyright and moderation considerations
- Complementary recipe suggestions
- Automated cooking timeline generation

### Implementation Status (as of June 2026)

**Implemented**: recipe CRUD with full versioning (view/restore, meal history pins the version cooked); archiving; author + personal notes; import from URL (schema.org JSON-LD + text fallback), .docx, .pdf, .txt; ingredient catalog with aliases, typeahead, and user classification of unknown ingredients (built-in entries are read-only in the UI with an explicit customize/reset-to-default override flow); auto dietary/allergen labels; substitutions (official + user-contributed, applied per meal-plan recipe with ratio conversion); optional ingredients; per-ingredient notes (e.g. "use Cooper brand", "chopped into 1-inch cubes") shown in the recipe detail list and cook-mode checklist and preserved across version edits/restores, excluded from grocery consolidation; canonical ingredient units (free-text unit entry normalized to consistent abbreviations at write time — create/update/import — so displays are uniform and grocery consolidation merges spelling variants like `tbsp`/`tablespoon`); serving scaling with percent-based ingredient references in steps; per-recipe and per-step media; search + include/exclude-ingredient + label/course/diet filtering; meal planning with consolidated editable grocery list (copy to clipboard) and remake; cook mode (step navigation via buttons or swipe, screen wake lock — requires a secure context, satisfied by the HTTPS deployment; on plain HTTP a one-line notice explains the screen may sleep — per-step timers with audio alert, ingredient checklist, multi-recipe plans); per-recipe export to .txt/.json and print layout; PWA install with cached read-only offline viewing; multi-user accounts; media visibility toggle (device-local preference hiding recipe/step media on the detail page and in cook mode).

**Specified but not yet implemented** (all fit the current architecture; notes on how):
- **Offline writes / background sync** — the largest gap vs. section 7. Needs an IndexedDB layer and queued mutations on the frontend; no backend changes required, though replayed mutations must fetch a fresh CSRF token. The current React Query + service-worker setup is compatible with this.
- **Sharing — shareable links** — text/email/PDF sharing has shipped (Web Share API, `mailto:` email, and print-to-PDF, all fed by a shared text formatter); only shareable links remain. Links require new public share-token routes since all routes are login-gated, fitting as an additive route + a `shareToken` column.
- **schema.org bulk export** — additive backend endpoint; the data model holds everything needed.
- **Photo/OCR import** — feed OCR text into the existing text parser; client-side OCR preferred given Pi hardware.
- **Equipment and make-ahead labels** — new `Label.type` values; the label system already supports types.
- **Component recipes** — see section below; additive schema changes.
- **Cooking timeline** — steps already carry `timeMinutes` + active/passive flags, which is the data the scheduler needs; this remains a pure algorithm + UI layer on top.

### Component Recipes
A component recipe is a reusable sub-recipe consumed by other recipes (e.g. pie crust, stock, dough, whipped cream). This is distinct from a standalone recipe with a course of "Topping / Condiment" — a component has no course and is not served on its own.

Planned behaviour:
- Recipes can be flagged as components (e.g. `isComponent` boolean on the Recipe model)
- Ingredients in a recipe can reference another recipe by ID instead of a raw ingredient name — e.g. "1 batch [Pie Crust]" links to the Pie Crust recipe
- When scaling a parent recipe, referenced component recipes scale proportionally
- The recipe detail page shows a "Used in" section listing recipes that reference this component
- Component recipes appear in their own section of the recipe list, separate from regular recipes
- Importing/exporting a recipe should include or reference its component recipes

### Ingredient Catalog

A global `IngredientCatalog` table stores canonical ingredient names alongside their allergen and diet-compatibility metadata. This powers:
- Auto-calculated dietary/allergen info on meal plans (computed from effective ingredients after substitutions; optional ingredients excluded from allergen detection)
- Typeahead suggestions in recipe forms and the substitutions page (replacing the previous static frontend list)

When a meal plan is created or edited, any ingredient not found in the catalog is reported as `unknownIngredients` on the meal plan's `dietaryInfo`. The meal plan detail page prompts the user to classify these ingredients before diet calculations are shown.

**User-scoped ingredient catalog (implemented)**
With multi-user support, `IngredientCatalog` (and `IngredientAlias`) carry a nullable `userId`: null = official/seeded entries visible to everyone, non-null = that user's private additions. Lookups prefer the current user's entry over the global one (so one user's classification of "sausage" as vegan soy doesn't affect anyone else), and user-added entries are not visible to other users.

In the UI, built-in (global) catalog entries are read-only: the Ingredients page shows them with a `built-in` badge and no edit/delete controls. A **Customize** action creates a user-private copy pre-filled with the global's tags (via the same `POST /api/ingredients` shadow-entry semantics); the list then shows only the user's version, marked `customized`, with a **Reset to default** action that deletes the private copy and restores the built-in entry. Official substitutions are likewise read-only in the UI (no delete button).

### Design Principles
- Architecture should anticipate multi-user extension
- Keep stretch goals in mind during design/implementation
- Defer complex problems (privacy, accounts, copyright) to later phases
- Focus on single-user experience first
