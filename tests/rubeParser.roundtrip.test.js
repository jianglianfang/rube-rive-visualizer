/**
 * Property test: RUBE JSON Round-Trip (JS)
 *
 * Feature: rube-rive-visualizer, Property 1: RUBE JSON Round-Trip
 *
 * For any valid RubeScene object, serializing it to RUBE JSON format
 * and then parsing the result back SHALL produce an equivalent RubeScene object.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 13.1, 13.2
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { RubeParser } from '../rubeParser.js';
import { RubeSerializer } from '../rubeSerializer.js';
import { BodyType, createVec2 } from '../models.js';

// --- Arbitraries ---

const arbFiniteFloat = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });

const arbVec2 = fc.record({
  x: arbFiniteFloat,
  y: arbFiniteFloat,
});

const arbCollisionFilter = fc.record({
  categoryBits: fc.integer({ min: 0, max: 0xFFFF }),
  maskBits: fc.integer({ min: 0, max: 0xFFFF }),
  groupIndex: fc.integer({ min: -32768, max: 32767 }),
});

const arbPolygonShape = fc.record({
  shapeType: fc.constant('polygon'),
  vertices: fc.array(arbVec2, { minLength: 3, maxLength: 8 }),
});

const arbCircleShape = fc.record({
  shapeType: fc.constant('circle'),
  radius: fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
  center: arbVec2,
});

const arbChainShape = fc.record({
  shapeType: fc.constant('chain'),
  chainVertices: fc.array(arbVec2, { minLength: 2, maxLength: 10 }),
  hasPrevVertex: fc.boolean(),
  hasNextVertex: fc.boolean(),
  prevVertex: arbVec2,
  nextVertex: arbVec2,
});

const arbShape = fc.oneof(arbPolygonShape, arbCircleShape, arbChainShape);

const arbCustomProps = fc.dictionary(
  fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,9}$/),
  fc.oneof(
    fc.string({ minLength: 0, maxLength: 10 }),
    fc.integer({ min: -1000, max: 1000 }),
  ),
  { minKeys: 0, maxKeys: 3 },
);

const arbFixture = fc.record({
  name: fc.string({ minLength: 0, maxLength: 10 }),
  shape: arbShape,
  density: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
  friction: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
  restitution: fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
  sensor: fc.boolean(),
  filter: arbCollisionFilter,
  customProperties: arbCustomProps,
});

const arbBody = fc.record({
  name: fc.string({ minLength: 0, maxLength: 10 }),
  index: fc.constant(0), // will be overwritten
  bodyType: fc.constantFrom(BodyType.STATIC, BodyType.KINEMATIC, BodyType.DYNAMIC),
  position: arbVec2,
  angle: arbFiniteFloat,
  linearVelocity: arbVec2,
  angularVelocity: arbFiniteFloat,
  linearDamping: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
  angularDamping: fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true }),
  gravityScale: fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
  bullet: fc.boolean(),
  allowSleep: fc.boolean(),
  awake: fc.boolean(),
  active: fc.boolean(),
  fixedRotation: fc.boolean(),
  massDataMass: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  massDataCenter: arbVec2,
  massDataI: fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true }),
  fixtures: fc.array(arbFixture, { minLength: 1, maxLength: 3 }),
  customProperties: arbCustomProps,
});

const arbScene = fc.record({
  gravity: arbVec2,
  allowSleep: fc.boolean(),
  autoClearForces: fc.boolean(),
  warmStarting: fc.boolean(),
  continuousPhysics: fc.boolean(),
  subStepping: fc.boolean(),
  bodies: fc.array(arbBody, { minLength: 1, maxLength: 4 }),
  joints: fc.constant([]),
  images: fc.constant([]),
  customProperties: arbCustomProps,
});

// --- Helpers ---

function approxEqual(a, b, eps = 1e-9) {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === 0 && b === 0) return true;
    return Math.abs(a - b) <= eps + eps * Math.max(Math.abs(a), Math.abs(b));
  }
  return a === b;
}

function vec2Equal(a, b) {
  return approxEqual(a.x, b.x) && approxEqual(a.y, b.y);
}

function shapeEqual(a, b) {
  if (a.shapeType !== b.shapeType) return false;
  if (a.shapeType === 'circle') {
    return approxEqual(a.radius, b.radius) && vec2Equal(a.center, b.center);
  }
  if (a.shapeType === 'polygon') {
    if (a.vertices.length !== b.vertices.length) return false;
    return a.vertices.every((v, i) => vec2Equal(v, b.vertices[i]));
  }
  if (a.shapeType === 'chain') {
    if (a.chainVertices.length !== b.chainVertices.length) return false;
    return a.chainVertices.every((v, i) => vec2Equal(v, b.chainVertices[i]));
  }
  return true;
}

function fixtureEqual(a, b) {
  return a.name === b.name &&
    approxEqual(a.density, b.density) &&
    approxEqual(a.friction, b.friction) &&
    approxEqual(a.restitution, b.restitution) &&
    a.sensor === b.sensor &&
    shapeEqual(a.shape, b.shape);
}

function bodyEqual(a, b) {
  return a.name === b.name &&
    a.bodyType === b.bodyType &&
    vec2Equal(a.position, b.position) &&
    approxEqual(a.angle, b.angle) &&
    a.fixtures.length === b.fixtures.length &&
    a.fixtures.every((f, i) => fixtureEqual(f, b.fixtures[i]));
}

function sceneEqual(a, b) {
  return vec2Equal(a.gravity, b.gravity) &&
    a.allowSleep === b.allowSleep &&
    a.continuousPhysics === b.continuousPhysics &&
    a.bodies.length === b.bodies.length &&
    a.bodies.every((body, i) => bodyEqual(body, b.bodies[i]));
}

// --- Test ---

describe('Feature: rube-rive-visualizer, Property 1: RUBE JSON Round-Trip', () => {
  const parser = new RubeParser();
  const serializer = new RubeSerializer();

  it('serialize → parse produces equivalent scene', () => {
    fc.assert(
      fc.property(arbScene, (scene) => {
        // Fix body indices
        scene.bodies.forEach((b, i) => { b.index = i; });

        const json = serializer.serialize(scene);
        const parsed = parser.parse(json);

        expect(sceneEqual(scene, parsed)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
