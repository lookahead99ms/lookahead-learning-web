/** Connected delivery: content is authorized by the same-origin API. */
export const environment = {
  production: true,
  protectedContent: true,
  apiBaseUrl: '/api',
  // DLV-1000 (owner, 2026-11-09): previews come from the publication's staff assets, on DEV and on local alike;
  // start-private routes this path to the live working snapshots through the local Gateway.
  authorPreviewsBaseUrl: '/content/staff/previews/',
  accountPlansEnabled: true,
};
