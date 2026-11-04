import { en } from "../../packages/ui/src/i18n/en";
import { es } from "../../packages/ui/src/i18n/es";

// English sentences of the app that have a different Spanish version: if one shows up on a Spanish screen, a
// translation is missing (or a string isn't going through the translator).
const SKIP = new Set(Object.values(es));
export const ENGLISH_ONLY: string[] = Object.entries(en)
  .filter(([key, value]) => typeof value === "string" && value.length >= 9 && !value.includes("{") && (es as Record<string, string>)[key] !== undefined && !SKIP.has(value))
  .map(([, value]) => value as string);

export function englishLeftovers(text: string): string[] {
  return ENGLISH_ONLY.filter((s) => text.includes(s));
}
