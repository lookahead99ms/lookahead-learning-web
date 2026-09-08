const baselineLanguages = ['java', 'python', 'go'];

export function includesBaselineSolutionLanguages(solutions) {
  const languages = new Set(solutions.map(({ language }) => language.toLowerCase()));
  return baselineLanguages.every((language) => languages.has(language));
}
