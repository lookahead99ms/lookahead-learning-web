// Shared by validate-content.mjs and its tests; keep in step with CourseLearningUnitCard.
const learningUnitCardLevels = new Set(['Beginner', 'Intermediate', 'Advanced']);
const learningUnitCardFields = new Set([
  'summary',
  'level',
  'minutes',
  'scene',
  'sceneAlt',
  'pillGroups',
]);

/** Course-page card contract: one plain summary line, optional scene, 1-2 small pill groups. */
export function learningUnitCardErrors(card, unitLabel) {
  const errors = [];
  const label = `${unitLabel} card`;
  if (!card || typeof card !== 'object' || Array.isArray(card))
    return [`${label} must be an object`];
  for (const key of Object.keys(card)) {
    if (!learningUnitCardFields.has(key)) errors.push(`${label} has unsupported field ${key}`);
  }
  if (typeof card.summary !== 'string' || !card.summary.trim()) {
    errors.push(`${label} summary is required`);
  } else if (/[\r\n]/.test(card.summary)) {
    errors.push(`${label} summary must be one line`);
  }
  if (card.level !== undefined && !learningUnitCardLevels.has(card.level)) {
    errors.push(`${label} level must be Beginner, Intermediate or Advanced`);
  }
  if (
    card.minutes !== undefined &&
    !(Number.isInteger(card.minutes) && card.minutes > 0 && card.minutes <= 600)
  ) {
    errors.push(`${label} minutes must be a positive whole number`);
  }
  if (card.scene !== undefined) {
    if (
      typeof card.scene !== 'string' ||
      !/^\/(?:content|assets\/scenes)\/[a-z0-9][a-z0-9/_-]*\.svg$/i.test(card.scene) ||
      card.scene.includes('//')
    ) {
      errors.push(`${label} scene must be a /content/... or /assets/scenes/... .svg path`);
    }
    if (typeof card.sceneAlt !== 'string' || !card.sceneAlt.trim()) {
      errors.push(`${label} sceneAlt is required with a scene`);
    }
  }
  if (card.sceneAlt !== undefined && (typeof card.sceneAlt !== 'string' || !card.sceneAlt.trim())) {
    errors.push(`${label} sceneAlt must be non-empty text`);
  }
  if (card.pillGroups !== undefined) {
    if (
      !Array.isArray(card.pillGroups) ||
      card.pillGroups.length < 1 ||
      card.pillGroups.length > 2
    ) {
      errors.push(`${label} pillGroups must hold 1-2 groups`);
    } else {
      for (const [index, group] of card.pillGroups.entries()) {
        const groupLabel = `${label} pill group ${index + 1}`;
        if (typeof group?.label !== 'string' || !group.label.trim()) {
          errors.push(`${groupLabel} needs a label`);
        }
        if (!Array.isArray(group?.items) || group.items.length < 1 || group.items.length > 4) {
          errors.push(`${groupLabel} must hold 1-4 items`);
          continue;
        }
        for (const item of group.items) {
          if (typeof item !== 'string' || !item.trim() || item.length > 48) {
            errors.push(
              `${groupLabel} items must be short non-empty text (48 characters or fewer)`,
            );
          }
        }
      }
    }
  }
  return errors;
}

