import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateReviewBundle, reviewFingerprint } from './review-eligibility.mjs';

const dimensions = ['technical', 'editorial', 'ux', 'accessibility'];
const now = new Date('2026-09-08T12:00:00Z');

function validBundle() {
  const learnerPayload = { id: 'sample', title: 'Sample', answer: 'Explain the invariant.' };
  const dependencies = [
    { id: 'question-renderer', value: { version: '1.0.0' } },
    { id: 'fixture-java', value: { result: 3 } },
  ];
  const checks = dimensions.map((dimension) => ({
    id: `${dimension}-complete`,
    dimension,
    outcome: 'passed',
    reviewer: { id: `reviewer-${dimension}` },
    provenance: { id: `manual-${dimension}` },
    evidenceRefs: [`evidence-${dimension}`],
  }));
  return {
    schemaVersion: 'content-review-bundle/v1',
    checklistVersion: 'review-checklist-v1',
    items: [
      {
        id: 'sample',
        learnerPayload,
        dependencies,
        requiredChecks: dimensions.map((dimension) => ({
          id: `${dimension}-complete`,
          dimension,
        })),
        authorization: { public: true },
      },
    ],
    reviews: [
      {
        itemId: 'sample',
        checklistVersion: 'review-checklist-v1',
        contentFingerprint: reviewFingerprint(learnerPayload),
        dependencies: dependencies.map(({ id, value }) => ({
          id,
          fingerprint: reviewFingerprint(value),
        })),
        checks,
      },
    ],
    evidence: dimensions.map((dimension) => ({
      id: `evidence-${dimension}`,
      available: true,
      provenanceId: `report-${dimension}`,
    })),
    sharedCoverage: [],
  };
}

function evaluate(bundle) {
  return evaluateReviewBundle(bundle, { now });
}

function blockerCodes(report) {
  return report.items[0].blockers.map(({ code }) => code);
}

test('reports a fully evidenced item as quality and publicly eligible', () => {
  const report = evaluate(validBundle());
  assert.equal(report.summary.qualityEligible, 1);
  assert.equal(report.summary.publicEligible, 1);
  assert.deepEqual(report.publicArtifactIds, ['sample']);
  assert.deepEqual(report.privatePreviewArtifactIds, ['sample']);
  for (const dimension of dimensions) assert.equal(report.summary.dimensions[dimension].passed, 1);
});

test('fails closed when there is no review record', () => {
  const bundle = validBundle();
  bundle.reviews = [];
  assert.ok(blockerCodes(evaluate(bundle)).includes('missing-review'));
});

test('fails closed when a review dimension or required check identity is missing', () => {
  const missingDimension = validBundle();
  missingDimension.items[0].requiredChecks = missingDimension.items[0].requiredChecks.filter(
    ({ dimension }) => dimension !== 'accessibility',
  );
  assert.ok(blockerCodes(evaluate(missingDimension)).includes('missing-review-dimension'));

  const duplicateCheck = validBundle();
  duplicateCheck.items[0].requiredChecks.push(duplicateCheck.items[0].requiredChecks[0]);
  assert.ok(blockerCodes(evaluate(duplicateCheck)).includes('duplicate-required-check'));
});

test('does not grandfather legacy all-true review flags', () => {
  const bundle = validBundle();
  bundle.items[0].legacyReviewEvidence = Object.fromEntries(dimensions.map((key) => [key, true]));
  bundle.reviews = [];
  assert.ok(blockerCodes(evaluate(bundle)).includes('legacy-review-unverified'));
});

test('reports one failed dimension independently of the passing dimensions', () => {
  const bundle = validBundle();
  bundle.reviews[0].checks[0].outcome = 'needs-changes';
  bundle.reviews[0].checks[0].finding = 'The complexity claim is incorrect.';
  const report = evaluate(bundle);
  assert.equal(report.items[0].dimensions.technical.status, 'blocked');
  assert.equal(report.items[0].dimensions.editorial.status, 'passed');
  assert.ok(blockerCodes(report).includes('needs-changes'));
});

