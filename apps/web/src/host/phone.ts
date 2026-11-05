/** Below this width the host panel uses its phone layout. */
export const PHONE_QUERY = "(max-width: 820px)";

/**
 * A phone cannot be both the host panel and the TV: the phone freezes a page the moment you leave its tab, so the music stops and
 * songs stop advancing. On a phone the host panel does not offer to open the TV on that same phone; the TV goes on another device.
 */
export const isPhoneLayout = () => window.matchMedia(PHONE_QUERY).matches;
