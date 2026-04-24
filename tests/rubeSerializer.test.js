/**
 * Unit tests for RubeSerializer (JS)
 *
 * Tests round-trip serialization, compact format conventions, and data preservation.
 *
 * Requirements: 13.1, 13.2, 13.3
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RubeParser } from '../rubeParser.js';
import { RubeSerializer } from '../rubeSerializer.js';
import { BodyType, createVec2, createRubeScene, createRubeBody, createCollisionFilter } from '../models.js';

describe('RubeSerializer unit tests', () => {
  const parser = new RubeParser();
  const serializer = new RubeSerializer();
  let originalScene;

  beforeAll(() => {
    const fixturePath = resolve(import.meta.dirname, '..', 'watchface_vivo.json');
    const jsonString = readFileSync(fixturePath, 'utf-8');
    originalScene = parser.parse(jsonString);
  });

  describe('round-trip with watchface_vivo.json', () => {
    let roundTripScene;

    beforeAll(() => {
      const serialized = serializer.serialize(originalScene);
      roundTripScene = parser.parse(serialized);
    });

    it('preserves gravity', () => {
      expect(roundTripScene.gravity.x).toBe(originalScene.gravity.x);
      expect(roundTripScene.gravity.y).toBe(originalScene.gravity.y);
    });

    it('preserves allowSleep', () => {
      expect(roundTripScene.allowSleep).toBe(originalScene.allowSleep);
    });

    it('preserves continuousPhysics', () => {
      expect(roundTripScene.continuousPhysics).toBe(originalScene.continuousPhysics);
    });

    it('preserves subStepping', () => {
      expect(roundTripScene.subStepping).toBe(originalScene.subStepping);
    });

    it('preserves warmStarting', () => {
      expect(roundTripScene.warmStarting).toBe(originalScene.warmStarting);
    });

    it('preserves body count', () => {
      expect(roundTripScene.bodies.length).toBe(originalScene.bodies.length);
    });

    it('preserves body types', () => {
      for (let i = 0; i < originalScene.bodies.length; i++) {
        expect(roundTripScene.bodies[i].bodyType).toBe(originalScene.bodies[i].bodyType);
      }
    });

    it('preserves body positions', () => {
      for (let i = 0; i < originalScene.bodies.length; i++) {
        expect(roundTripScene.bodies[i].position.x).toBeCloseTo(originalScene.bodies[i].position.x, 5);
        expect(roundTripScene.bodies[i].position.y).toBeCloseTo(originalScene.bodies[i].position.y, 5);
      }
    });

    it('preserves body angles', () => {
      for (let i = 0; i < originalScene.bodies.length; i++) {
        expect(roundTripScene.bodies[i].angle).toBeCloseTo(originalScene.bodies[i].angle, 5);
      }
    });

    it('preserves fixture counts per body', () => {
      for (let i = 0; i < originalScene.bodies.length; i++) {
        expect(roundTripScene.bodies[i].fixtures.length).toBe(originalScene.bodies[i].fixtures.length);
      }
    });

    it('preserves custom properties on bodies', () => {
      for (let i = 0; i < originalScene.bodies.length; i++) {
        const origProps = originalScene.bodies[i].customProperties;
        const rtProps = roundTripScene.bodies[i].customProperties;
        expect(rtProps.VM).toBe(origProps.VM);
      }
    });

    it('preserves world settings', () => {
      expect(roundTripScene.customProperties.stepsPerSecond).toBe(originalScene.customProperties.stepsPerSecond);
      expect(roundTripScene.customProperties.velocityIterations).toBe(originalScene.customProperties.velocityIterations);
      expect(roundTripScene.customProperties.positionIterations).toBe(originalScene.customProperties.positionIterations);
    });

    it('preserves collisionbitplanes', () => {
      expect(roundTripScene.customProperties.collisionbitplanes).toBeDefined();
    });

    it('preserves joint count (empty)', () => {
      expect(roundTripScene.joints.length).toBe(originalScene.joints.length);
    });
  });

  describe('data preservation', () => {
    it('preserves all 6 bodies', () => {
      const serialized = serializer.serialize(originalScene);
      const rt = parser.parse(serialized);
      expect(rt.bodies.length).toBe(6);
      const dynamic = rt.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      const staticBodies = rt.bodies.filter(b => b.bodyType === BodyType.STATIC);
      expect(dynamic.length).toBe(5);
      expect(staticBodies.length).toBe(1);
    });

    it('preserves polygon vertices for dynamic bodies', () => {
      const serialized = serializer.serialize(originalScene);
      const rt = parser.parse(serialized);
      const dynamic = rt.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      for (let i = 0; i < dynamic.length; i++) {
        const origBody = originalScene.bodies.find(
          b => b.customProperties.VM === dynamic[i].customProperties.VM
        );
        expect(dynamic[i].fixtures.length).toBe(origBody.fixtures.length);
        for (let j = 0; j < origBody.fixtures.length; j++) {
          const origVerts = origBody.fixtures[j].shape.vertices;
          const rtVerts = dynamic[i].fixtures[j].shape.vertices;
          expect(rtVerts.length).toBe(origVerts.length);
          for (let k = 0; k < origVerts.length; k++) {
            expect(rtVerts[k].x).toBeCloseTo(origVerts[k].x, 5);
            expect(rtVerts[k].y).toBeCloseTo(origVerts[k].y, 5);
          }
        }
      }
    });

    it('preserves chain vertices for static boundary body', () => {
      const serialized = serializer.serialize(originalScene);
      const rt = parser.parse(serialized);
      const staticBody = rt.bodies.find(b => b.bodyType === BodyType.STATIC);
      const chainFixture = staticBody.fixtures.find(f => f.shape.shapeType === 'chain');
      const origStatic = originalScene.bodies.find(b => b.bodyType === BodyType.STATIC);
      const origChain = origStatic.fixtures.find(f => f.shape.shapeType === 'chain');

      expect(chainFixture).toBeDefined();
      expect(chainFixture.shape.chainVertices.length).toBe(origChain.shape.chainVertices.length);
      expect(chainFixture.shape.chainVertices.length).toBeGreaterThanOrEqual(64);

      for (let i = 0; i < origChain.shape.chainVertices.length; i++) {
        expect(chainFixture.shape.chainVertices[i].x).toBeCloseTo(origChain.shape.chainVertices[i].x, 5);
        expect(chainFixture.shape.chainVertices[i].y).toBeCloseTo(origChain.shape.chainVertices[i].y, 5);
      }
    });

    it('preserves chain hasNextVertex/hasPrevVertex flags', () => {
      const serialized = serializer.serialize(originalScene);
      const rt = parser.parse(serialized);
      const staticBody = rt.bodies.find(b => b.bodyType === BodyType.STATIC);
      const chainFixture = staticBody.fixtures.find(f => f.shape.shapeType === 'chain');
      const origStatic = originalScene.bodies.find(b => b.bodyType === BodyType.STATIC);
      const origChain = origStatic.fixtures.find(f => f.shape.shapeType === 'chain');

      expect(chainFixture.shape.hasNextVertex).toBe(origChain.shape.hasNextVertex);
      expect(chainFixture.shape.hasPrevVertex).toBe(origChain.shape.hasPrevVertex);
    });

    it('preserves VM custom properties t1-t5', () => {
      const serialized = serializer.serialize(originalScene);
      const rt = parser.parse(serialized);
      const dynamic = rt.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      const vmNames = dynamic.map(b => b.customProperties.VM).sort();
      expect(vmNames).toEqual(['t1', 't2', 't3', 't4', 't5']);
    });

    it('preserves mass data', () => {
      const serialized = serializer.serialize(originalScene);
      const rt = parser.parse(serialized);
      for (let i = 0; i < originalScene.bodies.length; i++) {
        expect(rt.bodies[i].massDataMass).toBeCloseTo(originalScene.bodies[i].massDataMass, 5);
        expect(rt.bodies[i].massDataI).toBeCloseTo(originalScene.bodies[i].massDataI, 5);
      }
    });

    it('preserves fixture density and friction', () => {
      const serialized = serializer.serialize(originalScene);
      const rt = parser.parse(serialized);
      for (let i = 0; i < originalScene.bodies.length; i++) {
        for (let j = 0; j < originalScene.bodies[i].fixtures.length; j++) {
          expect(rt.bodies[i].fixtures[j].density).toBe(originalScene.bodies[i].fixtures[j].density);
          expect(rt.bodies[i].fixtures[j].friction).toBe(originalScene.bodies[i].fixtures[j].friction);
        }
      }
    });
  });

  describe('compact format conventions', () => {
    it('omits false boolean values', () => {
      const scene = createRubeScene({
        gravity: createVec2(0, -10),
        bodies: [createRubeBody({
          name: 'test',
          bullet: false,
          fixedRotation: false,
          awake: false,
          active: true,
          allowSleep: true,
          fixtures: [],
        })],
      });
      const json = serializer.serialize(scene);
      const data = JSON.parse(json);
      const body = data.body[0];
      expect(body.bullet).toBeUndefined();
      expect(body.fixedRotation).toBeUndefined();
    });

    it('omits zero number values', () => {
      const scene = createRubeScene({
        gravity: createVec2(0, -10),
        bodies: [createRubeBody({
          angle: 0,
          angularVelocity: 0,
          linearDamping: 0,
          angularDamping: 0,
          fixtures: [],
        })],
      });
      const json = serializer.serialize(scene);
      const data = JSON.parse(json);
      const body = data.body[0];
      expect(body.angle).toBeUndefined();
      expect(body.angularVelocity).toBeUndefined();
      expect(body.linearDamping).toBeUndefined();
      expect(body.angularDamping).toBeUndefined();
    });

    it('serializes zero vectors as numeric 0', () => {
      const scene = createRubeScene({
        gravity: createVec2(0, 0),
        bodies: [createRubeBody({
          position: createVec2(0, 0),
          linearVelocity: createVec2(0, 0),
          fixtures: [],
        })],
      });
      const json = serializer.serialize(scene);
      const data = JSON.parse(json);
      expect(data.gravity).toBe(0);
      expect(data.body[0].position).toBe(0);
      expect(data.body[0].linearVelocity).toBe(0);
    });

    it('includes non-zero values', () => {
      const scene = createRubeScene({
        gravity: createVec2(0, -10),
        bodies: [createRubeBody({
          angle: 1.5,
          angularDamping: 0.3,
          bullet: true,
          position: createVec2(2.0, 3.0),
          fixtures: [],
        })],
      });
      const json = serializer.serialize(scene);
      const data = JSON.parse(json);
      const body = data.body[0];
      expect(body.angle).toBe(1.5);
      expect(body.angularDamping).toBe(0.3);
      expect(body.bullet).toBe(true);
      expect(body.position).toEqual({ x: 2.0, y: 3.0 });
    });

    it('omits static body type (type 0)', () => {
      const scene = createRubeScene({
        gravity: createVec2(0, -10),
        bodies: [createRubeBody({
          bodyType: BodyType.STATIC,
          fixtures: [],
        })],
      });
      const json = serializer.serialize(scene);
      const data = JSON.parse(json);
      expect(data.body[0].type).toBeUndefined();
    });

    it('includes dynamic body type (type 2)', () => {
      const scene = createRubeScene({
        gravity: createVec2(0, -10),
        bodies: [createRubeBody({
          bodyType: BodyType.DYNAMIC,
          fixtures: [],
        })],
      });
      const json = serializer.serialize(scene);
      const data = JSON.parse(json);
      expect(data.body[0].type).toBe(2);
    });

    it('omits default gravityScale (1.0)', () => {
      const scene = createRubeScene({
        gravity: createVec2(0, -10),
        bodies: [createRubeBody({
          gravityScale: 1.0,
          fixtures: [],
        })],
      });
      const json = serializer.serialize(scene);
      const data = JSON.parse(json);
      expect(data.body[0].gravityScale).toBeUndefined();
    });
  });

  describe('custom properties serialization', () => {
    it('serializes string custom properties in standard RUBE format', () => {
      const props = serializer._serializeCustomProperties({ VM: 'b2' });
      expect(props).toEqual([{ name: 'VM', string: 'b2' }]);
    });

    it('serializes integer custom properties', () => {
      const props = serializer._serializeCustomProperties({ count: 5 });
      expect(props).toEqual([{ name: 'count', int: 5 }]);
    });

    it('serializes float custom properties', () => {
      const props = serializer._serializeCustomProperties({ scale: 1.5 });
      expect(props).toEqual([{ name: 'scale', float: 1.5 }]);
    });

    it('serializes boolean custom properties', () => {
      const props = serializer._serializeCustomProperties({ enabled: true });
      expect(props).toEqual([{ name: 'enabled', bool: true }]);
    });
  });

  describe('vector serialization', () => {
    it('serializes zero vector as 0', () => {
      expect(serializer._serializeVector(createVec2(0, 0))).toBe(0);
    });

    it('serializes non-zero vector as object', () => {
      expect(serializer._serializeVector(createVec2(1.5, -2.3))).toEqual({ x: 1.5, y: -2.3 });
    });

    it('serializes null/undefined as 0', () => {
      expect(serializer._serializeVector(null)).toBe(0);
      expect(serializer._serializeVector(undefined)).toBe(0);
    });
  });
});
