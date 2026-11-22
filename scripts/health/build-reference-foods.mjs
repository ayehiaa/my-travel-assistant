#!/usr/bin/env node
/**
 * Builds src/lib/health/reference/usdaSr28Foods.json from the official USDA National Nutrient Database for
 * Standard Reference, Release 28 (SR28) flat files. Public domain (US Government work). See
 * src/lib/health/reference/README.md for provenance.
 *
 *   node scripts/health/build-reference-foods.mjs <path/to/ABBREV.txt> <path/to/FOOD_DES.txt>
 *
 * Only display names / aliases are hand-written (reference-foods.selection.txt). Every number is copied from
 * ABBREV.txt; the only derivation is "available carbohydrate" = carbohydrate by difference − total dietary fibre
 * (UK labelling convention), floored at 0. Rows missing energy, protein, fat, carbohydrate, fibre or saturated
 * fat are rejected rather than filled in.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const [abbrevPath, desPath] = process.argv.slice(2)
if (!abbrevPath || !desPath) {
  process.stderr.write('usage: build-reference-foods.mjs ABBREV.txt FOOD_DES.txt\n')
  process.exit(1)
}
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')

const abbrevRaw = readFileSync(abbrevPath)
const desRaw = readFileSync(desPath)
const sha = buf => createHash('sha256').update(buf).digest('hex')

const parse = buf => buf.toString('latin1').split(/\r?\n/).filter(Boolean).map(l => l.split('^').map(f => f.replace(/^~|~$/g, '')))

// SR28 ABBREV.txt column positions (sr28_doc.pdf, "Abbreviated file").
const COL = { ndb: 0, kcal: 3, protein: 4, fat: 5, carbs: 7, fibre: 8, satFat: 44 }
const abbrev = new Map(parse(abbrevRaw).map(f => [f[COL.ndb], f]))
const des = parse(desRaw).map(f => ({ ndb: f[0], group: f[1], desc: f[2] }))

const selection = readFileSync(join(here, 'reference-foods.selection.txt'), 'utf8')
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  .map(l => {
    const [pattern, name, aliases = ''] = l.split('|').map(s => s.trim())
    return { pattern, name, aliases: aliases.split(';').map(s => s.trim()).filter(Boolean) }
  })

const num = v => (v === undefined || v === '' ? null : Number(v))
const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d

const rows = []
const problems = []
const seen = new Set()
for (const s of selection) {
  const re = new RegExp(s.pattern, 'i')
  const hit = des.find(d => re.test(d.desc))
  if (!hit) { problems.push(`no match: ${s.pattern}`); continue }
  if (seen.has(hit.ndb)) { problems.push(`duplicate NDB ${hit.ndb}: ${s.pattern}`); continue }
  const a = abbrev.get(hit.ndb)
  const v = { kcal: num(a[COL.kcal]), protein: num(a[COL.protein]), fat: num(a[COL.fat]), carbs: num(a[COL.carbs]), fibre: num(a[COL.fibre]), satFat: num(a[COL.satFat]) }
  const missing = Object.entries(v).filter(([, x]) => x === null || !Number.isFinite(x)).map(([k]) => k)
  if (missing.length) { problems.push(`missing ${missing.join(',')}: ${hit.ndb} ${hit.desc}`); continue }
  seen.add(hit.ndb)
  rows.push({
    id: `usda-sr28:${hit.ndb}`,
    name: s.name,
    aliases: s.aliases,
    sourceDesc: hit.desc,
    per100: {
      kcal: Math.round(v.kcal),
      proteinG: r(v.protein),
      carbsG: r(Math.max(0, v.carbs - v.fibre)),
      fatG: r(v.fat),
      satFatG: r(v.satFat, 2),
      fibreG: r(v.fibre),
    },
  })
}

const out = {
  dataset: 'USDA National Nutrient Database for Standard Reference, Release 28 (SR28, 2015; same values as SR Legacy)',
  datasetId: 'usda-sr28',
  licence: 'Public domain (US Government work, USDA Agricultural Research Service). Attribution requested: U.S. Department of Agriculture, Agricultural Research Service, Nutrient Data Laboratory. USDA National Nutrient Database for Standard Reference, Release 28.',
  sourceFiles: { 'ABBREV.txt': sha(abbrevRaw), 'FOOD_DES.txt': sha(desRaw) },
  derivations: 'carbsG = CHOCDF (by difference) - FIBTG, floored at 0; satFatG = FASAT; all other values copied',
  rows,
}
writeFileSync(join(root, 'src/lib/health/reference/usdaSr28Foods.json'), JSON.stringify(out, null, 0) + '\n')
process.stdout.write(`rows: ${rows.length}\n`)
if (problems.length) process.stdout.write(problems.join('\n') + '\n')
for (const row of rows) process.stdout.write(`${row.id}\t${row.name}\t<= ${row.sourceDesc}\n`)
