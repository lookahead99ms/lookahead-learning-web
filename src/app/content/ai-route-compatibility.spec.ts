import { PartialMatchRouteSnapshot } from '@angular/router';
import { legacyAiItemRedirect, legacyAiModuleRedirect } from './ai-route-compatibility';

const snapshot = (params: Record<string, string>) => ({ params }) as PartialMatchRouteSnapshot;

describe('legacy AI route compatibility', () => {
  it.each([
    ['ai-foundations', '/grow/ai-assisted-development/module/ai-foundations'],
    ['prompt-context', '/grow/ai-assisted-development/module/prompt-context'],
    ['guided-debugging', '/grow/ai-assisted-development/module/guided-debugging'],
    ['rag-grounding', '/look-ahead/ai-systems-architecture/module/rag-grounding'],
    ['structured-output', '/look-ahead/ai-systems-architecture/module/structured-output'],
    ['full-stack-ai-delivery', '/look-ahead/ai-systems-architecture/module/full-stack-ai-delivery'],
  ])('maps the legacy %s module to its canonical owner', (moduleId, expected) => {
    expect(legacyAiModuleRedirect(snapshot({ moduleId }))).toBe(expected);
  });

  it.each([
    [
      'ai-assisted-development-ai-foundations-guide',
      '/grow/ai-assisted-development/ai-assisted-development-ai-foundations-guide',
    ],
    [
      'ai-assisted-development-rag-grounding-evidence',
      '/look-ahead/ai-systems-architecture/ai-assisted-development-rag-grounding-evidence',
    ],
    [
      'ai-assisted-development-full-stack-ai-delivery-guide',
      '/look-ahead/ai-systems-architecture/ai-assisted-development-full-stack-ai-delivery-guide',
    ],
  ])('maps the stable legacy item %s without changing its ID', (questionId, expected) => {
    expect(legacyAiItemRedirect(snapshot({ questionId }))).toBe(expected);
  });
});
