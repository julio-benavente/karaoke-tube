/**
 * The label taxonomy: every id a song can carry in the catalog. Ids are stable lowercase slugs: never rename or
 * reuse one, only add (the UI and saved filters refer to them). Display names are English + Spanish.
 *
 * Four kinds of label:
 *  - genre   a song carries 1-3 genre ids (most specific first). A sub-genre implies its parent (`parent`).
 *  - decade  when the song came out: 40s (and earlier), 50s ... 20s. One per song.
 *  - language the language it is sung in (ISO 639-1). One per song.
 *  - tag     mood / occasion / feature tags, several per song.
 * See docs/song-labels.md for how each label is assigned.
 */

export type Named = { id: string; en: string; es: string };
export type Genre = Named & { parent?: string };
export type TagKind = "mood" | "occasion" | "feature";
export type Tag = Named & { kind: TagKind };

const g = (id: string, en: string, es: string, parent?: string): Genre => ({ id, en, es, parent });

export const GENRES: Genre[] = [
  g("pop", "Pop", "Pop"),
  g("dance-pop", "Dance pop", "Pop bailable", "pop"),
  g("synth-pop", "Synth-pop", "Synth-pop", "pop"),
  g("teen-pop", "Teen pop", "Pop adolescente", "pop"),
  g("pop-rock", "Pop rock", "Pop rock", "pop"),
  g("boy-girl-band", "Boy & girl bands", "Boy y girl bands", "pop"),
  g("k-pop", "K-pop", "K-pop", "pop"),
  g("j-pop", "J-pop", "J-pop", "pop"),
  g("opm", "OPM (Filipino pop)", "OPM (pop filipino)", "pop"),
  g("rock", "Rock", "Rock"),
  g("classic-rock", "Classic rock", "Rock clásico", "rock"),
  g("hard-rock", "Hard rock", "Hard rock", "rock"),
  g("soft-rock", "Soft rock", "Soft rock", "rock"),
  g("glam-rock", "Glam rock", "Glam rock", "rock"),
  g("prog-rock", "Progressive rock", "Rock progresivo", "rock"),
  g("southern-rock", "Southern rock", "Rock sureño", "rock"),
  g("rock-n-roll", "Rock & roll", "Rock and roll", "rock"),
  g("rock-en-espanol", "Rock en español", "Rock en español", "rock"),
  g("punk", "Punk", "Punk"),
  g("pop-punk", "Pop punk", "Pop punk", "punk"),
  g("metal", "Metal", "Metal"),
  g("heavy-metal", "Heavy metal", "Heavy metal", "metal"),
  g("hair-metal", "Hair metal", "Hair metal", "metal"),
  g("nu-metal", "Nu metal", "Nu metal", "metal"),
  g("alternative", "Alternative", "Alternativo"),
  g("grunge", "Grunge", "Grunge", "alternative"),
  g("post-grunge", "Post-grunge", "Post-grunge", "alternative"),
  g("britpop", "Britpop", "Britpop", "alternative"),
  g("emo", "Emo", "Emo", "alternative"),
  g("new-wave", "New wave", "New wave"),
  g("indie", "Indie", "Indie"),
  g("indie-pop", "Indie pop", "Indie pop", "indie"),
  g("indie-folk", "Indie folk", "Indie folk", "indie"),
  g("hip-hop", "Hip-hop", "Hip-hop"),
  g("rap", "Rap", "Rap", "hip-hop"),
  g("trap", "Trap", "Trap", "hip-hop"),
  g("rnb", "R&B", "R&B"),
  g("contemporary-rnb", "Contemporary R&B", "R&B contemporáneo", "rnb"),
  g("soul", "Soul", "Soul"),
  g("motown", "Motown", "Motown", "soul"),
  g("neo-soul", "Neo-soul", "Neo-soul", "soul"),
  g("funk", "Funk", "Funk"),
  g("disco", "Disco", "Disco"),
  g("country", "Country", "Country"),
  g("classic-country", "Classic country", "Country clásico", "country"),
  g("modern-country", "Modern country", "Country moderno", "country"),
  g("country-pop", "Country pop", "Country pop", "country"),
  g("outlaw-country", "Outlaw country", "Country outlaw", "country"),
  g("bluegrass", "Bluegrass", "Bluegrass", "country"),
  g("folk", "Folk", "Folk"),
  g("singer-songwriter", "Singer-songwriter", "Cantautor", "folk"),
  g("celtic", "Irish & Celtic", "Irlandesa y celta", "folk"),
  g("blues", "Blues", "Blues"),
  g("jazz", "Jazz", "Jazz"),
  g("swing-standards", "Swing & standards", "Swing y estándares", "jazz"),
  g("vocal-jazz", "Vocal jazz", "Jazz vocal", "jazz"),
  g("reggae", "Reggae", "Reggae"),
  g("ska", "Ska", "Ska", "reggae"),
  g("dancehall", "Dancehall", "Dancehall", "reggae"),
  g("latin", "Latin", "Latino"),
  g("latin-pop", "Latin pop", "Pop latino", "latin"),
  g("balada", "Romantic ballad (balada)", "Balada romántica", "latin"),
  g("salsa", "Salsa", "Salsa", "latin"),
  g("bachata", "Bachata", "Bachata", "latin"),
  g("merengue", "Merengue", "Merengue", "latin"),
  g("cumbia", "Cumbia", "Cumbia", "latin"),
  g("reggaeton", "Reggaeton", "Reguetón", "latin"),
  g("latin-urban", "Latin urban", "Urbano latino", "latin"),
  g("ranchera", "Ranchera", "Ranchera", "latin"),
  g("mariachi", "Mariachi", "Mariachi", "latin"),
  g("regional-mexican", "Regional Mexican", "Regional mexicano", "latin"),
  g("banda", "Banda", "Banda", "latin"),
  g("bolero", "Bolero", "Bolero", "latin"),
  g("tango", "Tango", "Tango", "latin"),
  g("vallenato", "Vallenato", "Vallenato", "latin"),
  g("tropical", "Tropical", "Tropical", "latin"),
  g("trova", "Trova & nueva canción", "Trova y nueva canción", "latin"),
  g("flamenco", "Flamenco & rumba", "Flamenco y rumba", "latin"),
  g("bossa-nova", "Bossa nova & MPB", "Bossa nova y MPB", "latin"),
  g("sertanejo", "Sertanejo", "Sertanejo", "latin"),
  g("electronic", "Electronic", "Electrónica"),
  g("dance", "Dance", "Dance", "electronic"),
  g("edm", "EDM", "EDM", "electronic"),
  g("house", "House", "House", "electronic"),
  g("eurodance", "Eurodance", "Eurodance", "electronic"),
  g("musical-theatre", "Musical theatre", "Teatro musical"),
  g("disney", "Disney & animation", "Disney y animación"),
  g("soundtrack", "Movie soundtrack", "Banda sonora"),
  g("tv-theme", "TV themes", "Temas de TV"),
  g("kids", "Kids", "Infantil"),
  g("nursery-rhyme", "Nursery rhymes", "Canciones de cuna", "kids"),
  g("christmas", "Christmas", "Navidad"),
  g("carols", "Carols & villancicos", "Villancicos", "christmas"),
  g("gospel", "Gospel", "Gospel"),
  g("worship", "Worship & Christian", "Alabanza y cristiana", "gospel"),
  g("hymns", "Hymns", "Himnos", "gospel"),
  g("oldies", "Oldies (50s/60s)", "Clásicos (50s/60s)"),
  g("doo-wop", "Doo-wop", "Doo-wop", "oldies"),
  g("rockabilly", "Rockabilly", "Rockabilly", "oldies"),
  g("easy-listening", "Easy listening", "Easy listening", "oldies"),
  g("girl-groups", "Girl groups", "Girl groups", "oldies"),
  g("british-invasion", "British Invasion", "Invasión británica", "oldies"),
  g("surf", "Surf & beach", "Surf", "oldies"),
  g("crossover", "Classical crossover", "Crossover clásico"),
  g("chanson", "French chanson", "Chanson francesa"),
  g("italian", "Italian pop", "Pop italiano"),
  g("a-cappella", "A cappella", "A cappella"),
  g("novelty", "Novelty & comedy", "Humor y novedad"),
];

