/** Two-line summaries per path, shared by the landing cards and the header menu. */
export interface PathTagline {
  readonly headline: string;
  /** Text after the AI sparkles mark. */
  readonly ai: string;
  /** Plain "you …" part of the second line. */
  readonly you: string;
}

/** The plain word shown after the drawn sparkles icon (no pill, no star glyph). */
export const AI_LABEL = 'AI';

/** Sparkles icon path for a viewBox of "-1 -1 26 26": one large four-point sparkle, two small ones. */
export const AI_SPARKLES_PATH =
  'M10.08 3.84 Q11.69 12.31 20.16 13.92 Q11.69 15.53 10.08 24 Q8.47 15.53 0 13.92 Q8.47 12.31 10.08 3.84Z M20.64 -0.24 Q21.29 3.19 24.72 3.84 Q21.29 4.49 20.64 7.92 Q19.99 4.49 16.56 3.84 Q19.99 3.19 20.64 -0.24Z M21.6 18 Q22.02 20.22 24.24 20.64 Q22.02 21.06 21.6 23.28 Q21.18 21.06 18.96 20.64 Q21.18 20.22 21.6 18Z';

export const PATH_TAGLINES = {
  learn: { headline: 'Learn to solve it on your own.', ai: 'hints,', you: 'you think.' },
  grow: {
    headline: 'Grow to deliver what the team designs.',
    ai: 'writes with you,',
    you: 'you run it.',
  },
  'look-ahead': {
    headline: 'Look ahead to design what the team delivers.',
    ai: 'joins the system,',
    you: 'you choose how.',
  },
} as const satisfies Record<string, PathTagline>;

export type PathTaglineId = keyof typeof PATH_TAGLINES;

/** Plain-text form without the decorative sparkles, e.g. for alt text. */
export function pathTaglineText(id: PathTaglineId): string {
  const t: PathTagline = PATH_TAGLINES[id];
  return `${t.headline} AI ${t.ai} ${t.you}`;
}
