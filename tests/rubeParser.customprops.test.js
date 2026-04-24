/**
 * Property test: CustomProperty Format Equivalence (JS)
 *
 * Feature: rube-rive-visualizer, Property 2: CustomProperty Format Equivalence
 *
 * For any set of custom properties (key-value pairs), parsing the standard RUBE format
 * and the GSON format SHALL produce identical internal representations.
 *
 * Validates: Requirements 1.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RubeParser } from '../rubeParser.js';

describe('Feature: rube-rive-visualizer, Property 2: CustomProperty Format Equivalence', () => {
  const parser = new RubeParser();

  it('standard RUBE and GSON formats parse identically', () => {
    const arbKeyValue = fc.record({
      key: fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}$/),
      value: fc.oneof(
        fc.string({ minLength: 0, maxLength: 20 }),
        fc.integer({ min: -10000, max: 10000 }),
      ),
    });

    fc.assert(
      fc.property(
        fc.array(arbKeyValue, { minLength: 1, maxLength: 5 }).filter(arr => {
          // Ensure unique keys
          const keys = arr.map(kv => kv.key);
          return new Set(keys).size === keys.length;
        }),
        (kvPairs) => {
          // Build standard RUBE format
          const standardFormat = kvPairs.map(({ key, value }) => {
            if (typeof value === 'string') return { name: key, string: value };
            if (typeof value === 'number') return { name: key, int: value };
            return { name: key, string: String(value) };
          });

          // Build GSON format
          const gsonFormat = kvPairs.map(({ key, value }) => ({ [key]: value }));

          const standardResult = parser._parseCustomProperties(standardFormat);
          const gsonResult = parser._parseCustomProperties(gsonFormat);

          expect(standardResult).toEqual(gsonResult);
        },
      ),
      { numRuns: 100 },
    );
  });
});
