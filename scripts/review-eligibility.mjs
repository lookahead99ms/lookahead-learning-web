import { createHash } from 'node:crypto';

export const REVIEW_DIMENSIONS = ['technical', 'editorial', 'ux', 'accessibility'];
const outcomes = new Set(['not-checked', 'needs-changes', 'passed', 'not-applicable']);
const identifier = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function reviewFingerprint(value) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');
}

function validIdentifier(value) {
  return typeof value === 'string' && identifier.test(value);
}

function dependencyMap(dependencies = []) {
  return new Map(
    dependencies.map((dependency) => [
      dependency.id,
      dependency.fingerprint ?? reviewFingerprint(dependency.value),
    ]),
  );
}

function blocker(code, message, dimension, checkId) {
  return {
    code,
    message,
    ...(dimension ? { dimension } : {}),
    ...(checkId ? { checkId } : {}),
  };
}

function validateBundle(bundle) {
  if (bundle?.schemaVersion !== 'content-review-bundle/v1') {
    throw new Error('Review bundle must use content-review-bundle/v1');
  }
  if (!validIdentifier(bundle.checklistVersion)) {
    throw new Error('Review bundle has an invalid checklistVersion');
  }
  for (const field of ['items', 'reviews', 'evidence', 'sharedCoverage']) {
    if (!Array.isArray(bundle[field])) throw new Error(`Review bundle ${field} must be an array`);
  }
  for (const [label, records, key] of [
    ['item', bundle.items, 'id'],
    ['review', bundle.reviews, 'itemId'],
    ['evidence', bundle.evidence, 'id'],
    ['shared coverage', bundle.sharedCoverage, 'id'],
  ]) {
    const values = records.map((record) => record?.[key]);
    if (values.some((value) => !validIdentifier(value))) {
      throw new Error(`Review bundle contains an invalid ${label} identifier`);
    }
    if (new Set(values).size !== values.length) {
      throw new Error(`Review bundle contains a duplicate ${label} identifier`);
    }
  }
}

function currentInputs(item) {
  return {
    contentFingerprint: reviewFingerprint(item.learnerPayload),
    dependencies: dependencyMap(item.dependencies),
  };
}

function evidenceBlockers(check, evidenceById) {
  if (!Array.isArray(check.evidenceRefs) || check.evidenceRefs.length === 0) {
    return [
      blocker(
        'missing-evidence',
        'Passing check has no evidence reference.',
        check.dimension,
        check.id,
      ),
    ];
  }
  const failures = [];
  for (const evidenceId of check.evidenceRefs) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) {
      failures.push(
        blocker(
          'missing-evidence-reference',
          `Evidence ${evidenceId} does not resolve.`,
          check.dimension,
          check.id,
        ),
      );
    } else if (evidence.available !== true || !validIdentifier(evidence.provenanceId)) {
      failures.push(
        blocker(
          'invalid-evidence-provenance',
          `Evidence ${evidenceId} is unavailable or lacks provenance.`,
          check.dimension,
          check.id,
        ),
      );
    }
  }
  return failures;
}

function sharedCoverageBlockers(check, item, coverageById, evidenceById, inputs) {
  if (!check.sharedCoverageId) return [];
  const coverage = coverageById.get(check.sharedCoverageId);
  if (!coverage) {
    return [
      blocker(
        'missing-shared-coverage',
        `Shared coverage ${check.sharedCoverageId} does not resolve.`,
        check.dimension,
        check.id,
      ),
    ];
  }
  if (!coverage.itemIds?.includes(item.id) || !coverage.checkIds?.includes(check.id)) {
    return [
      blocker(
        'shared-coverage-out-of-scope',
        `Shared coverage ${coverage.id} does not include this item and check.`,
        check.dimension,
        check.id,
      ),
    ];
  }
  const currentRenderer = inputs.dependencies.get(coverage.rendererDependencyId);
  if (!currentRenderer || currentRenderer !== coverage.rendererFingerprint) {
    return [
      blocker(
        'stale-shared-renderer',
        `Shared coverage ${coverage.id} does not match the current renderer.`,
        check.dimension,
        check.id,
      ),
    ];
  }
  return evidenceBlockers(
    { ...check, evidenceRefs: coverage.evidenceRefs ?? check.evidenceRefs },
    evidenceById,
  );
}

