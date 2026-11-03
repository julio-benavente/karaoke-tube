# Song labels

Every song in the catalog can carry four kinds of labels, so the app can browse and filter by what people feel like singing.
The vocabulary lives in [`packages/catalog/src/taxonomy.ts`](../packages/catalog/src/taxonomy.ts) (this page is generated from it).
Ids are stable lowercase slugs: **never rename or reuse one**, only add. Each has an English and a Spanish display name.

| Label | Cardinality | Column in `catalog.json` v2 | Meaning |
|---|---|---|---|
| Genre | 0-3 per song, most specific first | `songs.g` (indexes into `genres`) | A sub-genre implies its parent: filtering by `rock` also finds `hard-rock`. |
| Decade | 0-1 | `songs.y` (decade start / 10, `199` = 1990s, `0` = unknown) | When the song came out. `40s` means 1940s and earlier. |
| Language | 0-1 | `songs.l` (ISO 639-1, `""` = unknown) | The language it is sung in. |
| Tags | 0-6 | `songs.m` (indexes into `tags`) | Mood, occasion and singing-difficulty tags. |

Unlabeled stays unlabeled (`[]`, `0`, `""`): a wrong label is worse than none.

## Genres (108)

| id | English | Español |
|---|---|---|
| `pop` | Pop | Pop |
| &nbsp;&nbsp;↳ `dance-pop` | Dance pop | Pop bailable |
| &nbsp;&nbsp;↳ `synth-pop` | Synth-pop | Synth-pop |
| &nbsp;&nbsp;↳ `teen-pop` | Teen pop | Pop adolescente |
| &nbsp;&nbsp;↳ `pop-rock` | Pop rock | Pop rock |
| &nbsp;&nbsp;↳ `boy-girl-band` | Boy & girl bands | Boy y girl bands |
| &nbsp;&nbsp;↳ `k-pop` | K-pop | K-pop |
| &nbsp;&nbsp;↳ `j-pop` | J-pop | J-pop |
| &nbsp;&nbsp;↳ `opm` | OPM (Filipino pop) | OPM (pop filipino) |
| `rock` | Rock | Rock |
| &nbsp;&nbsp;↳ `classic-rock` | Classic rock | Rock clásico |
| &nbsp;&nbsp;↳ `hard-rock` | Hard rock | Hard rock |
| &nbsp;&nbsp;↳ `soft-rock` | Soft rock | Soft rock |
| &nbsp;&nbsp;↳ `glam-rock` | Glam rock | Glam rock |
| &nbsp;&nbsp;↳ `prog-rock` | Progressive rock | Rock progresivo |
| &nbsp;&nbsp;↳ `southern-rock` | Southern rock | Rock sureño |
| &nbsp;&nbsp;↳ `rock-n-roll` | Rock & roll | Rock and roll |
| &nbsp;&nbsp;↳ `rock-en-espanol` | Rock en español | Rock en español |
| `punk` | Punk | Punk |
| &nbsp;&nbsp;↳ `pop-punk` | Pop punk | Pop punk |
| `metal` | Metal | Metal |
| &nbsp;&nbsp;↳ `heavy-metal` | Heavy metal | Heavy metal |
| &nbsp;&nbsp;↳ `hair-metal` | Hair metal | Hair metal |
| &nbsp;&nbsp;↳ `nu-metal` | Nu metal | Nu metal |
| `alternative` | Alternative | Alternativo |
| &nbsp;&nbsp;↳ `grunge` | Grunge | Grunge |
| &nbsp;&nbsp;↳ `post-grunge` | Post-grunge | Post-grunge |
| &nbsp;&nbsp;↳ `britpop` | Britpop | Britpop |
| &nbsp;&nbsp;↳ `emo` | Emo | Emo |
| `new-wave` | New wave | New wave |
| `indie` | Indie | Indie |
| &nbsp;&nbsp;↳ `indie-pop` | Indie pop | Indie pop |
| &nbsp;&nbsp;↳ `indie-folk` | Indie folk | Indie folk |
| `hip-hop` | Hip-hop | Hip-hop |
| &nbsp;&nbsp;↳ `rap` | Rap | Rap |
| &nbsp;&nbsp;↳ `trap` | Trap | Trap |
| `rnb` | R&B | R&B |
| &nbsp;&nbsp;↳ `contemporary-rnb` | Contemporary R&B | R&B contemporáneo |
| `soul` | Soul | Soul |
| &nbsp;&nbsp;↳ `motown` | Motown | Motown |
| &nbsp;&nbsp;↳ `neo-soul` | Neo-soul | Neo-soul |
| `funk` | Funk | Funk |
| `disco` | Disco | Disco |
| `country` | Country | Country |
| &nbsp;&nbsp;↳ `classic-country` | Classic country | Country clásico |
| &nbsp;&nbsp;↳ `modern-country` | Modern country | Country moderno |
| &nbsp;&nbsp;↳ `country-pop` | Country pop | Country pop |
| &nbsp;&nbsp;↳ `outlaw-country` | Outlaw country | Country outlaw |
| &nbsp;&nbsp;↳ `bluegrass` | Bluegrass | Bluegrass |
| `folk` | Folk | Folk |
| &nbsp;&nbsp;↳ `singer-songwriter` | Singer-songwriter | Cantautor |
| &nbsp;&nbsp;↳ `celtic` | Irish & Celtic | Irlandesa y celta |
| `blues` | Blues | Blues |
| `jazz` | Jazz | Jazz |
| &nbsp;&nbsp;↳ `swing-standards` | Swing & standards | Swing y estándares |
| &nbsp;&nbsp;↳ `vocal-jazz` | Vocal jazz | Jazz vocal |
| `reggae` | Reggae | Reggae |
| &nbsp;&nbsp;↳ `ska` | Ska | Ska |
| &nbsp;&nbsp;↳ `dancehall` | Dancehall | Dancehall |
| `latin` | Latin | Latino |
| &nbsp;&nbsp;↳ `latin-pop` | Latin pop | Pop latino |
| &nbsp;&nbsp;↳ `balada` | Romantic ballad (balada) | Balada romántica |
| &nbsp;&nbsp;↳ `salsa` | Salsa | Salsa |
| &nbsp;&nbsp;↳ `bachata` | Bachata | Bachata |
| &nbsp;&nbsp;↳ `merengue` | Merengue | Merengue |
| &nbsp;&nbsp;↳ `cumbia` | Cumbia | Cumbia |
| &nbsp;&nbsp;↳ `reggaeton` | Reggaeton | Reguetón |
| &nbsp;&nbsp;↳ `latin-urban` | Latin urban | Urbano latino |
| &nbsp;&nbsp;↳ `ranchera` | Ranchera | Ranchera |
| &nbsp;&nbsp;↳ `mariachi` | Mariachi | Mariachi |
| &nbsp;&nbsp;↳ `regional-mexican` | Regional Mexican | Regional mexicano |
| &nbsp;&nbsp;↳ `banda` | Banda | Banda |
| &nbsp;&nbsp;↳ `bolero` | Bolero | Bolero |
| &nbsp;&nbsp;↳ `tango` | Tango | Tango |
| &nbsp;&nbsp;↳ `vallenato` | Vallenato | Vallenato |
| &nbsp;&nbsp;↳ `tropical` | Tropical | Tropical |
| &nbsp;&nbsp;↳ `trova` | Trova & nueva canción | Trova y nueva canción |
| &nbsp;&nbsp;↳ `flamenco` | Flamenco & rumba | Flamenco y rumba |
| &nbsp;&nbsp;↳ `bossa-nova` | Bossa nova & MPB | Bossa nova y MPB |
| &nbsp;&nbsp;↳ `sertanejo` | Sertanejo | Sertanejo |
| `electronic` | Electronic | Electrónica |
| &nbsp;&nbsp;↳ `dance` | Dance | Dance |
| &nbsp;&nbsp;↳ `edm` | EDM | EDM |
| &nbsp;&nbsp;↳ `house` | House | House |
| &nbsp;&nbsp;↳ `eurodance` | Eurodance | Eurodance |
| `musical-theatre` | Musical theatre | Teatro musical |
| `disney` | Disney & animation | Disney y animación |
| `soundtrack` | Movie soundtrack | Banda sonora |
| `tv-theme` | TV themes | Temas de TV |
| `kids` | Kids | Infantil |
| &nbsp;&nbsp;↳ `nursery-rhyme` | Nursery rhymes | Canciones de cuna |
| `christmas` | Christmas | Navidad |
| &nbsp;&nbsp;↳ `carols` | Carols & villancicos | Villancicos |
| `gospel` | Gospel | Gospel |
| &nbsp;&nbsp;↳ `worship` | Worship & Christian | Alabanza y cristiana |
| &nbsp;&nbsp;↳ `hymns` | Hymns | Himnos |
| `oldies` | Oldies (50s/60s) | Clásicos (50s/60s) |
| &nbsp;&nbsp;↳ `doo-wop` | Doo-wop | Doo-wop |
| &nbsp;&nbsp;↳ `rockabilly` | Rockabilly | Rockabilly |
| &nbsp;&nbsp;↳ `easy-listening` | Easy listening | Easy listening |
| &nbsp;&nbsp;↳ `girl-groups` | Girl groups | Girl groups |
| &nbsp;&nbsp;↳ `british-invasion` | British Invasion | Invasión británica |
| &nbsp;&nbsp;↳ `surf` | Surf & beach | Surf |
| `crossover` | Classical crossover | Crossover clásico |
| `chanson` | French chanson | Chanson francesa |
| `italian` | Italian pop | Pop italiano |
| `a-cappella` | A cappella | A cappella |
| `novelty` | Novelty & comedy | Humor y novedad |