const n = (id: string, en: string, es: string): Named => ({ id, en, es });

/** Decades: `40s` means the 1940s and earlier. */
export const DECADES: Named[] = [
  n("40s", "1940s & earlier", "1940 y antes"),
  n("50s", "1950s", "1950s"),
  n("60s", "1960s", "1960s"),
  n("70s", "1970s", "1970s"),
  n("80s", "1980s", "1980s"),
  n("90s", "1990s", "1990s"),
  n("00s", "2000s", "2000s"),
  n("10s", "2010s", "2010s"),
  n("20s", "2020s", "2020s"),
];

/** First year of each decade id (`y` in the catalog stores this divided by 10: 1990 -> 199). */
export const DECADE_START: Record<string, number> = {
  "40s": 1940, "50s": 1950, "60s": 1960, "70s": 1970, "80s": 1980, "90s": 1990, "00s": 2000, "10s": 2010, "20s": 2020,
};

export function decadeOfYear(year: number): string {
  if (year < 1950) return "40s";
  return DECADES[Math.min(DECADES.length - 1, Math.floor((year - 1940) / 10))]!.id;
}

export const LANGUAGES: Named[] = [
  n("en", "English", "Inglés"),
  n("es", "Spanish", "Español"),
  n("pt", "Portuguese", "Portugués"),
  n("fr", "French", "Francés"),
  n("it", "Italian", "Italiano"),
  n("de", "German", "Alemán"),
  n("ko", "Korean", "Coreano"),
  n("ja", "Japanese", "Japonés"),
  n("tl", "Filipino / Tagalog", "Filipino / tagalo"),
  n("id", "Indonesian", "Indonesio"),
  n("ga", "Irish", "Irlandés"),
  n("la", "Latin", "Latín"),
  n("zh", "Chinese", "Chino"),
  n("sv", "Swedish", "Sueco"),
  n("ar", "Arabic", "Árabe"),
];

