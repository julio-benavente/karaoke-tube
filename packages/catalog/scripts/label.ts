// Adds the labels (genre, decade, language, mood/occasion) to the catalog, from packages/catalog/data/*.json.
// Works on the existing catalog.json, so it needs no raw YouTube data:
//
//   pnpm --filter @karaoke-tube/catalog label
//
// Prints coverage per label type and the most popular unlabeled artists (what to write data for next).

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createLabeler, labelCatalog } from "../src/labels.ts";
import { loadLabelData } from "../src/load-data.ts";
import { isCatalog, type AnyCatalog } from "../src/types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FILE = join(ROOT, "apps/web/public/catalog/catalog.json");

const input = JSON.parse(readFileSync(FILE, "utf8")) as AnyCatalog;
if (!isCatalog(input)) throw new Error(`unsupported catalog version ${String((input as { v: unknown }).v)}`);
const before = statSync(FILE).size;
const catalog = labelCatalog(input, createLabeler(loadLabelData()));
const json = JSON.stringify(catalog);
writeFileSync(FILE, json);

const n = catalog.songs.t.length;
const pct = (k: number, of = n) => `${((100 * k) / of).toFixed(1)}%`;
const top = Math.min(3000, n);
const count = (f: (i: number) => boolean, to = n) => Array.from({ length: to }, (_, i) => i).filter(f).length;
const rows: Array<[string, (i: number) => boolean]> = [
  ["genre", (i) => catalog.songs.g[i]!.length > 0],
  ["decade", (i) => catalog.songs.y[i]! > 0],
  ["language", (i) => catalog.songs.l[i]! !== ""],
  ["tags", (i) => catalog.songs.m[i]!.length > 0],
];
console.log(`${n} songs, ${(before / 1024).toFixed(0)} KB -> ${(json.length / 1024).toFixed(0)} KB (gzip ${(gzipSync(json).length / 1024).toFixed(0)}, brotli ${(brotliCompressSync(json).length / 1024).toFixed(0)})`);
for (const [name, f] of rows) console.log(`${name.padEnd(9)} all ${pct(count(f))}   top ${top} ${pct(count(f, top), top)}`);

const unlabeled = new Map<string, number>();
catalog.songs.a.forEach((a, i) => {
  if (a >= 0 && catalog.songs.g[i]!.length === 0) unlabeled.set(catalog.artists[a]!, (unlabeled.get(catalog.artists[a]!) ?? 0) + catalog.songs.p[i]!);
});
console.log("\nTop unlabeled artists (by popularity):");
console.log([...unlabeled].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP ?? 80)).map(([a]) => a).join(" | "));