## Decades

| id | English | Español |
|---|---|---|
| `40s` | 1940s & earlier | 1940 y antes |
| `50s` | 1950s | 1950s |
| `60s` | 1960s | 1960s |
| `70s` | 1970s | 1970s |
| `80s` | 1980s | 1980s |
| `90s` | 1990s | 1990s |
| `00s` | 2000s | 2000s |
| `10s` | 2010s | 2010s |
| `20s` | 2020s | 2020s |

## Languages

| id | English | Español |
|---|---|---|
| `en` | English | Inglés |
| `es` | Spanish | Español |
| `pt` | Portuguese | Portugués |
| `fr` | French | Francés |
| `it` | Italian | Italiano |
| `de` | German | Alemán |
| `ko` | Korean | Coreano |
| `ja` | Japanese | Japonés |
| `tl` | Filipino / Tagalog | Filipino / tagalo |
| `id` | Indonesian | Indonesio |
| `ga` | Irish | Irlandés |
| `la` | Latin | Latín |
| `zh` | Chinese | Chino |
| `sv` | Swedish | Sueco |
| `ar` | Arabic | Árabe |

## Tags (34)

### Mood

| id | English | Español |
|---|---|---|
| `party` | Party | Fiesta |
| `upbeat` | Upbeat | Animada |
| `feel-good` | Feel-good | Buen rollo |
| `ballad` | Ballad | Balada |
| `power-ballad` | Power ballad | Balada potente |
| `slow-dance` | Slow dance | Para bailar lento |
| `romantic` | Romantic | Romántica |
| `sad` | Sad | Triste |
| `empowering` | Empowering | Empoderadora |
| `nostalgic` | Nostalgic | Nostálgica |
| `chill` | Chill | Tranquila |
| `singalong` | Group singalong | Para cantar en grupo |
| `duet-friendly` | Duet-friendly | Para cantar a dúo |

