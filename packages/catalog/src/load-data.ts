// Node only: reads the hand-written label data in packages/catalog/data/*.json.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LabelData } from "./labels.ts";

export const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "../data");

export function loadLabelData(dir = DATA_DIR): LabelData {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  return { artists: [...read("artists.json"), ...read("artists-2.json")], rules: read("rules.json"), years: read("years.json"), tags: read("tags.json") };
}
