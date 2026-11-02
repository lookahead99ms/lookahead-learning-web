import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  deliveryPlanRevision,
  parseDeliveryPlanSource,
  PUBLISHED_DELIVERY_PLAN_HREF,
  shapeDeliverySnapshot,
} from './delivery-plan-publication';
import { DeliveryPublicationService } from './delivery-publication.service';

const source = {
  schemaVersion: 'delivery-plan/v1',
  id: 'plan',
  title: 'Plan',
  workItems: [{ id: 'DLV-1' }],
  stages: [],
  workflow: [],
  priorities: [],
  decisions: [],
};

describe('Published delivery plan shaping (mirror of scripts/delivery-editor.mjs readPlan)', () => {
  it('keeps the raw plan and names the revision by the SHA-256 of the bytes', async () => {
    const text = `${JSON.stringify(source, null, 2)}\n`;
    const snapshot = await shapeDeliverySnapshot(text);
    expect(snapshot.plan).toEqual(source);
    expect(snapshot.workItemId).toBeUndefined();
    expect(snapshot.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.revision).toBe(await deliveryPlanRevision(text));
    // Whitespace changes the bytes, so the revision changes while the plan does not.
    const compact = await shapeDeliverySnapshot(JSON.stringify(source));
    expect(compact.plan).toEqual(snapshot.plan);
    expect(compact.revision).not.toBe(snapshot.revision);
  });
  it('matches a known SHA-256 vector', async () => {
    expect(await deliveryPlanRevision('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
  it('rejects invalid JSON with the local editor message', () => {
    expect(() => parseDeliveryPlanSource('{not json')).toThrow(
      'The private delivery JSON is invalid. Repair it before saving.',
    );
  });
  it.each([
    'null',
    '[]',
    '"text"',
    JSON.stringify({ ...source, schemaVersion: 'delivery-plan/v2' }),
    JSON.stringify({ ...source, workItems: {} }),
    JSON.stringify({ ...source, stages: undefined }),
    JSON.stringify({ ...source, workflow: 'none' }),
    JSON.stringify({ ...source, priorities: null }),
  ])('rejects an unsupported structure: %s', (text) => {
    expect(() => parseDeliveryPlanSource(text)).toThrow(
      'The private delivery plan has an unsupported structure.',
    );
  });
});

describe('DeliveryPublicationService', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it('reads the staff publication as text and shapes it into a snapshot', async () => {
    const result = new Promise((resolve, reject) =>
      TestBed.inject(DeliveryPublicationService).load().subscribe({ next: resolve, error: reject }),
    );
    const request = TestBed.inject(HttpTestingController).expectOne(PUBLISHED_DELIVERY_PLAN_HREF);
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('text');
    expect(PUBLISHED_DELIVERY_PLAN_HREF).toBe('/content/staff/delivery-plan.json');
    request.flush(JSON.stringify(source));
    await expect(result).resolves.toMatchObject({ plan: source });
  });
  it('fails the stream when the published bytes are not a plan', async () => {
    const result = new Promise((resolve, reject) =>
      TestBed.inject(DeliveryPublicationService).load().subscribe({ next: resolve, error: reject }),
    );
    TestBed.inject(HttpTestingController).expectOne(PUBLISHED_DELIVERY_PLAN_HREF).flush('{}');
    await expect(result).rejects.toThrow('unsupported structure');
  });
});
