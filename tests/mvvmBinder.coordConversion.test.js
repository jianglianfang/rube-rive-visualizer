/**
 * Property test: Coordinate Conversion (JS).
 *
 * Feature: rube-rive-visualizer, Property 5: Coordinate Conversion
 *
 * For any BodyState with position (x, y) in meters and angle in radians,
 * convertTransform SHALL produce a TransformData where:
 *   - transform.x == x * 32.0
 *   - transform.y == -y * 32.0
 *   - transform.r == angle * 180.0 / π
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PIXEL_RATIO, RAD_TO_DEG, createBodyState } from '../models.js';
import { MVVMBinder } from '../mvvmBinder.js';

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

const finiteFloat = fc.double({ min: -1e6, max: 1e6, noNaN: true });

const arbitraryBodyState = fc.record({
  index: fc.integer({ min: 0, max: 999 }),
  x: finiteFloat,
  y: finiteFloat,
  angle: finiteFloat,
}).map(({ index, x, y, angle }) =>
  createBodyState({ index, name: `body_${index}`, x, y, angle })
);

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 5: Coordinate Conversion', () => {
  const binder = new MVVMBinder();

  it('transform.x == x * 32.0', () => {
    /**
     * Feature: rube-rive-visualizer, Property 5: Coordinate Conversion
     * **Validates: Requirements 4.1**
     */
    fc.assert(
      fc.property(arbitraryBodyState, (bodyState) => {
        const result = binder.convertTransform(bodyState);
        expect(result.x).toBe(bodyState.x * PIXEL_RATIO);
      }),
      { numRuns: 100 }
    );
  });

  it('transform.y == -y * 32.0 (Y-axis flip)', () => {
    /**
     * Feature: rube-rive-visualizer, Property 5: Coordinate Conversion
     * **Validates: Requirements 4.2**
     */
    fc.assert(
      fc.property(arbitraryBodyState, (bodyState) => {
        const result = binder.convertTransform(bodyState);
        expect(result.y).toBe(-bodyState.y * PIXEL_RATIO);
      }),
      { numRuns: 100 }
    );
  });

  it('transform.r == angle * 180.0 / π', () => {
    /**
     * Feature: rube-rive-visualizer, Property 5: Coordinate Conversion
     * **Validates: Requirements 4.3**
     */
    fc.assert(
      fc.property(arbitraryBodyState, (bodyState) => {
        const result = binder.convertTransform(bodyState);
        expect(result.r).toBe(bodyState.angle * RAD_TO_DEG);
      }),
      { numRuns: 100 }
    );
  });

  it('all three conversion formulas hold simultaneously', () => {
    /**
     * Feature: rube-rive-visualizer, Property 5: Coordinate Conversion
     * **Validates: Requirements 4.1, 4.2, 4.3**
     */
    fc.assert(
      fc.property(arbitraryBodyState, (bodyState) => {
        const result = binder.convertTransform(bodyState);
        expect(result.x).toBe(bodyState.x * PIXEL_RATIO);
        expect(result.y).toBe(-bodyState.y * PIXEL_RATIO);
        expect(result.r).toBe(bodyState.angle * RAD_TO_DEG);
      }),
      { numRuns: 100 }
    );
  });
});
