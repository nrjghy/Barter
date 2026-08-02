// Small rotating set of avatar tints (earth-tone family, matching the new
// visual direction) so people have some visual variety, same spirit as the
// approved mockup's per-contact avatar colors. Shared between Chat's
// connection list and the review-writing screen, both of which render a
// single-letter-initial avatar for another user.
export const AVATAR_PALETTES = [
  { bg: "oklch(93% 0.035 145)", color: "oklch(34% 0.09 148)" }, // sage green
  { bg: "oklch(90% 0.04 70)", color: "oklch(45% 0.08 60)" }, // terracotta
  { bg: "oklch(90% 0.03 230)", color: "oklch(42% 0.08 230)" }, // muted teal
  { bg: "oklch(90% 0.03 300)", color: "oklch(42% 0.09 300)" }, // muted plum
];

export function pickAvatarPalette(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}