function languageBlockers(required, check) {
  if (!Array.isArray(required.languages) || required.languages.length === 0) return [];
  const results = new Map((check.languageResults ?? []).map((result) => [result.language, result]));
  const missing = required.languages.filter(
    (language) => results.get(language)?.outcome !== 'passed',
  );
  return missing.length
    ? [
        blocker(
          'language-coverage-incomplete',
          `Passing check is missing successful results for: ${missing.join(', ')}.`,
          required.dimension,
          required.id,
        ),
      ]
    : [];
}

function checkResult(required, check, context) {
  const failures = [];
  if (!check) {
    failures.push(
      blocker(
        'missing-check',
        `Required check ${required.id} is absent.`,
        required.dimension,
        required.id,
      ),
    );
  } else if (check.dimension !== required.dimension || check.id !== required.id) {
    failures.push(
      blocker(
        'invalid-check',
        `Review check ${required.id} has mismatched identity.`,
        required.dimension,
        required.id,
      ),
    );
  } else if (!outcomes.has(check.outcome)) {
    failures.push(
      blocker(
        'invalid-outcome',
        `Review check ${required.id} has an invalid outcome.`,
        required.dimension,
        required.id,
      ),
    );
  } else if (!validIdentifier(check.reviewer?.id) || !validIdentifier(check.provenance?.id)) {
    failures.push(
      blocker(
        'missing-review-provenance',
        `Review check ${required.id} lacks reviewer or provenance identity.`,
        required.dimension,
        required.id,
      ),
    );
  } else if (check.expiresAt && Date.parse(check.expiresAt) <= context.now.getTime()) {
    failures.push(
      blocker(
        'stale-evidence',
        `Review check ${required.id} has expired.`,
        required.dimension,
        required.id,
      ),
    );
  } else if (check.outcome === 'not-checked') {
    failures.push(
      blocker(
        'not-checked',
        `Required check ${required.id} has not been checked.`,
        required.dimension,
        required.id,
      ),
    );
  } else if (check.outcome === 'needs-changes') {
    failures.push(
      blocker(
        'needs-changes',
        check.finding?.trim() || `Required check ${required.id} needs changes.`,
        required.dimension,
        required.id,
      ),
    );
  } else if (check.outcome === 'not-applicable') {
    const exemption = check.exemption;
    if (
      exemption?.checkId !== required.id ||
      !exemption.rationale?.trim() ||
      !validIdentifier(exemption.approvedBy)
    ) {
      failures.push(
        blocker(
          'unjustified-exemption',
          `Check ${required.id} has no valid check-scoped exemption.`,
          required.dimension,
          required.id,
        ),
      );
    }
  } else if (check.outcome === 'passed') {
    if (check.sharedCoverageId) {
      failures.push(
        ...sharedCoverageBlockers(
          check,
          context.item,
          context.coverageById,
          context.evidenceById,
          context.inputs,
        ),
      );
    } else {
      failures.push(...evidenceBlockers(check, context.evidenceById));
    }
    failures.push(...languageBlockers(required, check));
  }
  return {
    id: required.id,
    dimension: required.dimension,
    outcome: check?.outcome ?? 'missing',
    status: failures.length ? 'blocked' : 'passed',
    blockers: failures,
  };
}

