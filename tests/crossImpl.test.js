/**
 * Cross-implementation consistency test.
 *
 * Parses watchface_vivo.json with the JS parser and compares the resulting
 * scene structure against known values (the same values the Python parser
 * produces). Verifies both parsers extract identical body counts, positions,
 * angles, fixture data, and custom properties.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BodyType } from '../models.js';
import { RubeParser } from '../rubeParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dirname, '..', 'watchface_vivo.json');

/**
 * Known values from the Python parser output for watchface_vivo.json.
 * These serve as the cross-implementation reference.
 */
const KNOWN = {
  bodyCount: 6,
  dynamicCount: 5,
  staticCount: 1,
  gravity: { x: 0, y: -10 },
  allowSleep: true,
  continuousPhysics: true,
  warmStarting: true,
  autoClearForces: true,
  subStepping: false,
  stepsPerSecond: 60,
  velocityIterations: 8,
  positionIterations: 3,
  jointCount: 0,
  bodies: [
    { index: 0, name: '', bodyType: BodyType.DYNAMIC, posX: 2.142999887466431, posY: 2.075180053710938, angle: 0, vm: 't1', fixtureCount: 8 },
    { index: 1, name: '', bodyType: BodyType.DYNAMIC, posX: -1.557430028915405, posY: -0.5741369724273682, angle: 0, vm: 't5', fixtureCount: 9 },
    { index: 2, name: '', bodyType: BodyType.DYNAMIC, posX: 2.650670051574707, posY: -1.143790006637573, angle: -0.2617990076541901, vm: 't2', fixtureCount: 10 },
    { index: 3, name: '', bodyType: BodyType.DYNAMIC, posX: -4.151470184326172, posY: -2.093940019607544, angle: 0, vm: 't4', fixtureCount: 11 },
    { index: 4, name: '', bodyType: BodyType.DYNAMIC, posX: 0.8019279837608337, posY: -4.35929012298584, angle: 0.3490659892559052, vm: 't3', fixtureCount: 7 },
    { index: 5, name: '', bodyType: BodyType.STATIC, posX: 0, posY: 0, angle: 0, vm: null, fixtureCount: 1 },
  ],
};

let scene;

beforeAll(() => {
  const jsonText = readFileSync(FIXTURE_PATH, 'utf-8');
  const parser = new RubeParser();
  scene = parser.parse(jsonText);
});

describe('Cross-implementation consistency: body count and types', () => {
  it('total body count matches Python parser', () => {
    expect(scene.bodies.length).toBe(KNOWN.bodyCount);
  });

  it('dynamic body count matches', () => {
    const dynamicBodies = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
    expect(dynamicBodies.length).toBe(KNOWN.dynamicCount);
  });

  it('static body count matches', () => {
    const staticBodies = scene.bodies.filter(b => b.bodyType === BodyType.STATIC);
    expect(staticBodies.length).toBe(KNOWN.staticCount);
  });
});

describe('Cross-implementation consistency: world properties', () => {
  it('gravity matches', () => {
    expect(scene.gravity.x).toBe(KNOWN.gravity.x);
    expect(scene.gravity.y).toBe(KNOWN.gravity.y);
  });

  it('allowSleep matches', () => {
    expect(scene.allowSleep).toBe(KNOWN.allowSleep);
  });

  it('continuousPhysics matches', () => {
    expect(scene.continuousPhysics).toBe(KNOWN.continuousPhysics);
  });

  it('warmStarting matches', () => {
    expect(scene.warmStarting).toBe(KNOWN.warmStarting);
  });

  it('autoClearForces matches', () => {
    expect(scene.autoClearForces).toBe(KNOWN.autoClearForces);
  });

  it('subStepping matches', () => {
    expect(scene.subStepping).toBe(KNOWN.subStepping);
  });

  it('stepsPerSecond matches', () => {
    expect(scene.customProperties.stepsPerSecond).toBe(KNOWN.stepsPerSecond);
  });

  it('velocityIterations matches', () => {
    expect(scene.customProperties.velocityIterations).toBe(KNOWN.velocityIterations);
  });

  it('positionIterations matches', () => {
    expect(scene.customProperties.positionIterations).toBe(KNOWN.positionIterations);
  });
});

describe('Cross-implementation consistency: joints', () => {
  it('joint count matches (empty)', () => {
    expect(scene.joints.length).toBe(KNOWN.jointCount);
  });
});

describe('Cross-implementation consistency: body positions and angles', () => {
  for (const known of KNOWN.bodies) {
    it(`body[${known.index}] position matches Python parser`, () => {
      const body = scene.bodies[known.index];
      expect(body.position.x).toBeCloseTo(known.posX, 6);
      expect(body.position.y).toBeCloseTo(known.posY, 6);
    });

    it(`body[${known.index}] angle matches Python parser`, () => {
      const body = scene.bodies[known.index];
      expect(body.angle).toBeCloseTo(known.angle, 6);
    });

    it(`body[${known.index}] bodyType matches Python parser`, () => {
      const body = scene.bodies[known.index];
      expect(body.bodyType).toBe(known.bodyType);
    });
  }
});

describe('Cross-implementation consistency: fixture counts', () => {
  for (const known of KNOWN.bodies) {
    it(`body[${known.index}] has ${known.fixtureCount} fixture(s)`, () => {
      const body = scene.bodies[known.index];
      expect(body.fixtures.length).toBe(known.fixtureCount);
    });
  }
});

describe('Cross-implementation consistency: custom properties (VM)', () => {
  for (const known of KNOWN.bodies) {
    if (known.vm !== null) {
      it(`body[${known.index}] has VM="${known.vm}"`, () => {
        const body = scene.bodies[known.index];
        expect(body.customProperties).toHaveProperty('VM');
        expect(body.customProperties.VM).toBe(known.vm);
      });
    } else {
      it(`body[${known.index}] has no VM property`, () => {
        const body = scene.bodies[known.index];
        expect(body.customProperties).not.toHaveProperty('VM');
      });
    }
  }
});

describe('Cross-implementation consistency: chain fixture on static body', () => {
  it('static body (index 5) has a chain fixture with 64+ vertices', () => {
    const body = scene.bodies[5];
    expect(body.fixtures.length).toBe(1);
    const fixture = body.fixtures[0];
    expect(fixture.shape.shapeType).toBe('chain');
    expect(fixture.shape.chainVertices.length).toBeGreaterThanOrEqual(64);
  });

  it('chain fixture has hasPrevVertex and hasNextVertex flags set', () => {
    const fixture = scene.bodies[5].fixtures[0];
    expect(fixture.shape.hasPrevVertex).toBe(true);
    expect(fixture.shape.hasNextVertex).toBe(true);
  });
});

describe('Cross-implementation consistency: polygon fixtures on dynamic bodies', () => {
  it('body[0] (t1) has polygon fixtures', () => {
    const body = scene.bodies[0];
    for (const fixture of body.fixtures) {
      expect(fixture.shape.shapeType).toBe('polygon');
      expect(fixture.shape.vertices.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('all dynamic body fixtures have density=1 and friction=0.2', () => {
    for (let i = 0; i < 5; i++) {
      const body = scene.bodies[i];
      for (const fixture of body.fixtures) {
        expect(fixture.density).toBe(1);
        expect(fixture.friction).toBeCloseTo(0.2, 6);
      }
    }
  });
});