### Occasion / theme

| id | English | Español |
|---|---|---|
| `wedding` | Wedding | Boda |
| `birthday` | Birthday | Cumpleaños |
| `christmas` | Christmas | Navidad |
| `love` | Love | Amor |
| `breakup` | Breakup | Desamor |
| `summer` | Summer | Verano |
| `movie` | Movie soundtrack | Película |
| `tv` | TV theme | Serie de TV |
| `kids-family` | Kids & family | Niños y familia |
| `patriotic` | Patriotic | Patriótica |
| `graduation` | Graduation & farewell | Graduación y despedida |
| `halloween` | Halloween | Halloween |
| `drinking` | Drinking songs | Para brindar |
| `road-trip` | Road trip | Viaje en carretera |
| `funeral` | Remembrance | Homenaje |

### Singing features

`easy` / `medium` / `hard` are a vocal-range and technique hint (at most one per song). `rap-heavy` marks songs where
much of the lyrics is rapped, `duet` songs written for two voices, `duet-friendly` ones that work well as a duet.

| id | English | Español |
|---|---|---|
| `easy` | Easy to sing | Fácil de cantar |
| `medium` | Medium difficulty | Dificultad media |
| `hard` | Demanding vocals | Voz exigente |
| `rap-heavy` | Rap-heavy | Mucho rap |
| `duet` | Duet | Dúo |
| `fast-lyrics` | Fast lyrics | Letra rápida |