test('blocks missing and unavailable evidence references with actionable reasons', () => {
  const missing = validBundle();
  missing.reviews[0].checks[0].evidenceRefs = ['does-not-exist'];
  assert.ok(blockerCodes(evaluate(missing)).includes('missing-evidence-reference'));
  const unavailable = validBundle();
  unavailable.evidence[0].available = false;
  assert.ok(blockerCodes(evaluate(unavailable)).includes('invalid-evidence-provenance'));
});

test('marks changed learner content as stale without hashing review metadata', () => {
  const bundle = validBundle();
  bundle.items[0].learnerPayload.answer = 'Changed after review.';
  assert.ok(blockerCodes(evaluate(bundle)).includes('stale-content'));
});

test('marks changed renderer or fixture dependencies as stale', () => {
  const bundle = validBundle();
  bundle.items[0].dependencies[0].value.version = '2.0.0';
  assert.ok(blockerCodes(evaluate(bundle)).includes('stale-dependency'));
});

test('rejects unjustified exemptions and accepts a scoped approved exemption', () => {
  const invalid = validBundle();
  invalid.reviews[0].checks[3] = {
    ...invalid.reviews[0].checks[3],
    outcome: 'not-applicable',
    evidenceRefs: [],
  };
  assert.ok(blockerCodes(evaluate(invalid)).includes('unjustified-exemption'));
  const valid = validBundle();
  valid.reviews[0].checks[3] = {
    ...valid.reviews[0].checks[3],
    outcome: 'not-applicable',
    evidenceRefs: [],
    exemption: {
      checkId: 'accessibility-complete',
      rationale: 'The item contains no motion or time-based media.',
      approvedBy: 'accessibility-owner',
    },
  };
  assert.equal(evaluate(valid).items[0].dimensions.accessibility.status, 'passed');
});

test('requires every promised language fixture to pass', () => {
  const bundle = validBundle();
  bundle.items[0].requiredChecks[0].languages = ['java', 'python', 'go'];
  bundle.reviews[0].checks[0].languageResults = [
    { language: 'java', outcome: 'passed' },
    { language: 'python', outcome: 'passed' },
    { language: 'go', outcome: 'needs-changes' },
  ];
  assert.ok(blockerCodes(evaluate(bundle)).includes('language-coverage-incomplete'));
});

test('validates shared renderer scope, version and evidence', () => {
  const bundle = validBundle();
  bundle.reviews[0].checks[2] = {
    ...bundle.reviews[0].checks[2],
    evidenceRefs: [],
    sharedCoverageId: 'shared-question-renderer',
  };
  bundle.sharedCoverage.push({
    id: 'shared-question-renderer',
    itemIds: ['sample'],
    checkIds: ['ux-complete'],
    rendererDependencyId: 'question-renderer',
    rendererFingerprint: reviewFingerprint({ version: '1.0.0' }),
    evidenceRefs: ['evidence-ux'],
  });
  assert.equal(evaluate(bundle).items[0].dimensions.ux.status, 'passed');
  bundle.sharedCoverage[0].rendererFingerprint = reviewFingerprint({ version: 'old' });
  assert.ok(blockerCodes(evaluate(bundle)).includes('stale-shared-renderer'));
});

test('keeps private preview artifacts while excluding them from public artifacts', () => {
  const bundle = validBundle();
  bundle.items[0].privatePreviewOnly = true;
  const report = evaluate(bundle);
  assert.equal(report.items[0].qualityEligible, true);
  assert.equal(report.items[0].publicEligible, false);
  assert.deepEqual(report.publicArtifactIds, []);
  assert.deepEqual(report.privatePreviewArtifactIds, ['sample']);
  assert.ok(blockerCodes(report).includes('not-publicly-authorized'));
});

test('rejects malformed bundles with precise structural errors', () => {
  const bundle = validBundle();
  bundle.evidence.push(bundle.evidence[0]);
  assert.throws(() => evaluate(bundle), /duplicate evidence identifier/);
  bundle.evidence.pop();
  bundle.schemaVersion = 'legacy';
  assert.throws(() => evaluate(bundle), /content-review-bundle\/v1/);
});
