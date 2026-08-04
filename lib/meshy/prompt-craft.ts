/**
 * Character prompt craft — the pro-artist phrasing every live prompt gets
 * before it reaches Meshy, plus the detectors behind the prompt bar's hints.
 *
 * Why: raw prompts like "a basketball player" come back frozen mid-action
 * with duplicated limbs and props welded to the hands — the worst possible
 * input for the rig → animate stages. The scaffold asks for what a character
 * artist would model; the detectors warn (never block, never rewrite) when
 * the visitor's own words fight it. Isomorphic, pure — no window, no state.
 */

/** Meshy's text-to-3d prompt ceiling (docs.meshy.ai, both modes). */
export const MAX_PROMPT_LENGTH = 600;

/**
 * Appended to every live prompt. Each phrase earns its place: standing/neutral
 * fixes action poses, symmetrical fixes mirrored-limb artifacts (two left
 * shoes), empty hands keeps props from fusing into the mesh, full body keeps
 * the framing from cropping at the waist.
 */
export const CHARACTER_SCAFFOLD =
  "full body game character, standing in a neutral pose, symmetrical, empty hands, no held objects, low-poly, game ready";

/** User prompt + scaffold, capped at 600 chars — the scaffold always survives. */
export function scaffoldPrompt(prompt: string): string {
  const scaffolded = `${prompt.trim()}, ${CHARACTER_SCAFFOLD}`;
  if (scaffolded.length <= MAX_PROMPT_LENGTH) return scaffolded;
  const room = MAX_PROMPT_LENGTH - CHARACTER_SCAFFOLD.length - 2;
  return `${prompt.trim().slice(0, room).trimEnd()}, ${CHARACTER_SCAFFOLD}`;
}

/**
 * Action language that fights the neutral pose the rig needs. Whole words
 * only ("jumper" the garment must not trip "jump").
 */
const ACTION_PATTERNS: readonly RegExp[] = [
  /\bdunk(?:ing|s|ed)?\b/i,
  /\bjump(?:ing|s|ed)?\b/i,
  /\bleap(?:ing|s|ed)?\b/i,
  /\bmid-?air\b/i,
  /\bfly(?:ing)?\b/i,
  /\bkick(?:ing|s|ed)?\b/i,
  /\bpunch(?:ing|es|ed)?\b/i,
  /\bsprint(?:ing|s|ed)?\b/i,
  /\bswing(?:ing|s)?\b/i,
  /\bthrow(?:ing|s)?\b/i,
  /\bshooting\b/i,
  /\bdiving\b/i,
  /\bsliding\b/i,
  /\bcrouch(?:ing|ed)?\b/i,
  /\bdancing\b/i,
  /\bfighting\b/i,
  /\battack(?:ing|s)?\b/i,
  /\baction pose\b/i,
  /\bdynamic pose\b/i,
  /\bhands up\b/i,
  /\barms (?:up|raised|outstretched)\b/i,
] as const;

/**
 * Held props that would fuse into the character mesh and stretch during
 * animation. Longer nouns first so "basketball" wins before "ball" could.
 */
const PROP_PATTERNS: readonly RegExp[] = [
  /\bbasketball\b/i,
  /\bfootball\b/i,
  /\bbaseball bat\b/i,
  /\bball\b/i,
  /\bsword\b/i,
  /\bkatana\b/i,
  /\bdagger\b/i,
  /\bshield\b/i,
  /\bgun\b/i,
  /\brifle\b/i,
  /\bpistol\b/i,
  /\bstaff\b/i,
  /\bwand\b/i,
  /\baxe\b/i,
  /\bbow\b/i,
  /\bspear\b/i,
  /\bhammer\b/i,
  /\bmace\b/i,
  /\bscythe\b/i,
  /\bracket\b/i,
  /\bguitar\b/i,
  /\btorch\b/i,
] as const;

function matchAll(prompt: string, patterns: readonly RegExp[]): string[] {
  const found: string[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(prompt);
    if (match) found.push(match[0].toLowerCase());
  }
  // Report in prompt order — the hint reads back the visitor's own words.
  return found.sort(
    (a, b) => prompt.toLowerCase().indexOf(a) - prompt.toLowerCase().indexOf(b),
  );
}

/** The visitor's action words (lowercased, prompt order); empty when neutral. */
export function detectActionLanguage(prompt: string): string[] {
  return matchAll(prompt, ACTION_PATTERNS);
}

/** Held-prop nouns (lowercased, prompt order); empty when hands are free. */
export function detectHeldProps(prompt: string): string[] {
  return matchAll(prompt, PROP_PATTERNS);
}