## How labels are assigned

There is no API key and no per-song hand labeling of 44k songs, so labels are layered, cheapest and most reliable first.
All data is plain JSON in [`packages/catalog/data/`](../packages/catalog/data/) and is validated against the taxonomy
(an unknown id throws when the labeler is created, and a unit test checks it).

1. **Artist data** (`artists.json`, `artists-2.json`): groups of artists sharing genres and language, with a default
   decade (`"Madonna@80s"` overrides the group's decade). One entry labels every song of that artist; this is where most
   coverage comes from (about 14k artists, the few thousand that matter are covered). Collaborations
   ("A ft. B", "A & B") are looked up by full credit, then by the lead artist.
2. **Rules** (`rules.json`): regexes on the title (Christmas, lullaby, theme, "from the musical", Disney...), on the artist name
   (cast, soundtrack, choir...), and per channel (Kids Karaoke Songs). They add genres and tags, and set the language
   for artists the data doesn't know.
3. **Song years** (`years.json`): release year of specific popular songs (artist -> title -> year); beats the artist's
   default decade. About 1,600 songs.
4. **Curated tags** (`tags.json`): tag -> list of `"Artist|Title"` (wedding, duet-friendly, singalong, power-ballad, hard, easy,
   rap-heavy, summer). Titles match ignoring case, accents and "(...)" suffixes.
5. **Derived tags**: party for dance/latin dance genres, ballad for balada/bolero and power ballads, romantic for wedding
   songs, `christmas`/`movie`/`tv`/`kids-family` from the genre, duet from "(duet)" in the title.
6. **Language guess** for unknown artists: Spanish/English stop-words and accents in the title, only when confident.

Decade for songs without a year is the artist's peak decade, so it is approximate for artists with long careers: add the
song to `years.json` to fix it.

## Extending

- Add an artist: append to a group in `data/artists-2.json` (or a new group) and run
  `pnpm --filter @karaoke-tube/catalog label`. The script prints coverage per label type and the most popular
  artists still unlabeled: write those next.
- Add a label id: add it to `taxonomy.ts` (and its Spanish name). Never rename.
- `pnpm --filter @karaoke-tube/catalog build-catalog` (needs the raw YouTube data) builds v2 directly with the same data.

## Using it

```ts
import { createCatalogIndex, filterSongs } from "@karaoke-tube/catalog";

index.browse({ genre: "rock", decade: "80s" }, 30);     // songs, most popular first
filterSongs(catalog, { language: "es", tag: ["wedding"] }); // indexes into catalog.songs
```

Within one field the filter is "any of" (`decade: ["80s", "90s"]`), across fields "and", and for `tag` "all of".
Readers must check `catalog.v`: `1` has no label columns (any label filter matches nothing), `2` has them.