function evaluateItem(item, review, context) {
  const inputs = currentInputs(item);
  const blockers = [];
  if (!Array.isArray(item.requiredChecks) || item.requiredChecks.length === 0) {
    blockers.push(
      blocker('missing-required-checks', 'Item does not declare required review checks.'),
    );
  }
  const requiredCheckIds = (item.requiredChecks ?? []).map(({ id }) => id);
  if (new Set(requiredCheckIds).size !== requiredCheckIds.length) {
    blockers.push(
      blocker('duplicate-required-check', 'Item declares a required review check more than once.'),
    );
  }
  for (const required of item.requiredChecks ?? []) {
    if (!validIdentifier(required.id) || !REVIEW_DIMENSIONS.includes(required.dimension)) {
      blockers.push(
        blocker('invalid-required-check', 'Item has an invalid required review check.'),
      );
    }
  }
  for (const dimension of REVIEW_DIMENSIONS) {
    if (!(item.requiredChecks ?? []).some((required) => required.dimension === dimension)) {
      blockers.push(
        blocker(
          'missing-review-dimension',
          `Item does not declare a required ${dimension} review check.`,
          dimension,
        ),
      );
    }
  }
  if (!review) {
    blockers.push(
      blocker(
        item.legacyReviewEvidence ? 'legacy-review-unverified' : 'missing-review',
        item.legacyReviewEvidence
          ? 'Legacy review flags are historical assertions, not current evidence.'
          : 'Item has no review record.',
      ),
    );
  } else {
    if (review.checklistVersion !== context.checklistVersion) {
      blockers.push(blocker('stale-checklist', 'Review uses a different checklist version.'));
    }
    if (review.contentFingerprint !== inputs.contentFingerprint) {
      blockers.push(blocker('stale-content', 'Reviewed content fingerprint is stale.'));
    }
    const reviewedDependencies = new Map(
      (review.dependencies ?? []).map(({ id, fingerprint }) => [id, fingerprint]),
    );
    for (const [id, fingerprint] of inputs.dependencies) {
      if (reviewedDependencies.get(id) !== fingerprint) {
        blockers.push(
          blocker('stale-dependency', `Reviewed dependency ${id} is stale or missing.`),
        );
      }
    }
    for (const id of reviewedDependencies.keys()) {
      if (!inputs.dependencies.has(id)) {
        blockers.push(
          blocker('unknown-reviewed-dependency', `Reviewed dependency ${id} is no longer scoped.`),
        );
      }
    }
  }

  const checks = new Map((review?.checks ?? []).map((check) => [check.id, check]));
  const checkResults = (item.requiredChecks ?? []).map((required) =>
    checkResult(required, checks.get(required.id), { ...context, item, inputs }),
  );
  blockers.push(...checkResults.flatMap((result) => result.blockers));
  const dimensions = Object.fromEntries(
    REVIEW_DIMENSIONS.map((dimension) => {
      const results = checkResults.filter((result) => result.dimension === dimension);
      return [
        dimension,
        {
          status:
            results.length > 0 && results.every((result) => result.status === 'passed')
              ? 'passed'
              : 'blocked',
          checks: results,
        },
      ];
    }),
  );
  const qualityEligible = blockers.length === 0;
  const publicEligible =
    qualityEligible && item.authorization?.public === true && item.privatePreviewOnly !== true;
  if (qualityEligible && !publicEligible) {
    blockers.push(
      blocker(
        'not-publicly-authorized',
        'Item is reviewed but is not authorized for public delivery.',
      ),
    );
  }
  return {
    id: item.id,
    contentFingerprint: inputs.contentFingerprint,
    dimensions,
    qualityEligible,
    publicEligible,
    blockers,
  };
}

export function evaluateReviewBundle(bundle, { now = new Date() } = {}) {
  validateBundle(bundle);
  const reviewByItem = new Map(bundle.reviews.map((review) => [review.itemId, review]));
  const context = {
    checklistVersion: bundle.checklistVersion,
    evidenceById: new Map(bundle.evidence.map((evidence) => [evidence.id, evidence])),
    coverageById: new Map(bundle.sharedCoverage.map((coverage) => [coverage.id, coverage])),
    now,
  };
  const items = bundle.items.map((item) => evaluateItem(item, reviewByItem.get(item.id), context));
  const dimensionSummary = Object.fromEntries(
    REVIEW_DIMENSIONS.map((dimension) => [
      dimension,
      {
        passed: items.filter((item) => item.dimensions[dimension].status === 'passed').length,
        blocked: items.filter((item) => item.dimensions[dimension].status === 'blocked').length,
      },
    ]),
  );
  return {
    schemaVersion: 'content-review-eligibility-report/v1',
    checklistVersion: bundle.checklistVersion,
    generatedAt: now.toISOString(),
    summary: {
      items: items.length,
      qualityEligible: items.filter((item) => item.qualityEligible).length,
      publicEligible: items.filter((item) => item.publicEligible).length,
      blocked: items.filter((item) => !item.publicEligible).length,
      dimensions: dimensionSummary,
    },
    publicArtifactIds: items.filter((item) => item.publicEligible).map((item) => item.id),
    privatePreviewArtifactIds: items.map((item) => item.id),
    items,
  };
}