const t = (kind: TagKind, id: string, en: string, es: string): Tag => ({ id, en, es, kind });

export const TAGS: Tag[] = [
  t("mood", "party", "Party", "Fiesta"),
  t("mood", "upbeat", "Upbeat", "Animada"),
  t("mood", "feel-good", "Feel-good", "Buen rollo"),
  t("mood", "ballad", "Ballad", "Balada"),
  t("mood", "power-ballad", "Power ballad", "Balada potente"),
  t("mood", "slow-dance", "Slow dance", "Para bailar lento"),
  t("mood", "romantic", "Romantic", "Romántica"),
  t("mood", "sad", "Sad", "Triste"),
  t("mood", "empowering", "Empowering", "Empoderadora"),
  t("mood", "nostalgic", "Nostalgic", "Nostálgica"),
  t("mood", "chill", "Chill", "Tranquila"),
  t("mood", "singalong", "Group singalong", "Para cantar en grupo"),
  t("mood", "duet-friendly", "Duet-friendly", "Para cantar a dúo"),
  t("occasion", "wedding", "Wedding", "Boda"),
  t("occasion", "birthday", "Birthday", "Cumpleaños"),
  t("occasion", "christmas", "Christmas", "Navidad"),
  t("occasion", "love", "Love", "Amor"),
  t("occasion", "breakup", "Breakup", "Desamor"),
  t("occasion", "summer", "Summer", "Verano"),
  t("occasion", "movie", "Movie soundtrack", "Película"),
  t("occasion", "tv", "TV theme", "Serie de TV"),
  t("occasion", "kids-family", "Kids & family", "Niños y familia"),
  t("occasion", "patriotic", "Patriotic", "Patriótica"),
  t("occasion", "graduation", "Graduation & farewell", "Graduación y despedida"),
  t("occasion", "halloween", "Halloween", "Halloween"),
  t("occasion", "drinking", "Drinking songs", "Para brindar"),
  t("occasion", "road-trip", "Road trip", "Viaje en carretera"),
  t("occasion", "funeral", "Remembrance", "Homenaje"),
  t("feature", "easy", "Easy to sing", "Fácil de cantar"),
  t("feature", "medium", "Medium difficulty", "Dificultad media"),
  t("feature", "hard", "Demanding vocals", "Voz exigente"),
  t("feature", "rap-heavy", "Rap-heavy", "Mucho rap"),
  t("feature", "duet", "Duet", "Dúo"),
  t("feature", "fast-lyrics", "Fast lyrics", "Letra rápida"),
];

const ids = (list: Named[]) => new Set(list.map((x) => x.id));
export const GENRE_IDS = ids(GENRES);
export const TAG_IDS = ids(TAGS);
export const DECADE_IDS = ids(DECADES);
export const LANGUAGE_IDS = ids(LANGUAGES);

const parentOf = new Map(GENRES.map((x) => [x.id, x.parent]));

/** A genre id plus all its ancestors, most specific first. */
export function genreChain(id: string): string[] {
  const out: string[] = [];
  for (let cur: string | undefined = id; cur && !out.includes(cur); cur = parentOf.get(cur)) out.push(cur);
  return out;
}
