// Translated names for the shared enums (award, title, reaction). English fallbacks live in @karaoke-tube/shared.
import type { Award, Reaction, TitleId } from "@karaoke-tube/shared";
import type { TFn, TKey } from "./core";

export const awardLabel = (t: TFn, a: Award) => t(`award.${a}` as TKey);
export const titleName = (t: TFn, id: TitleId) => t(`title.${id}.name` as TKey);
export const titleDesc = (t: TFn, id: TitleId) => t(`title.${id}.desc` as TKey);
export const reactionName = (t: TFn, r: Reaction) => t(`reaction.${r}` as TKey);
export const presetName = (t: TFn, id: string) => t(`browse.${id}` as TKey);
