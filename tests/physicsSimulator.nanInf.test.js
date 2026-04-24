/**
 * Property test: NaN/Inf Detection (JS)
 *
 * Property 7: NaN/Inf Detection
 * For any list of BodyState objects where some contain NaN or Inf values
 * in position or angle fields, validateBodyStates SHALL return exactly
 * the names of bodies with invalid values — no false positives and no
 * false negatives.
 *
 * **Validates: Requirements 12.10**
 *
 * @module physicsSimulator.nanInf.test
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateBodyStates } from '../physicsSimulator.js';
import { createBodyState } from '../models.js';

/**
 * Arbitrary for a finite (valid) float — no NaN, no Inf.
 */
const finiteFloat = fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 });

/**
 * Arbitrary for a "bad" float — NaN or ±Infinity.
 */
const badFloat = fc.oneof(
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
);

/**
 * Arbitrary for a valid BodyState (all finite values).
 */
const validBodyState = fc.record({
  name: fc.string({ minLength: 1, maxLength: 20 }),
  x: finiteFloat,
  y: finiteFloat,
  angle: finiteFloat,
}).map(({ name, x, y, angle }) =>
  createBodyState({ name, x, y, angle })
);

/**
 * Arbitrary for an invalid BodyState (at least one NaN/Inf in x, y, or angle).
 */
const invalidBodyState = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 20 }),
    x: fc.oneof(finiteFloat, badFloat),
    y: fc.oneof(finiteFloat, badFloat),
    angle: fc.oneof(finiteFloat, badFloat),
  })
  .filter(({ x, y, angle }) => !isFinite(x) || !isFinite(y) || !isFinite(angle))
  .map(({ name, x, y, angle }) =>
    createBodyState({ name, x, y, angle })
  );

describe('Property 7: NaN/Inf Detection (JS)', () => {
  // @settings numRuns: 100
  it('should return empty list for all-valid body states', () => {
    fc.assert(
      fc.property(
        fc.array(validBodyState, { minLength: 0, maxLength: 20 }),
        (bodyStates) => {
          const result = validateBodyStates(bodyStates);
          expect(result).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  // @settings numRuns: 100
  it('should detect exactly the bodies with NaN/Inf — no false positives or negatives', () => {
    fc.assert(
      fc.property(
        fc.array(validBodyState, { minLength: 0, maxLength: 10 }),
        fc.array(invalidBodyState, { minLength: 1, maxLength: 10 }),
        (validStates, invalidStates) => {
          // Ensure unique names by prefixing
          const tagged = [
            ...validStates.map((s, i) => ({ ...s, name: `valid_${i}` })),
            ...invalidStates.map((s, i) => ({ ...s, name: `invalid_${i}` })),
          ];

          // Shuffle deterministically
          const mixed = tagged.sort((a, b) => a.name.localeCompare(b.name));

          const result = validateBodyStates(mixed);
          const expectedNames = invalidStates.map((_, i) => `invalid_${i}`);

          expect(result.sort()).toEqual(expectedNames.sort());
        }
      ),
      { numRuns: 100 }
    );
  });

  // @settings numRuns: 100
  it('should detect NaN in x field', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        finiteFloat,
        finiteFloat,
        (name, y, angle) => {
          const state = createBodyState({ name, x: NaN, y, angle });
          const result = validateBodyStates([state]);
          expect(result).toEqual([name]);
        }
      ),
      { numRuns: 100 }
    );
  });

  // @settings numRuns: 100
  it('should detect Infinity in y field', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        finiteFloat,
        finiteFloat,
        (name, x, angle) => {
          const state = createBodyState({ name, x, y: Infinity, angle });
          const result = validateBodyStates([state]);
          expect(result).toEqual([name]);
        }
      ),
      { numRuns: 100 }
    );
  });

  // @settings numRuns: 100
  it('should detect -Infinity in angle field', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        finiteFloat,
        finiteFloat,
        (name, x, y) => {
          const state = createBodyState({ name, x, y, angle: -Infinity });
          const result = validateBodyStates([state]);
          expect(result).toEqual([name]);
        }
      ),
      { numRuns: 100 }
    );
  });
});
