/**
 * Integration test: end-to-end flow for JS web mode.
 *
 * Load watchface_vivo.json → parse → binder → transform pipeline.
 * Since box2d-wasm isn't available in test env, tests the
 * parse → binder → transform pipeline without physics stepping,
 * using initial body positions as BodyState values.
 *
 * Requirements: 1.1, 2.1, 2.3, 3.1, 4.1, 4.2, 4.3, 7.5
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIXEL_RATIO, RAD_TO_DEG, BodyType, createBodyState } from '../models.js';
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

describe('End-to-end: parse → bind → transform', () => {
  it('parses 6 bodies from watchface_vivo.json', () => {
    expect(scene.bodies.length).toBe(6);
  });

  it('produces 5 bindings for dynamic bodies with VM t1–t5', () => {
    expect(bindings.length).toBe(5);
    const vmNames = bindings.map(br => br.vmPropertyName).sort();
    expect(vmNames).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('static boundary body (index 5) is excluded from bindings', () => {
    const boundIndices = new Set(bindings.map(br => br.bodyIndex));
    expect(boundIndices.has(5)).toBe(false);
    expect(scene.bodies[5].bodyType).toBe(BodyType.STATIC);
    expect(scene.bodies[5].customProperties).not.toHaveProperty('VM');
  });

  it('5 dynamic bodies produce valid TransformData from initial positions', () => {
    // Build BodyState objects from parsed initial positions (simulating what
    // the physics simulator would return at step 0)
    const bodyStates = scene.bodies.map(body => createBodyState({
      index: body.index,
      name: body.name,
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
    }));

    const transforms = binder.computeAllTransforms(bodyStates, bindings);

    // Exactly 5 transforms
    expect(Object.keys(transforms).length).toBe(5);

    for (const [vmName, td] of Object.entries(transforms)) {
      expect(['t1', 't2', 't3', 't4', 't5']).toContain(vmName);
      // No NaN or Infinity
      expect(Number.isFinite(td.x)).toBe(true);
      expect(Number.isFinite(td.y)).toBe(true);
      expect(Number.isFinite(td.r)).toBe(true);
    }
  });

  it('coordinate conversion formulas are correct for initial positions', () => {
    const bodyStates = scene.bodies.map(body => createBodyState({
      index: body.index,
      name: body.name,
      x: body.position.x,
      y: body.position.y,
      angle: body.angle,
    }));

    const transforms = binder.computeAllTransforms(bodyStates, bindings);
    const stateByIndex = new Map(bodyStates.map(s => [s.index, s]));

    for (const br of bindings) {
      const state = stateByIndex.get(br.bodyIndex);
      const td = transforms[br.vmPropertyName];

      expect(td.x).toBeCloseTo(state.x * PIXEL_RATIO, 4);
      expect(td.y).toBeCloseTo(-state.y * PIXEL_RATIO, 4);
      expect(td.r).toBeCloseTo(state.angle * RAD_TO_DEG, 4);
    }
  });

  it('body t1 initial transform matches known values', () => {
    // t1: position {x:2.143, y:2.075}, angle=0
    const state = createBodyState({ index: 0, name: 't1', x: 2.143, y: 2.075, angle: 0 });
    const td = binder.convertTransform(state);

    expect(td.x).toBeCloseTo(2.143 * 32.0, 2);
    expect(td.y).toBeCloseTo(-2.075 * 32.0, 2);
    expect(td.r).toBe(0);
  });

  it('body t2 initial transform matches known values', () => {
    // t2: position {x:2.651, y:-1.144}, angle=-0.2618
    const state = createBodyState({ index: 2, name: 't2', x: 2.651, y: -1.144, angle: -0.2618 });
    const td = binder.convertTransform(state);

    expect(td.x).toBeCloseTo(2.651 * 32.0, 1);
    expect(td.y).toBeCloseTo(1.144 * 32.0, 1);
    expect(td.r).toBeCloseTo(-0.2618 * RAD_TO_DEG, 1);
  });

  it('gravity is (0, -10)', () => {
    expect(scene.gravity.x).toBe(0);
    expect(scene.gravity.y).toBe(-10);
  });

  it('world settings are correct', () => {
    expect(scene.allowSleep).toBe(true);
    expect(scene.continuousPhysics).toBe(true);
    expect(scene.customProperties.stepsPerSecond).toBe(60);
    expect(scene.customProperties.velocityIterations).toBe(8);
    expect(scene.customProperties.positionIterations).toBe(3);
  });
});
