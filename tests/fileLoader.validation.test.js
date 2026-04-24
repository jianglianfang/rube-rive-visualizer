/**
 * Property 6: File Type Validation (JS)
 *
 * For any pair of file names, the file loader SHALL accept the pair if and only if
 * exactly one file has a .json extension and exactly one has a .riv extension.
 * All other combinations SHALL be rejected.
 *
 * **Validates: Requirements 12.1, 12.2**
 *
 * @module fileLoader.validation.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateFilePair } from '../fileLoader.js';

// --- Generators ---

/** Generate a non-empty base name without dots to avoid accidental extensions. */
const baseName = fc.string({ minLength: 1, maxLength: 12 })
  .filter(s => s.length > 0 && !s.includes('.'))
  .map(s => s.replace(/[^a-zA-Z0-9_-]/g, 'x') || 'x');

/** Generate a file extension that is NOT .json or .riv */
const otherExtension = fc.constantFrom(
  '.txt', '.png', '.svg', '.html', '.css', '.js', '.xml', '.zip', '.pdf', '.bin'
);

describe('Property 6: File Type Validation', () => {
  it('accepts exactly one .json and one .riv in either order', () => {
    fc.assert(
      fc.property(baseName, baseName, fc.boolean(), (name1, name2, swap) => {
        const jsonFile = name1 + '.json';
        const rivFile = name2 + '.riv';
        if (swap) {
          expect(validateFilePair(rivFile, jsonFile)).toBe(true);
        } else {
          expect(validateFilePair(jsonFile, rivFile)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('rejects two .json files', () => {
    fc.assert(
      fc.property(baseName, baseName, (n1, n2) => {
        expect(validateFilePair(n1 + '.json', n2 + '.json')).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects two .riv files', () => {
    fc.assert(
      fc.property(baseName, baseName, (n1, n2) => {
        expect(validateFilePair(n1 + '.riv', n2 + '.riv')).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects when one file has an unsupported extension', () => {
    fc.assert(
      fc.property(baseName, baseName, otherExtension, fc.boolean(), (n1, n2, ext, useJson) => {
        const goodFile = useJson ? n1 + '.json' : n1 + '.riv';
        const badFile = n2 + ext;
        expect(validateFilePair(goodFile, badFile)).toBe(false);
        expect(validateFilePair(badFile, goodFile)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects two unsupported extensions', () => {
    fc.assert(
      fc.property(baseName, baseName, otherExtension, otherExtension, (n1, n2, ext1, ext2) => {
        expect(validateFilePair(n1 + ext1, n2 + ext2)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
