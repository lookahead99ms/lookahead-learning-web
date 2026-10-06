import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zip-store';

describe('zipStore', () => {
  const text = new TextEncoder();

  it('computes the standard CRC-32', () => {
    expect(crc32(text.encode('hello'))).toBe(0x3610a686);
    expect(crc32(text.encode(''))).toBe(0);
  });

  it('writes local headers, a central directory and an end record that point at each other', () => {
    const zip = zipStore([
      { path: 'pom.xml', content: '<project/>' },
      { path: 'src/main/java/App.java', content: 'class App {}' },
    ], 'demo');
    const view = new DataView(zip.buffer);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
    // First entry: name under the root folder, stored, with the right size and CRC.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const nameLength = view.getUint16(26, true);
    const name = new TextDecoder().decode(zip.subarray(30, 30 + nameLength));
    expect(name).toBe('demo/pom.xml');
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(22, true)).toBe('<project/>'.length);
    expect(view.getUint32(14, true)).toBe(crc32(text.encode('<project/>')));
    const data = new TextDecoder().decode(zip.subarray(30 + nameLength, 30 + nameLength + 10));
    expect(data).toBe('<project/>');
    // The second central entry points at the second local header.
    const secondLocal = view.getUint32(centralOffset + 46 + 'demo/pom.xml'.length + 42, true);
    expect(view.getUint32(secondLocal, true)).toBe(0x04034b50);
  });
});
