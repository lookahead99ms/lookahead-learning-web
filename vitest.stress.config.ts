import { defineConfig } from 'vitest/config';

// Reproduce order-dependent failures in one worker without sharing module state between files.
export default defineConfig({
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    sequence: { shuffle: true, seed: 1106 },
  },
});
