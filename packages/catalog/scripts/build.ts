// Builds the song catalog from the raw YouTube data and writes apps/web/public/catalog/catalog.json.
//
//   pnpm --filter @karaoke-tube/catalog build-catalog
//
// Needs data/catalog/raw/ (see scripts/collect.mjs). Labels come from packages/catalog/data/*.json (see label.ts to
// add them to an existing catalog.json without the raw data). Prints a report to eyeball the parsing.

import { readFileSync, readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { createLabeler } from "../src/labels.ts";
import { loadLabelData } from "../src/load-data.ts";
import { buildCatalog, parseDuration, type ChannelConfig, type RawVideo } from "../src/build.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RAW = join(ROOT, "data/catalog/raw");
const OUT = join(ROOT, "apps/web/public/catalog/catalog.json");

const channels: ChannelConfig[] = JSON.parse(readFileSync(join(ROOT, "data/catalog/channels.json"), "utf8"));

function* rawVideos(): Generator<RawVideo> {
  for (const file of readdirSync(RAW).filter((f) => f.endsWith(".videos.jsonl")).sort()) {
    for (const line of readFileSync(join(RAW, file), "utf8").split("\n")) {
      if (!line) continue;
      const v = JSON.parse(line);
      if (v.missing || !v.snippet) continue;
      yield {
        id: v.id,
        channelKey: v.channelKey,
        title: v.snippet.title,
        durationSec: parseDuration(v.contentDetails?.duration),
        views: Number(v.statistics?.viewCount ?? 0),
        live: (v.snippet.liveBroadcastContent ?? "none") !== "none",
        isPublic: (v.status?.privacyStatus ?? "public") === "public",
        embeddable: v.status?.embeddable !== false,
      };
    }
  }
}

const { catalog, report } = buildCatalog(rawVideos(), channels, new Date(), createLabeler(loadLabelData()));

mkdirSync(dirname(OUT), { recursive: true });
const json = JSON.stringify(catalog);
writeFileSync(OUT, json);

const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
for (const [name, lines] of Object.entries(report.samples)) {
  console.log(`\n--- ${name}`);
  for (const l of lines) console.log("  " + l);
}
console.log(
  `\nwrote ${OUT}\n  ${kb(statSync(OUT).size)} raw, ${kb(gzipSync(json).length)} gzip, ${kb(brotliCompressSync(json).length)} brotli\n  ${catalog.songs.t.length} songs, ${catalog.artists.length} artists`,
);
