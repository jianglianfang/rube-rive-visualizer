/**
 * Unit tests for MVVMBinder (JS) using real watchface_vivo.json fixture.
 *
 * Tests cover:
 * - Binding extraction: 5 BindingRecords for bodies with VM properties t1–t5
 * - Static boundary body (no VM property) produces no binding
 * - Validation: matched, unmatched, unused scenarios
 * - Coordinate conversion with known values from watchface_vivo.json body positions
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIXEL_RATIO, RAD_TO_DEG, createBodyState } from '../models.js';
import { RubeParser } from '../rubeParser.js';
import { MVVMBinder } from '../mvvmBinder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '..', 'watchface_vivo.json');

let scene;
let binder;
let bindings;

beforeAll(() => {
  const jsonText = readFileSync(FIXTURE_PATH, 'utf-8');
  const parser = new RubeParser();
  scene = parser.parse(jsonText);
  binder = new MVVMBinder();
  bindings = binder.buildBindings(scene);
});

// ---------------------------------------------------------------------------
// Requirement 3.1, 3.5 — Binding extraction from watchface_vivo.json
// ---------------------------------------------------------------------------

describe('Binding extraction from watchface_vivo.json', () => {
  it('produces 5 BindingRecords for the 5 dynamic bodies with VM properties', () => {
    expect(bindings.length).toBe(5);
  });

  it('VM property names are t1–t5', () => {
    const vmNames = bindings.map(br => br.vmPropertyName).sort();
    expect(vmNames).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('all 5 dynamic body indices (0–4) are bound', () => {
    const indices = bindings.map(br => br.bodyIndex).sort();
    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it('body index 0 maps to VM=t1', () => {
    const br = bindings.find(b => b.bodyIndex === 0);
    expect(br.vmPropertyName).toBe('t1');
  });

  it('body index 1 maps to VM=t5', () => {
    const br = bindings.find(b => b.bodyIndex === 1);
    expect(br.vmPropertyName).toBe('t5');
  });

  it('body index 2 maps to VM=t2', () => {
    const br = bindings.find(b => b.bodyIndex === 2);
    expect(br.vmPropertyName).toBe('t2');
  });

  it('body index 3 maps to VM=t4', () => {
    const br = bindings.find(b => b.bodyIndex === 3);
    expect(br.vmPropertyName).toBe('t4');
  });

  it('body index 4 maps to VM=t3', () => {
    const br = bindings.find(b => b.bodyIndex === 4);
    expect(br.vmPropertyName).toBe('t3');
  });

  it('watchface_vivo.json bodies have no Actor properties', () => {
    for (const br of bindings) {
      expect(br.isActor).toBe(false);
      expect(br.actorName).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.1 — Static body exclusion
// ---------------------------------------------------------------------------

describe('Static body exclusion', () => {
  it('body index 5 (static boundary) is not in bindings', () => {
    const boundIndices = new Set(bindings.map(br => br.bodyIndex));
    expect(boundIndices.has(5)).toBe(false);
  });

  it('only bodies with VM custom property are bound', () => {
    for (const br of bindings) {
      const body = scene.bodies[br.bodyIndex];
      expect('VM' in body.customProperties).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.3, 12.3, 12.4 — Binding validation
// ---------------------------------------------------------------------------

describe('Binding validation', () => {
  it('all matched when Rive has t1–t5', () => {
    const riveProps = ['t1', 't2', 't3', 't4', 't5'];
    const { unmatched, unused } = binder.validateBindings(bindings, riveProps);
    expect(unmatched).toEqual([]);
    expect(unused).toEqual([]);
  });

  it('t3 unmatched when Rive is missing t3', () => {
    const riveProps = ['t1', 't2', 't4', 't5'];
    const { unmatched, unused } = binder.validateBindings(bindings, riveProps);
    expect(unmatched).toEqual(['t3']);
    expect(unused).toEqual([]);
  });

  it('t6 unused when Rive has extra t6', () => {
    const riveProps = ['t1', 't2', 't3', 't4', 't5', 't6'];
    const { unmatched, unused } = binder.validateBindings(bindings, riveProps);
    expect(unmatched).toEqual([]);
    expect(unused).toEqual(['t6']);
  });

  it('both unmatched and unused when Rive missing t3 and has extra t6', () => {
    const riveProps = ['t1', 't2', 't4', 't5', 't6'];
    const { unmatched, unused } = binder.validateBindings(bindings, riveProps);
    expect(unmatched).toContain('t3');
    expect(unused).toContain('t6');
  });

  it('all unmatched when Rive has no properties', () => {
    const { unmatched, unused } = binder.validateBindings(bindings, []);
    expect(unmatched.sort()).toEqual(['t1', 't2', 't3', 't4', 't5']);
    expect(unused).toEqual([]);
  });

  it('all unused when there are no bindings', () => {
    const riveProps = ['t1', 't2', 't3'];
    const { unmatched, unused } = binder.validateBindings([], riveProps);
    expect(unmatched).toEqual([]);
    expect(unused.sort()).toEqual(['t1', 't2', 't3']);
  });
});

// ---------------------------------------------------------------------------
// Requirement 4.1, 4.2, 4.3 — Coordinate conversion with known values
// ---------------------------------------------------------------------------

describe('Coordinate conversion with known values', () => {
  it('body t1 at position {x:2.143, y:2.075}, angle=0', () => {
    const state = createBodyState({ index: 0, name: 't1', x: 2.143, y: 2.075, angle: 0.0 });
    const result = binder.convertTransform(state);

    expect(result.x).toBeCloseTo(2.143 * 32.0, 2);
    expect(result.y).toBeCloseTo(-2.075 * 32.0, 2);
    expect(result.r).toBe(0.0);
  });

  it('body t2 at position {x:2.651, y:-1.144}, angle=-0.2618', () => {
    const state = createBodyState({ index: 2, name: 't2', x: 2.651, y: -1.144, angle: -0.2618 });
    const result = binder.convertTransform(state);

    expect(result.x).toBeCloseTo(2.651 * 32.0, 1);
    expect(result.y).toBeCloseTo(-(-1.144) * 32.0, 1);
    expect(result.r).toBeCloseTo(-0.2618 * RAD_TO_DEG, 1);
  });

  it('body t3 at position {x:0.802, y:-4.359}, angle=0.349', () => {
    const state = createBodyState({ index: 4, name: 't3', x: 0.802, y: -4.359, angle: 0.349 });
    const result = binder.convertTransform(state);

    expect(result.x).toBeCloseTo(0.802 * 32.0, 1);
    expect(result.y).toBeCloseTo(-(-4.359) * 32.0, 1);
    expect(result.r).toBeCloseTo(0.349 * RAD_TO_DEG, 1);
  });

  it('body t5 at position {x:-1.557, y:-0.574}, angle=0', () => {
    const state = createBodyState({ index: 1, name: 't5', x: -1.557, y: -0.574, angle: 0.0 });
    const result = binder.convertTransform(state);

    expect(result.x).toBeCloseTo(-1.557 * 32.0, 1);
    expect(result.y).toBeCloseTo(-(-0.574) * 32.0, 1);
    expect(result.r).toBe(0.0);
  });

  it('zero position and angle produce zero transform', () => {
    const state = createBodyState({ index: 0, name: 'origin', x: 0.0, y: 0.0, angle: 0.0 });
    const result = binder.convertTransform(state);

    expect(result.x).toBe(0.0);
    expect(result.y).toBe(-0.0);  // -0.0 * 32 = -0
    expect(result.r).toBe(0.0);
  });

  it('convertTransform returns an object with x, y, r fields', () => {
    const state = createBodyState({ index: 0, name: 'test', x: 1.0, y: 2.0, angle: 0.5 });
    const result = binder.convertTransform(state);
    expect(result).toHaveProperty('x');
    expect(result).toHaveProperty('y');
    expect(result).toHaveProperty('r');
  });
});
