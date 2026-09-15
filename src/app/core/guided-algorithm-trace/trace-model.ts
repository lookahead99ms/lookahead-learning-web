import {
  GuidedTraceEvent,
  GuidedTraceRow,
  GuidedTraceV1,
  GuidedTraceVariable,
  PatternLanguage,
  PatternProblemV1,
} from '../../content/content.models';

/** Shared source-path adaptation for the existing debugger and Focus Studio. */
export function languageTraceEvents(
  problem: PatternProblemV1,
  trace: GuidedTraceV1,
  language: PatternLanguage,
): GuidedTraceEvent[] {
  const path = trace.languagePaths?.[language];
  if (!path?.length) return trace.events;
  const source = problem.implementations.find((item) => item.language === language)!;
  const terminalResult = trace.events.at(-1)?.result;
  return path.map((step, index) => {
    const base = trace.events[step.eventIndex] ?? trace.events[0];
    const { result: _result, ...event } = base;
    const lineIndex = source.lines.findIndex((line) => line.id === step.sourceAnchor);
    const sameAnchor = base.sourceAnchor[language] === step.sourceAnchor;
    const native = trace.stateSemantics === 'target-runtime/v1' && language !== 'python';
    return {
      ...event,
      id: `${base.id}-${language}-${index + 1}`,
      label: sameAnchor ? base.label : `Execute line ${lineIndex + 1}`,
      phase: sameAnchor ? base.phase : 'Execute',
      timing: trace.stateTiming ?? 'after',
      sourceAnchor: { ...base.sourceAnchor, [language]: step.sourceAnchor },
      what: sameAnchor
        ? base.what
        : `Execute ${source.lines[lineIndex]?.text.trim() || step.sourceAnchor} in the selected implementation.`,
      variables: native ? (step.variables ?? []) : base.variables,
      rows: native ? (step.rows ?? []) : base.rows,
      ...(step.stateUnavailable ? { stateUnavailable: true } : {}),
      ...(step.stateUnavailableReason
        ? { stateUnavailableReason: step.stateUnavailableReason }
        : {}),
      ...(index === path.length - 1 && (step.result ?? terminalResult) !== undefined
        ? { result: step.result ?? terminalResult }
        : {}),
    };
  });
}

export interface TraceSnapshot {
  event: GuidedTraceEvent | null;
  events: GuidedTraceEvent[];
  step: number;
  variables: GuidedTraceVariable[];
  rows: GuidedTraceRow[];
  unavailable: string | null;
}
/** Sparse deltas are reconstructed only from the selected language and fixture. */
export function traceSnapshot(
  problem: PatternProblemV1,
  fixtureId: string,
  language: PatternLanguage,
  requestedStep: number,
): TraceSnapshot {
  const trace = [problem.trace, ...(problem.fixtureTraces ?? [])].find(
    (item) => item.fixtureId === fixtureId,
  );
  const empty = (reason: string): TraceSnapshot => ({
    event: null,
    events: [],
    step: 0,
    variables: [],
    rows: [],
    unavailable: reason,
  });
  if (!trace) return empty('A guided trace is not published for this example.');
  if (!trace.languagePaths?.[language]?.length)
    return empty('An executed source path is not published for this language.');
  if (language !== 'python' && trace.stateSemantics !== 'target-runtime/v1')
    return empty('Runtime state is not published for this language.');
  const events = languageTraceEvents(problem, trace, language);
  const step = Math.min(Math.max(0, requestedStep), events.length - 1);
  const variables = new Map<string, GuidedTraceVariable>();
  const rows = new Map<string, GuidedTraceRow>();
  let unavailable: string | null = null;
  for (const event of events.slice(0, step + 1)) {
    if (event.stateUnavailable) {
      variables.clear();
      rows.clear();
      unavailable =
        event.stateUnavailableReason || 'Runtime state is unavailable at this instruction.';
      continue;
    }
    if (event.variables.length || event.rows.length) unavailable = null;
    for (const variable of event.variables) variables.set(variable.name, variable);
    for (const row of event.rows) {
      if (row.cells.length) rows.set(row.label, row);
      else rows.delete(row.label);
    }
  }
  const event = events[step];
  const changed = new Set(
    event.variables.filter((variable) => variable.changed).map((variable) => variable.name),
  );
  return {
    event,
    events,
    step,
    unavailable,
    rows: [...rows.values()],
    variables: [...variables.values()].map((variable) => ({
      ...variable,
      changed: changed.has(variable.name),
    })),
  };
}
