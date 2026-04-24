/**
 * Property test: Binding Completeness (JS).
 *
 * Feature: rube-rive-visualizer, Property 3: Binding Completeness
 *
 * For any RubeScene containing bodies with "VM" and/or "Actor" custom properties,
 * buildBindings SHALL produce exactly one BindingRecord per body that has a "VM"
 * property, with the correct bodyIndex, bodyName, vmPropertyName, and isActor flag
 * (true iff the body also has an "Actor" property).
 *
 * **Validates: Requirements 3.1, 3.2, 3.5**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { BodyType, createVec2, createRubeBody, createRubeScene } from '../models.js';
import { MVVMBinder } from '../mvvmBinder.js';

// ---------------------------------------------------------------------------
// fast-check arbitraries
// ---------------------------------------------------------------------------

const vmName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,9}$/);
const actorName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{0,9}$/);
const bodyName = fc.string({ minLength: 0, maxLength: 10 });

/**
 * Generate a RubeBody that may or may not have VM/Actor custom properties.
 */
function arbitraryBodyAtIndex(index) {
  return fc.record({
    name: bodyName,
    hasVm: fc.boolean(),
    hasActor: fc.boolean(),
    vm: vmName,
    actor: actorName,
    bodyType: fc.constantFrom(BodyType.STATIC, BodyType.KINEMATIC, BodyType.DYNAMIC),
  }).map(({ name, hasVm, hasActor, vm, actor, bodyType }) => {
    const customProperties = {};
    if (hasVm) customProperties['VM'] = vm;
    if (hasActor) customProperties['Actor'] = actor;
    return createRubeBody({
      name,
      index,
      bodyType,
      position: createVec2(0, 0),
      customProperties,
    });
  });
}

const arbitraryScene = fc.integer({ min: 1, max: 15 }).chain(numBodies =>
  fc.tuple(...Array.from({ length: numBodies }, (_, i) => arbitraryBodyAtIndex(i)))
).map(bodies => createRubeScene({ bodies }));

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 3: Binding Completeness', () => {
  const binder = new MVVMBinder();

  it('exactly one BindingRecord per body with VM property', () => {
    /**
     * Feature: rube-rive-visualizer, Property 3: Binding Completeness
     * **Validates: Requirements 3.1, 3.2, 3.5**
     */
    fc.assert(
      fc.property(arbitraryScene, (scene) => {
        const bindings = binder.buildBindings(scene);
        const vmBodies = scene.bodies.filter(b => 'VM' in b.customProperties);
        expect(bindings.length).toBe(vmBodies.length);
      }),
      { numRuns: 100 }
    );
  });

  it('each BindingRecord has the correct bodyIndex', () => {
    /**
     * Feature: rube-rive-visualizer, Property 3: Binding Completeness
     * **Validates: Requirements 3.1, 3.5**
     */
    fc.assert(
      fc.property(arbitraryScene, (scene) => {
        const bindings = binder.buildBindings(scene);
        const byIndex = new Map(bindings.map(br => [br.bodyIndex, br]));

        for (const body of scene.bodies) {
          if ('VM' in body.customProperties) {
            expect(byIndex.has(body.index)).toBe(true);
            expect(byIndex.get(body.index).bodyIndex).toBe(body.index);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('each BindingRecord has the correct bodyName', () => {
    /**
     * Feature: rube-rive-visualizer, Property 3: Binding Completeness
     * **Validates: Requirements 3.1, 3.5**
     */
    fc.assert(
      fc.property(arbitraryScene, (scene) => {
        const bindings = binder.buildBindings(scene);
        const byIndex = new Map(bindings.map(br => [br.bodyIndex, br]));

        for (const body of scene.bodies) {
          if ('VM' in body.customProperties) {
            expect(byIndex.get(body.index).bodyName).toBe(body.name);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('each BindingRecord has the correct vmPropertyName', () => {
    /**
     * Feature: rube-rive-visualizer, Property 3: Binding Completeness
     * **Validates: Requirements 3.1, 3.5**
     */
    fc.assert(
      fc.property(arbitraryScene, (scene) => {
        const bindings = binder.buildBindings(scene);
        const byIndex = new Map(bindings.map(br => [br.bodyIndex, br]));

        for (const body of scene.bodies) {
          if ('VM' in body.customProperties) {
            expect(byIndex.get(body.index).vmPropertyName).toBe(body.customProperties['VM']);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('isActor is true iff body also has an Actor property', () => {
    /**
     * Feature: rube-rive-visualizer, Property 3: Binding Completeness
     * **Validates: Requirements 3.2, 3.5**
     */
    fc.assert(
      fc.property(arbitraryScene, (scene) => {
        const bindings = binder.buildBindings(scene);
        const byIndex = new Map(bindings.map(br => [br.bodyIndex, br]));

        for (const body of scene.bodies) {
          if ('VM' in body.customProperties) {
            const br = byIndex.get(body.index);
            const expectedIsActor = 'Actor' in body.customProperties;
            expect(br.isActor).toBe(expectedIsActor);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('bodies without VM property produce no BindingRecord', () => {
    /**
     * Feature: rube-rive-visualizer, Property 3: Binding Completeness
     * **Validates: Requirements 3.1, 3.5**
     */
    fc.assert(
      fc.property(arbitraryScene, (scene) => {
        const bindings = binder.buildBindings(scene);
        const boundIndices = new Set(bindings.map(br => br.bodyIndex));
        const nonVmIndices = new Set(
          scene.bodies.filter(b => !('VM' in b.customProperties)).map(b => b.index)
        );

        for (const idx of nonVmIndices) {
          expect(boundIndices.has(idx)).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });
});
