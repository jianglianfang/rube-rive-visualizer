/**
 * Unit tests for RubeParser (JS)
 *
 * Tests with real RUBE JSON fixture watchface_vivo.json.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 12.5, 12.6, 12.7
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RubeParser } from '../rubeParser.js';
import { BodyType } from '../models.js';

describe('RubeParser unit tests', () => {
  const parser = new RubeParser();
  let scene;
  let jsonString;

  beforeAll(() => {
    const fixturePath = resolve(import.meta.dirname, '..', 'watchface_vivo.json');
    jsonString = readFileSync(fixturePath, 'utf-8');
    scene = parser.parse(jsonString);
  });

  describe('world properties', () => {
    it('parses gravity correctly', () => {
      expect(scene.gravity.x).toBe(0);
      expect(scene.gravity.y).toBe(-10);
    });

    it('parses allowSleep', () => {
      expect(scene.allowSleep).toBe(true);
    });

    it('parses continuousPhysics', () => {
      expect(scene.continuousPhysics).toBe(true);
    });

    it('parses world settings in customProperties', () => {
      expect(scene.customProperties.stepsPerSecond).toBe(60);
      expect(scene.customProperties.velocityIterations).toBe(8);
      expect(scene.customProperties.positionIterations).toBe(3);
    });

    it('preserves collisionbitplanes', () => {
      expect(scene.customProperties.collisionbitplanes).toBeDefined();
    });
  });

  describe('bodies', () => {
    it('parses 6 bodies total', () => {
      expect(scene.bodies.length).toBe(6);
    });

    it('has 5 dynamic bodies and 1 static body', () => {
      const dynamic = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      const staticBodies = scene.bodies.filter(b => b.bodyType === BodyType.STATIC);
      expect(dynamic.length).toBe(5);
      expect(staticBodies.length).toBe(1);
    });

    it('dynamic bodies have VM custom properties t1-t5', () => {
      const dynamic = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      const vmNames = dynamic.map(b => b.customProperties.VM).sort();
      expect(vmNames).toEqual(['t1', 't2', 't3', 't4', 't5']);
    });

    it('body indices are sequential', () => {
      scene.bodies.forEach((b, i) => {
        expect(b.index).toBe(i);
      });
    });
  });

  describe('fixtures', () => {
    it('dynamic bodies have polygon fixtures', () => {
      const dynamic = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      for (const body of dynamic) {
        expect(body.fixtures.length).toBeGreaterThan(0);
        for (const fixture of body.fixtures) {
          expect(fixture.shape.shapeType).toBe('polygon');
          expect(fixture.shape.vertices.length).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it('static body has chain fixture with 64+ vertices', () => {
      const staticBody = scene.bodies.find(b => b.bodyType === BodyType.STATIC);
      expect(staticBody).toBeDefined();
      const chainFixture = staticBody.fixtures.find(f => f.shape.shapeType === 'chain');
      expect(chainFixture).toBeDefined();
      expect(chainFixture.shape.chainVertices.length).toBeGreaterThanOrEqual(64);
    });

    it('polygon vertices have x and y coordinates', () => {
      const dynamic = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      const firstBody = dynamic[0];
      const firstFixture = firstBody.fixtures[0];
      for (const v of firstFixture.shape.vertices) {
        expect(typeof v.x).toBe('number');
        expect(typeof v.y).toBe('number');
      }
    });
  });

  describe('joints', () => {
    it('has no joints', () => {
      expect(scene.joints.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('throws on malformed JSON', () => {
      expect(() => parser.parse('not json')).toThrow();
    });

    it('throws on missing gravity field', () => {
      const data = { body: [] };
      expect(() => parser.parse(JSON.stringify(data))).toThrow(/gravity/);
    });

    it('throws on missing body field', () => {
      const data = { gravity: { x: 0, y: -10 } };
      expect(() => parser.parse(JSON.stringify(data))).toThrow(/body/);
    });

    it('throws listing all missing fields', () => {
      const data = { someOtherField: true };
      expect(() => parser.parse(JSON.stringify(data))).toThrow(/gravity.*body|body.*gravity/);
    });
  });

  describe('RUBE compact format', () => {
    it('handles 0 as zero vector', () => {
      const data = {
        gravity: 0,
        body: [{
          position: 0,
          linearVelocity: 0,
          fixture: [],
        }],
      };
      const s = parser.parse(JSON.stringify(data));
      expect(s.gravity).toEqual({ x: 0, y: 0 });
      expect(s.bodies[0].position).toEqual({ x: 0, y: 0 });
      expect(s.bodies[0].linearVelocity).toEqual({ x: 0, y: 0 });
    });

    it('missing booleans default to false', () => {
      const data = {
        gravity: { x: 0, y: -10 },
        body: [{ fixture: [] }],
      };
      const s = parser.parse(JSON.stringify(data));
      expect(s.bodies[0].bullet).toBe(false);
      expect(s.bodies[0].fixedRotation).toBe(false);
      expect(s.bodies[0].awake).toBe(false);
    });

    it('missing numbers default to 0', () => {
      const data = {
        gravity: { x: 0, y: -10 },
        body: [{ fixture: [] }],
      };
      const s = parser.parse(JSON.stringify(data));
      expect(s.bodies[0].angle).toBe(0);
      expect(s.bodies[0].angularVelocity).toBe(0);
      expect(s.bodies[0].linearDamping).toBe(0);
    });
  });

  describe('custom properties', () => {
    it('parses standard RUBE format', () => {
      const result = parser._parseCustomProperties([
        { name: 'VM', string: 'b2' },
        { name: 'count', int: 5 },
      ]);
      expect(result).toEqual({ VM: 'b2', count: 5 });
    });

    it('parses GSON format', () => {
      const result = parser._parseCustomProperties([
        { VM: 'b2' },
        { count: 5 },
      ]);
      expect(result).toEqual({ VM: 'b2', count: 5 });
    });

    it('handles empty/null input', () => {
      expect(parser._parseCustomProperties(null)).toEqual({});
      expect(parser._parseCustomProperties([])).toEqual({});
      expect(parser._parseCustomProperties(undefined)).toEqual({});
    });
  });
});
