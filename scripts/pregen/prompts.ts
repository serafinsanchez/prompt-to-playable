/**
 * Curated gallery prompts. Guidance baked in from the day-0 spike
 * (`scripts/spike/README.md`):
 *
 * - Bipeds, standing upright, arms visible — rig pose estimation succeeded
 *   first-try on this phrasing.
 * - No capes/skirts — loose geometry stretches during the emote wave
 *   (the spike knight's cloak is the cautionary tale).
 * - "low-poly" in a prompt does NOT reduce polycount (spike run 1); density
 *   is controlled by the remesh stage, not the prompt.
 */

export interface GalleryPrompt {
  /** URL-safe id; doubles as the directory name under public/gallery/. */
  slug: string;
  prompt: string;
}

export const GALLERY_PROMPTS: readonly GalleryPrompt[] = [
  {
    // Entry #1 is seeded offline from the spike run — same prompt, zero new credits.
    slug: "knight",
    prompt:
      "low-poly knight in full plate armor, standing upright, arms at sides, facing forward",
  },
  {
    slug: "robot-butler",
    prompt:
      "brass steampunk robot butler with articulated arms, standing upright, arms at sides, facing forward",
  },
  {
    slug: "goblin-scout",
    prompt:
      "forest goblin scout in fitted leather armor and trousers, standing upright, arms at sides, facing forward",
  },
  {
    slug: "astronaut",
    prompt:
      "astronaut explorer in an orange spacesuit with backpack, standing upright, arms at sides, facing forward",
  },
  {
    slug: "shield-maiden",
    prompt:
      "viking shield-maiden in chainmail shirt and trousers, standing upright, arms at sides, facing forward",
  },
  {
    slug: "street-samurai",
    prompt:
      "cyberpunk street samurai in a fitted neon jacket and cargo pants, standing upright, arms at sides, facing forward",
  },
  {
    slug: "clockwork-puppet",
    prompt:
      "wooden clockwork puppet adventurer with jointed limbs, standing upright, arms at sides, facing forward",
  },
  {
    slug: "desert-ranger",
    prompt:
      "desert ranger in a fitted tunic and trousers with goggles, standing upright, arms at sides, facing forward",
  },
];
