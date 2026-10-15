/** Grow teaches topic-specific platforms; Learn retains its comparative contract. */
/**
 * `languages`: a lesson that ships its project in named languages (DLV-935 guided projects: Java and Python
 * downloads) covers exactly those languages instead of the Java, Python and Go baseline.
 */
export function foundationLanguageNoteErrors(notes, pathSlug, languages) {
  if (!Array.isArray(notes) || notes.length === 0) return ['must include implementation notes'];
  const labels = new Set();
  const errors = [];
  for (const item of notes) {
    if (
      typeof item?.language !== 'string' ||
      !item.language.trim() ||
      typeof item?.note !== 'string' ||
      !item.note.trim()
    ) {
      errors.push('implementation notes require a language/platform label and meaningful text');
      continue;
    }
    const label = item.language.trim().toLowerCase();
    if (labels.has(label)) errors.push(`repeats implementation note label ${label}`);
    labels.add(label);
  }
  if (languages?.length) {
    if (notes.length !== languages.length || !languages.every((label) => labels.has(label))) {
      errors.push(`language notes must cover ${languages.join(', ')} exactly once`);
    }
  } else if (
    pathSlug !== 'grow' &&
    (notes.length !== 3 || !['java', 'python', 'go'].every((label) => labels.has(label)))
  ) {
    errors.push('language notes must cover Java, Python, and Go exactly once');
  }
  return errors;
}
