import { describe, it, expect } from 'vitest';
import {
  PIXEL_RATIO,
  RAD_TO_DEG,
  BodyType,
  createVec2,
  createCollisionFilter,
  createRubeBody,
  createRubeScene,
  createBodyState,
  createTransformData,
  createBindingRecord,
} from '../models.js';

describe('Constants', () => {
  it('PIXEL_RATIO should be 32.0', () => {
    expect(PIXEL_RATIO).toBe(32.0);
  });

  it('RAD_TO_DEG should be 180/π', () => {
    expect(RAD_TO_DEG).toBeCloseTo(180.0 / Math.PI, 10);
  });
});

describe('BodyType enum', () => {
  it('should have correct values', () => {
    expect(BodyType.STATIC).toBe(0);
    expect(BodyType.KINEMATIC).toBe(1);
    expect(BodyType.DYNAMIC).toBe(2);
  });

  it('should be frozen (immutable)', () => {
    expect(Object.isFrozen(BodyType)).toBe(true);
  });
});

describe('createVec2', () => {
  it('should create a zero vector by default', () => {
    const v = createVec2();
    expect(v).toEqual({ x: 0, y: 0 });
  });

  it('should create a vector with given values', () => {
    const v = createVec2(3.5, -2.1);
    expect(v.x).toBe(3.5);
    expect(v.y).toBe(-2.1);
  });
});

describe('createCollisionFilter', () => {
  it('should create default filter', () => {
    const f = createCollisionFilter();
    expect(f).toEqual({ categoryBits: 0x0001, maskBits: 0xFFFF, groupIndex: 0 });
  });

  it('should accept custom values', () => {
    const f = createCollisionFilter(0x0002, 0x00FF, -1);
    expect(f.categoryBits).toBe(0x0002);
    expect(f.maskBits).toBe(0x00FF);
    expect(f.groupIndex).toBe(-1);
  });
});

describe('createRubeBody', () => {
  it('should create a body with all defaults', () => {
    const body = createRubeBody();
    expect(body.name).toBe("");
    expect(body.index).toBe(0);
    expect(body.bodyType).toBe(BodyType.STATIC);
    expect(body.position).toEqual({ x: 0, y: 0 });
    expect(body.angle).toBe(0);
    expect(body.gravityScale).toBe(1);
    expect(body.allowSleep).toBe(true);
    expect(body.awake).toBe(false);
    expect(body.active).toBe(true);
    expect(body.bullet).toBe(false);
    expect(body.fixedRotation).toBe(false);
    expect(body.fixtures).toEqual([]);
    expect(body.customProperties).toEqual({});
  });

  it('should accept overrides', () => {
    const body = createRubeBody({ name: "test", bodyType: BodyType.DYNAMIC, angle: 1.5 });
    expect(body.name).toBe("test");
    expect(body.bodyType).toBe(BodyType.DYNAMIC);
    expect(body.angle).toBe(1.5);
  });
});

describe('createRubeScene', () => {
  it('should create a scene with all defaults', () => {
    const scene = createRubeScene();
    expect(scene.gravity).toEqual({ x: 0, y: -9.81 });
    expect(scene.allowSleep).toBe(true);
    expect(scene.autoClearForces).toBe(true);
    expect(scene.warmStarting).toBe(true);
    expect(scene.continuousPhysics).toBe(true);
    expect(scene.subStepping).toBe(false);
    expect(scene.bodies).toEqual([]);
    expect(scene.joints).toEqual([]);
    expect(scene.images).toEqual([]);
    expect(scene.customProperties).toEqual({});
  });

  it('should accept overrides', () => {
    const scene = createRubeScene({ gravity: createVec2(0, -10), allowSleep: false });
    expect(scene.gravity).toEqual({ x: 0, y: -10 });
    expect(scene.allowSleep).toBe(false);
  });
});

describe('createBodyState', () => {
  it('should create a default body state', () => {
    const state = createBodyState();
    expect(state.index).toBe(0);
    expect(state.name).toBe("");
    expect(state.x).toBe(0);
    expect(state.y).toBe(0);
    expect(state.angle).toBe(0);
    expect(state.linearVelocityX).toBe(0);
    expect(state.linearVelocityY).toBe(0);
    expect(state.angularVelocity).toBe(0);
    expect(state.mass).toBe(0);
    expect(state.inertia).toBe(0);
  });

  it('should accept overrides', () => {
    const state = createBodyState({ index: 3, name: "t1", x: 2.143, y: 2.075 });
    expect(state.index).toBe(3);
    expect(state.name).toBe("t1");
    expect(state.x).toBe(2.143);
    expect(state.y).toBe(2.075);
  });
});

describe('createTransformData', () => {
  it('should create default transform', () => {
    const t = createTransformData();
    expect(t).toEqual({ x: 0, y: 0, r: 0 });
  });

  it('should create transform with given values', () => {
    const t = createTransformData(68.576, -66.4, 45.0);
    expect(t.x).toBe(68.576);
    expect(t.y).toBe(-66.4);
    expect(t.r).toBe(45.0);
  });
});

describe('createBindingRecord', () => {
  it('should create default binding record', () => {
    const b = createBindingRecord();
    expect(b.bodyIndex).toBe(0);
    expect(b.bodyName).toBe("");
    expect(b.vmPropertyName).toBe("");
    expect(b.isActor).toBe(false);
    expect(b.actorName).toBeNull();
  });

  it('should accept overrides', () => {
    const b = createBindingRecord({
      bodyIndex: 2,
      bodyName: "ball",
      vmPropertyName: "t1",
      isActor: true,
      actorName: "a1",
    });
    expect(b.bodyIndex).toBe(2);
    expect(b.vmPropertyName).toBe("t1");
    expect(b.isActor).toBe(true);
    expect(b.actorName).toBe("a1");
  });
});
