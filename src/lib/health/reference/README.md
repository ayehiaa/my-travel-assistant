# Reference nutrition data (Health P3.1)

`usdaSr28Foods.json` is a compact subset (423 common foods) of a published food-composition dataset. The
food-estimate pipeline takes item **numbers** from here (scaled to the portion) when the model's `reference_key` or a
confident name match points at a row; the model's own numbers are only the fallback ("AI estimate").

## Source

- **Dataset:** USDA National Nutrient Database for Standard Reference, **Release 28** (SR28, September 2015;
  the values are the same as the later "SR Legacy" release). Dataset id in the app: `usda-sr28`; row id =
  `usda-sr28:<NDB number>`.
- **Files used:** `ABBREV.txt` (abbreviated nutrient file) and `FOOD_DES.txt` (food descriptions), the official SR28
  ASCII flat files, obtained unmodified from the npm package `fda-nutrient-database@1.0.2` (2016), which redistributes
  them. SHA-256 of the files used are recorded in the JSON (`sourceFiles`).
- **Licence:** public domain (work of the US Government). Suggested citation: *U.S. Department of Agriculture,
  Agricultural Research Service, Nutrient Data Laboratory. USDA National Nutrient Database for Standard Reference,
  Release 28. Version Current: September 2015.*

### Why not CoFID?

The owner's first choice was the UK **CoFID** (McCance and Widdowson's Composition of Foods Integrated Dataset,
Open Government Licence). From the build environment, gov.uk (`www.gov.uk`, `assets.publishing.service.gov.uk`)
and USDA FoodData Central (`fdc.nal.usda.gov`) were blocked by the network policy, and no verifiable copy of the
official CoFID workbook was available from an allowed host, so the USDA SR28 files were used instead. No numbers
were typed in by hand. To switch to CoFID later: add a CoFID loader next to `build-reference-foods.mjs`, keep the
same JSON shape (`id` = `cofid:<food code>`), and update `REFERENCE_SOURCE_LABEL` in `src/lib/health/itemMeta.ts`.

## How the subset is built

```
node scripts/health/build-reference-foods.mjs <ABBREV.txt> <FOOD_DES.txt>
```

- `scripts/health/reference-foods.selection.txt` lists, per food, a regex on the dataset's own description plus a
  UK display name and aliases (e.g. "Soya milk, unsweetened" / "soya milk; soy milk"). Only names/aliases are
  hand-written.
- Copied per 100 g: energy (kcal), protein, total fat, saturated fat (FASAT), total dietary fibre.
- One derivation: `carbsG` = carbohydrate by difference − fibre (UK labels show available carbohydrate), floored at 0.
- Rows missing any of those values are rejected, never filled in.
- Each row keeps the dataset description (`sourceDesc`) so the match can be audited.

## Matching

`src/lib/health/referenceFoods.ts`: deterministic token search over names + aliases (exact normalised match = 1,
otherwise 0.65 × share of query words found + 0.35 × share of the name's words found; ties → primary name, shorter
name, id). Before the AI call, the description is split into segments and the top hits per segment / word (plus
expansions such as "flat white" → espresso + milks, and the common added fats) are given to the model as a
candidate list; the model returns a `reference_key` (or `parts` for composite drinks/dishes). Photo-only logs, or a
missing key, fall back to a strict name match (score ≥ 0.8, not ambiguous). US-specific caveats: values are US
foods (e.g. "Semi-skimmed milk" uses US 2 % milk; UK semi-skimmed is 1.7 %) — close, but not UK-identical.
