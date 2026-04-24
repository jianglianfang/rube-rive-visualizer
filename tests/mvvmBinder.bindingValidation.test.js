/**
 * Property test: Binding Validation Correctness (JS).
 *
 * Feature: rube-rive-visualizer, Property 4: Binding Validation Correctness
 *
 * For any list of BindingRecord objects and any list of Rive ViewModel property
 * names, validateBindings SHALL return:
 *   (a) the set of VM property names from bindings not in the Rive list (unmatched)
 *   (b) the set of Rive property names not referenced by any binding (unused)
 * Both sets SHALL be exact — no false positives or false negatives.
 *
 * **Validates: Requirements 3.3, 12.3, 12.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createBindingRecord } from '../models.js';
import { MVVMBinder } from '../mvvmBinder.js';

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

const propertyName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,9}$/);

/**
 * Generate a list of BindingRecords and a list of Rive VM property names,
 * along with the expected unmatched and unused sets.
 */
const bindingsAndRiveProps = fc.record({
  shared: fc.uniqueArray(propertyName, { minLength: 0, maxLength: 5 }),
  bindingOnly: fc.uniqueArray(propertyName, { minLength: 0, maxLength: 5 }),
  riveOnly: fc.uniqueArray(propertyName, { minLength: 0, maxLength: 5 }),
}).chain(({ shared, bindingOnly, riveOnly }) => {
  // Deduplicate across groups
  const allBindingNames = [...new Set([...shared, ...bindingOnly])];
  const allRiveNames = [...new Set([...shared, ...riveOnly])];

  // Build binding records
  const bindingArbs = allBindingNames.map(name =>
    fc.record({
      bodyIndex: fc.integer({ min: 0, max: 999 }),
      bodyName: fc.string({ minLength: 0, maxLength: 8 }),
      isActor: fc.boolean(),
      actorName: fc.option(fc.string({ minLength: 1, maxLength: 8 }), { nil: null }),
    }).map(({ bodyIndex, bodyName, isActor, actorName }) =>
      createBindingRecord({ bodyIndex, bodyName, vmPropertyName: name, isActor, actorName })
    )
  );

  const bindingsArb = bindingArbs.length > 0
    ? fc.tuple(...bindingArbs)
    : fc.constant([]);

  return bindingsArb.map(bindings => {
    const bindingVmSet = new Set(allBindingNames);
    const riveSet = new Set(allRiveNames);
    const expectedUnmatched = [...bindingVmSet].filter(n => !riveSet.has(n)).sort();
    const expectedUnused = [...riveSet].filter(n => !bindingVmSet.has(n)).sort();
    return { bindings, riveProps: allRiveNames, expectedUnmatched, expectedUnused };
  });
});

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 4: Binding Validation Correctness', () => {
  const binder = new MVVMBinder();

  it('unmatched set is exact (binding VM names NOT in Rive properties)', () => {
    /**
     * Feature: rube-rive-visualizer, Property 4: Binding Validation Correctness
     * **Validates: Requirements 3.3, 12.3**
     */
    fc.assert(
      fc.property(bindingsAndRiveProps, ({ bindings, riveProps, expectedUnmatched }) => {
        const { unmatched } = binder.validateBindings(bindings, riveProps);
        expect([...unmatched].sort()).toEqual(expectedUnmatched);
      }),
      { numRuns: 100 }
    );
  });

  it('unused set is exact (Rive names NOT referenced by any binding)', () => {
    /**
     * Feature: rube-rive-visualizer, Property 4: Binding Validation Correctness
     * **Validates: Requirements 12.4**
     */
    fc.assert(
      fc.property(bindingsAndRiveProps, ({ bindings, riveProps, expectedUnused }) => {
        const { unused } = binder.validateBindings(bindings, riveProps);
        expect([...unused].sort()).toEqual(expectedUnused);
      }),
      { numRuns: 100 }
    );
  });

  it('both unmatched and unused sets are exact — no false positives or negatives', () => {
    /**
     * Feature: rube-rive-visualizer, Property 4: Binding Validation Correctness
     * **Validates: Requirements 3.3, 12.3, 12.4**
     */
    fc.assert(
      fc.property(bindingsAndRiveProps, ({ bindings, riveProps, expectedUnmatched, expectedUnused }) => {
        const { unmatched, unused } = binder.validateBindings(bindings, riveProps);
        expect([...unmatched].sort()).toEqual(expectedUnmatched);
        expect([...unused].sort()).toEqual(expectedUnused);
      }),
      { numRuns: 100 }
    );
  });

  it('with no bindings, all Rive properties are unused', () => {
    /**
     * Feature: rube-rive-visualizer, Property 4: Binding Validation Correctness
     * **Validates: Requirements 12.4**
     */
    fc.assert(
      fc.property(
        fc.uniqueArray(propertyName, { minLength: 0, maxLength: 10 }),
        (riveProps) => {
          const { unmatched, unused } = binder.validateBindings([], riveProps);
          expect(unmatched).toEqual([]);
          expect([...unused].sort()).toEqual([...riveProps].sort());
        }
      ),
      { numRuns: 100 }
    );
  });
});