// Card drawings (catalog course/group cards and course unit cards) may carry words, but the words
// belong to the picture: the app gives every word the shared card text styling (card-scene.ts,
// tokens --card-scene-text-font/-weight/-color in styles.css), and the card title keeps its own
// path colour and weight (--card-title-color, --card-title-weight). A drawing must leave its text
// open to that styling:
// - text colour comes from a --scene-* token: ink, text, muted, accent, link and the path tokens
//   turn into the card text colour; good, warn and bad keep their status colour; card (or white)
//   is light text on a filled shape. Never a literal colour other than white, and never an app
//   token such as --text-strong, --path-* or --card-title-color (the title's colour);
// - no !important on a font or fill declaration (it would beat the shared styling);
// - nothing at headline scale: a word at most 30 per 320 view-box units of width
//   (cardSceneWordMaxSize; about one and a half card titles when the drawing is shown at its
//   authored size), a value or a single mark (7, $40, 2:10, ✓) at most 44 per 320
//   (cardSceneValueMaxSize). The weight is not checked: the shared styling sets it.
const cardSceneTextFill =
  /^var\(\s*--scene-(?:ink|text|muted|accent|link|learn|grow|ahead|good|warn|bad|card)\b/;
const cardSceneLightFill = /^(?:#fff|#ffffff|white)$/i;
const cardSceneWordScale = 30;
const cardSceneValueScale = 44;

function decodeSvgText(inner) {
  return inner
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
    .trim();
}

/** A value: at most 8 characters and no word of three or more letters. */
export function isCardSceneValue(text) {
  return text.length > 0 && text.length <= 8 && !/\p{L}{3,}/u.test(text);
}

/** A DSA node value or index: 7, 25, L, AI, v1, +1, ✓. */
export function isCardNodeValue(text) {
  return (
    /^[+\-−]?(?:\d{1,2}|\p{L}{1,2}|\p{L}\d|\d\p{L})$/u.test(text) ||
    /^[^\p{L}\p{N}\s$€£¥%]$/u.test(text)
  );
}

/** Largest font size, in view-box units, for a word in a drawing this wide (30 per 320). */
export function cardSceneWordMaxSize(width) {
  return (cardSceneWordScale * width) / 320;
}

/** Largest font size, in view-box units, for a value or single mark (44 per 320). */
export function cardSceneValueMaxSize(width) {
  return (cardSceneValueScale * width) / 320;
}

/** Declarations from the drawing's own <style>, keyed by the class a rule's last compound targets. */
function cardSceneClassRules(svg) {
  const byClass = new Map();
  for (const [, selectors, body] of svg.matchAll(/([^{}<>]+)\{([^{}]*)\}/g)) {
    for (const selector of selectors.split(',')) {
      const last = selector.trim().split(/[\s>+~]+/).pop() ?? '';
      if (!/^(?:\.[\w-]+)+$/.test(last)) continue;
      for (const name of last.slice(1).split('.')) {
        byClass.set(name, [...(byClass.get(name) ?? []), body]);
      }
    }
  }
  return byClass;
}

/** What a text element declares for itself: style attribute, then class rules, then attribute. */
function cardSceneOwnValue(attributes, rules, pattern, attribute) {
  const inline = pattern.exec(/\sstyle="([^"]*)"/.exec(attributes)?.[1] ?? '');
  if (inline) return inline[1].trim();
  let fromClass = null;
  for (const name of (/\sclass="([^"]*)"/.exec(attributes)?.[1] ?? '').split(/\s+/)) {
    for (const body of rules.get(name) ?? []) {
      const match = pattern.exec(body);
      if (match) fromClass = match[1].trim();
    }
  }
  return fromClass ?? new RegExp(`\\s${attribute}="([^"]*)"`).exec(attributes)?.[1] ?? null;
}

/**
 * Errors for card drawing text that the shared card text styling cannot reach, or that sits at
 * headline scale; empty when every word is left to the shared styling.
 */
export function cardSceneTextErrors(svg, sceneLabel) {
  const errors = [];
  const box = /viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(svg);
  const width = Number(box?.[1] ?? 320);
  const rules = cardSceneClassRules(svg);
  for (const [, body] of svg.matchAll(/\{([^{}]*)\}/g)) {
    if (/(?:^|;|\s)(?:fill|font[\w-]*)\s*:[^;]*!important/.test(body)) {
      errors.push(`${sceneLabel} sets a font or fill with !important; leave text to the card styling`);
      break;
    }
  }
  for (const [, attributes] of svg.matchAll(/<(?:text|tspan|g)\b([^>]*)>/g)) {
    const style = /\sstyle="([^"]*)"/.exec(attributes)?.[1] ?? '';
    if (/(?:fill|font[\w-]*)\s*:[^;]*!important/.test(style)) {
      errors.push(`${sceneLabel} sets a font or fill with !important; leave text to the card styling`);
      break;
    }
  }
  for (const [, attributes, inner] of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const text = decodeSvgText(inner);
    if (!text) continue;
    const fill = cardSceneOwnValue(attributes, rules, /(?:^|;|\s)fill\s*:\s*([^;]+)/, 'fill');
    if (
      fill &&
      !cardSceneTextFill.test(fill) &&
      !cardSceneLightFill.test(fill) &&
      fill !== 'inherit'
    ) {
      errors.push(
        /--(?:text-|path-|card-title)/.test(fill)
          ? `${sceneLabel} text "${text}" uses an app colour (${fill}); use a --scene-* token`
          : `${sceneLabel} text "${text}" has its own colour (${fill}); use a --scene-* token`,
      );
    }
    const size = Number(
      cardSceneOwnValue(
        attributes,
        rules,
        /(?:^|;|\s)font(?:-size)?\s*:\s*(?:[a-z-]+\s+|\d{3}\s+)*([\d.]+)px/i,
        'font-size',
      ),
    );
    if (!size) continue;
    const valueLike = isCardNodeValue(text) || isCardSceneValue(text);
    const max = valueLike ? cardSceneValueMaxSize(width) : cardSceneWordMaxSize(width);
    if (size > max + 1e-9) {
      errors.push(
        `${sceneLabel} text "${text}" is at headline scale (${size} > ${Math.round(max * 100) / 100})`,
      );
    }
  }
  return errors;
}
