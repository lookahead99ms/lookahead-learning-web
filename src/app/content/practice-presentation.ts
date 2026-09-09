import { PracticeFormat } from './content.models';

export type PracticePresentationKind = PracticeFormat | 'mixed' | 'unknown';

export interface PracticePresentationItem {
  id: string;
  practiceFormat?: PracticeFormat;
}

export interface PracticePresentation {
  kind: PracticePresentationKind;
  count: number;
  compactLabel: string;
  eyebrow: string;
  detailLabel: string;
  actionLabel: string;
  ariaLabel: string;
}

interface PracticeCopy {
  compactLabel: string;
  eyebrow: string;
  noun: string;
  pluralNoun: string;
  detailVerb: string;
  actionLabel: string;
}

const copyByKind: Record<PracticePresentationKind, PracticeCopy> = {
  explain: {
    compactLabel: 'Review questions',
    eyebrow: 'Knowledge review',
    noun: 'question',
    pluralNoun: 'questions',
    detailVerb: 'Review all',
    actionLabel: 'Review questions',
  },
  solve: {
    compactLabel: 'Solve problems',
    eyebrow: 'Problem solving',
    noun: 'problem',
    pluralNoun: 'problems',
    detailVerb: 'Solve all',
    actionLabel: 'Solve problems',
  },
  design: {
    compactLabel: 'Explore design challenges',
    eyebrow: 'Design practice',
    noun: 'design challenge',
    pluralNoun: 'design challenges',
    detailVerb: 'Explore all',
    actionLabel: 'Explore challenges',
  },
  debug: {
    compactLabel: 'Debug scenarios',
    eyebrow: 'Debugging practice',
    noun: 'debugging scenario',
    pluralNoun: 'debugging scenarios',
    detailVerb: 'Work through all',
    actionLabel: 'Debug scenarios',
  },
  rehearse: {
    compactLabel: 'Rehearse answers',
    eyebrow: 'Interview rehearsal',
    noun: 'interview prompt',
    pluralNoun: 'interview prompts',
    detailVerb: 'Rehearse all',
    actionLabel: 'Rehearse answers',
  },
  mixed: {
    compactLabel: 'Browse practice',
    eyebrow: 'Interview practice',
    noun: 'practice item',
    pluralNoun: 'practice items',
    detailVerb: 'Browse all',
    actionLabel: 'Browse practice',
  },
  unknown: {
    compactLabel: 'Browse practice',
    eyebrow: 'Interview practice',
    noun: 'practice item',
    pluralNoun: 'practice items',
    detailVerb: 'Browse all',
    actionLabel: 'Browse practice',
  },
};

export function practicePresentation(
  items: readonly PracticePresentationItem[],
  fallbackCount = items.length,
): PracticePresentation {
  const uniqueItems = [...new Map(items.map((item) => [item.id, item])).values()];
  const count = uniqueItems.length || Math.max(0, fallbackCount);
  const knownFormats = new Set(
    uniqueItems.flatMap(({ practiceFormat }) => (practiceFormat ? [practiceFormat] : [])),
  );
  const hasUnknownFormat = uniqueItems.some(({ practiceFormat }) => !practiceFormat);
  const kind: PracticePresentationKind =
    uniqueItems.length === 0 || hasUnknownFormat
      ? 'unknown'
      : knownFormats.size === 1
        ? [...knownFormats][0]
        : 'mixed';
  const copy = copyByKind[kind];
  const noun = count === 1 ? copy.noun : copy.pluralNoun;

  return {
    kind,
    count,
    compactLabel: copy.compactLabel,
    eyebrow: copy.eyebrow,
    detailLabel: `${copy.detailVerb} ${count} ${noun}`,
    actionLabel: copy.actionLabel,
    ariaLabel: `${copy.actionLabel} for this topic: ${count} ${noun}`,
  };
}
