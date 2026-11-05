// "Explicit" songs, best effort. The catalog's source data (YouTube karaoke channels) carries no explicit flag, so a
// song counts as explicit when its title says so ("(Explicit)", "Uncensored") or uses strong language, or when it is
// on the short list of well-known explicit songs below. It misses songs whose title is clean but whose lyrics are not
// (most of them), so treat the flag as "probably explicit", never as a guarantee. Once the labeling data gains a real
// `explicit` tag (taxonomy.ts), the catalog's own tag wins over this guess.

/** Lowercase, no accents, no apostrophes, single spaces (same as filter.ts; not imported, to keep the files independent). */
function normalizeName(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Strong language in a title (English and Spanish). Whole words only, so "Scunthorpe" and "Cocktail" are fine. */
const STRONG_WORDS =
  /\b(fuck\w*|f\*+\w*|shit\w*|bitch\w*|motherfuck\w*|asshole\w*|dick\w*|pussy|pussies|cock|cocks|cunt|whore\w*|slut\w*|nigga\w*|nigger\w*|hoes?|thot|puta\w*|puto|pendej\w*|mierda|cabron\w*|chingar\w*|chingad\w*|verga|culo)\b/i;
/** The title announces it. */
const MARKED = /\b(explicit|uncensored|dirty version|nsfw|parental advisory)\b/i;
/** Well-known songs whose title alone is clean ("Artist|Title"). */
const KNOWN: ReadonlySet<string> = new Set(
  [
    "Cardi B|WAP",
    "Cardi B|Bodak Yellow",
    "Cardi B|I Like It",
    "Eminem|Lose Yourself",
    "Eminem|The Real Slim Shady",
    "Eminem|Without Me",
    "Eminem|Stan",
    "Eminem|Love the Way You Lie",
    "Eminem|Not Afraid",
    "Eminem|My Name Is",
    "Kendrick Lamar|HUMBLE.",
    "Kendrick Lamar|DNA.",
    "Kendrick Lamar|Swimming Pools",
    "Lil Wayne|A Milli",
    "Lil Wayne|Lollipop",
    "Lil Jon|Get Low",
    "Nelly|Hot in Herre",
    "Snoop Dogg|Gin and Juice",
    "Snoop Dogg|Drop It Like It's Hot",
    "Dr. Dre|Still D.R.E.",
    "Dr. Dre|Nuthin' but a G Thang",
    "50 Cent|In Da Club",
    "50 Cent|Candy Shop",
    "Notorious B.I.G.|Hypnotize",
    "Notorious B.I.G.|Juicy",
    "Notorious B.I.G.|Big Poppa",
    "Sir Mix-a-Lot|Baby Got Back",
    "Salt-N-Pepa|Let's Talk About Sex",
    "Megan Thee Stallion|Savage",
    "Lizzo|Truth Hurts",
    "Travis Scott|SICKO MODE",
    "Post Malone|Rockstar",
    "Cee Lo Green|Forget You",
    "Bad Bunny|Safaera",
    "Bad Bunny|Yo Perreo Sola",
    "Daddy Yankee|Gasolina",
  ].map((s) => normalizeName(s.replace("|", " "))),
);

/** True when the title (with the artist, when known) looks explicit. See the file comment for the limits. */
export function isExplicitText(title: string, artist?: string | null): boolean {
  if (MARKED.test(title) || STRONG_WORDS.test(title)) return true;
  if (artist && KNOWN.has(normalizeName(`${artist} ${title}`))) return true;
  // "Artist - Title" as shown in the app.
  const dash = title.indexOf(" - ");
  return dash > 0 && KNOWN.has(normalizeName(`${title.slice(0, dash)} ${title.slice(dash + 3)}`));
}
