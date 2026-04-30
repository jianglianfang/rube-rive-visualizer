/**
 * Unit tests for RubeSceneGenerator
 *
 * Tests coordinate conversion, scene generation, parameter updates,
 * and compatibility with existing RubeSerializer.
 *
 * Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7,
 *               8.3, 8.5, 11.1, 11.2, 11.3, 11.4
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RubeSceneGenerator } from '../src/rubeSceneGenerator.js';
import { ConvexDecomposer } from '../src/convexDecomposer.js';
import { RubeSerializer } from '../src/rubeSerializer.js';
import { RubeParser } from '../src/rubeParser.js';
import { MVVMBinder } from '../src/mvvmBinder.js';
import {
  PIXEL_RATIO,
  BodyType,
  createVec2,
  createBoundComponent,
  createAnalysisResult,
} from '../src/models.js';

describe('RubeSceneGenerator', () => {
  let decomposer;
  let generator;

  beforeEach(() => {
    decomposer = new ConvexDecomposer();
    generator = new RubeSceneGenerator(decomposer);
  });

  // ─── artboardToWorld ───────────────────────────────────────────────

  describe('artboardToWorld()', () => {
    it('converts artboard center to world origin', () => {
      const w = 640, h = 480;
      const result = generator.artboardToWorld(w / 2, h / 2, w, h);
      expect(result.x).toBeCloseTo(0, 5);
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('converts artboard top-left corner (0,0) to expected world position', () => {
      const w = 640, h = 480;
      // world_x = (0 - 320) / 32 = -10
      // world_y = -(0 - 240) / 32 = 7.5
      const result = generator.artboardToWorld(0, 0, w, h);
      expect(result.x).toBeCloseTo(-10, 5);
      expect(result.y).toBeCloseTo(7.5, 5);
    });

    it('converts artboard top-right corner to expected world position', () => {
      const w = 640, h = 480;
      // world_x = (640 - 320) / 32 = 10
      // world_y = -(0 - 240) / 32 = 7.5
      const result = generator.artboardToWorld(w, 0, w, h);
      expect(result.x).toBeCloseTo(10, 5);
      expect(result.y).toBeCloseTo(7.5, 5);
    });

    it('converts artboard bottom-right corner to expected world position', () => {
      const w = 640, h = 480;
      // world_x = (640 - 320) / 32 = 10
      // world_y = -(480 - 240) / 32 = -7.5
      const result = generator.artboardToWorld(w, h, w, h);
      expect(result.x).toBeCloseTo(10, 5);
      expect(result.y).toBeCloseTo(-7.5, 5);
    });

    it('converts artboard bottom-left corner to expected world position', () => {
      const w = 640, h = 480;
      // world_x = (0 - 320) / 32 = -10
      // world_y = -(480 - 240) / 32 = -7.5
      const result = generator.artboardToWorld(0, h, w, h);
      expect(result.x).toBeCloseTo(-10, 5);
      expect(result.y).toBeCloseTo(-7.5, 5);
    });

    it('handles square artboard', () => {
      const s = 256;
      const result = generator.artboardToWorld(0, 0, s, s);
      // world_x = (0 - 128) / 32 = -4
      // world_y = -(0 - 128) / 32 = 4
      expect(result.x).toBeCloseTo(-4, 5);
      expect(result.y).toBeCloseTo(4, 5);
    });
  });

  // ─── artboardVerticesToLocal ────────────────────────────────────────

  describe('artboardVerticesToLocal()', () => {
    it('converts vertices relative to component center', () => {
      const center = createVec2(160, 120);
      const vertices = [
        createVec2(128, 88),   // (-32, -32) in artboard-relative
        createVec2(192, 88),   // (+32, -32)
        createVec2(192, 152),  // (+32, +32)
        createVec2(128, 152),  // (-32, +32)
      ];

      const local = generator.artboardVerticesToLocal(vertices, center);

      // local_x = (vx - cx) / 32, local_y = -(vy - cy) / 32
      expect(local[0].x).toBeCloseTo(-1, 5);  // (128-160)/32 = -1
      expect(local[0].y).toBeCloseTo(1, 5);   // -(88-120)/32 = 1
      expect(local[1].x).toBeCloseTo(1, 5);   // (192-160)/32 = 1
      expect(local[1].y).toBeCloseTo(1, 5);   // -(88-120)/32 = 1
      expect(local[2].x).toBeCloseTo(1, 5);   // (192-160)/32 = 1
      expect(local[2].y).toBeCloseTo(-1, 5);  // -(152-120)/32 = -1
      expect(local[3].x).toBeCloseTo(-1, 5);  // (128-160)/32 = -1
      expect(local[3].y).toBeCloseTo(-1, 5);  // -(152-120)/32 = -1
    });

    it('returns origin-centered vertices when vertex equals center', () => {
      const center = createVec2(100, 100);
      const vertices = [createVec2(100, 100)];
      const local = generator.artboardVerticesToLocal(vertices, center);
      expect(local[0].x).toBeCloseTo(0, 5);
      expect(local[0].y).toBeCloseTo(0, 5);
    });
  });

  // ─── generate() ────────────────────────────────────────────────────

  describe('generate()', () => {
    /** Helper: create a mock AnalysisResult with N rectangular BoundComponents. */
    function makeAnalysis(count, artboardWidth = 640, artboardHeight = 480) {
      const components = [];
      for (let i = 0; i < count; i++) {
        const cx = 100 + i * 100;
        const cy = 100 + i * 50;
        const hw = 32; // half-width in pixels
        const hh = 32; // half-height in pixels
        components.push(createBoundComponent({
          vmPropertyName: `t${i + 1}`,
          componentName: `comp${i + 1}`,
          center: createVec2(cx, cy),
          vertices: [
            createVec2(cx - hw, cy - hh),
            createVec2(cx + hw, cy - hh),
            createVec2(cx + hw, cy + hh),
            createVec2(cx - hw, cy + hh),
          ],
          width: hw * 2,
          height: hh * 2,
          isBoundingBox: true,
        }));
      }
      return createAnalysisResult({
        components,
        artboardWidth,
        artboardHeight,
        warnings: [],
      });
    }

    it('creates 2 dynamic bodies + 1 boundary body for 2 components', () => {
      const analysis = makeAnalysis(2);
      const scene = generator.generate(analysis);

      expect(scene.bodies.length).toBe(3);

      const dynamic = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      const staticBodies = scene.bodies.filter(b => b.bodyType === BodyType.STATIC);

      expect(dynamic.length).toBe(2);
      expect(staticBodies.length).toBe(1);
    });

    it('each dynamic body has "VM" CustomProperty matching vmPropertyName', () => {
      const analysis = makeAnalysis(2);
      const scene = generator.generate(analysis);

      const dynamic = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      expect(dynamic[0].customProperties.VM).toBe('t1');
      expect(dynamic[1].customProperties.VM).toBe('t2');
    });

    it('boundary body is static (type=0) with chain shape fixture', () => {
      const analysis = makeAnalysis(1);
      const scene = generator.generate(analysis);

      const boundary = scene.bodies.find(b => b.bodyType === BodyType.STATIC);
      expect(boundary).toBeDefined();
      expect(boundary.bodyType).toBe(BodyType.STATIC);
      expect(boundary.fixtures.length).toBeGreaterThanOrEqual(1);

      const chainFixture = boundary.fixtures.find(f => f.shape.shapeType === 'chain');
      expect(chainFixture).toBeDefined();
      expect(chainFixture.shape.chainVertices.length).toBeGreaterThanOrEqual(4);
    });

    it('boundary body has no "VM" CustomProperty', () => {
      const analysis = makeAnalysis(1);
      const scene = generator.generate(analysis);

      const boundary = scene.bodies.find(b => b.bodyType === BodyType.STATIC);
      expect(boundary.customProperties.VM).toBeUndefined();
    });

    it('dynamic bodies have default physics params: density=1.0, friction=0.3, restitution=0.2', () => {
      const analysis = makeAnalysis(1);
      const scene = generator.generate(analysis);

      const dynamic = scene.bodies.find(b => b.bodyType === BodyType.DYNAMIC);
      for (const fixture of dynamic.fixtures) {
        expect(fixture.density).toBe(1.0);
        expect(fixture.friction).toBeCloseTo(0.3, 5);
        expect(fixture.restitution).toBeCloseTo(0.2, 5);
      }
    });

    it('dynamic bodies have default gravityScale=1.0', () => {
      const analysis = makeAnalysis(1);
      const scene = generator.generate(analysis);

      const dynamic = scene.bodies.find(b => b.bodyType === BodyType.DYNAMIC);
      expect(dynamic.gravityScale).toBe(1.0);
    });

    it('default gravity is (0, -10)', () => {
      const analysis = makeAnalysis(1);
      const scene = generator.generate(analysis);

      expect(scene.gravity.x).toBe(0);
      expect(scene.gravity.y).toBe(-10);
    });

    it('each dynamic body has at least one polygon fixture', () => {
      const analysis = makeAnalysis(2);
      const scene = generator.generate(analysis);

      const dynamic = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
      for (const body of dynamic) {
        expect(body.fixtures.length).toBeGreaterThanOrEqual(1);
        for (const fixture of body.fixtures) {
          expect(fixture.shape.shapeType).toBe('polygon');
          expect(fixture.shape.vertices.length).toBeGreaterThanOrEqual(3);
          expect(fixture.shape.vertices.length).toBeLessThanOrEqual(8);
        }
      }
    });

    it('body indices are sequential starting from 0', () => {
      const analysis = makeAnalysis(3);
      const scene = generator.generate(analysis);

      for (let i = 0; i < scene.bodies.length; i++) {
        expect(scene.bodies[i].index).toBe(i);
      }
    });

    it('handles zero components (only boundary body)', () => {
      const analysis = makeAnalysis(0);
      const scene = generator.generate(analysis);

      expect(scene.bodies.length).toBe(1);
      expect(scene.bodies[0].bodyType).toBe(BodyType.STATIC);
    });
  });

  // ─── updateBodyParams ──────────────────────────────────────────────

  describe('updateBodyParams()', () => {
    it('updates density on the correct body', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            center: createVec2(100, 100),
            vertices: [
              createVec2(68, 68), createVec2(132, 68),
              createVec2(132, 132), createVec2(68, 132),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      generator.updateBodyParams(scene, 0, { density: 5.0 });

      const body = scene.bodies.find(b => b.index === 0);
      for (const fixture of body.fixtures) {
        expect(fixture.density).toBe(5.0);
      }
    });

    it('updates friction on the correct body', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            center: createVec2(100, 100),
            vertices: [
              createVec2(68, 68), createVec2(132, 68),
              createVec2(132, 132), createVec2(68, 132),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      generator.updateBodyParams(scene, 0, { friction: 0.8 });

      const body = scene.bodies.find(b => b.index === 0);
      for (const fixture of body.fixtures) {
        expect(fixture.friction).toBe(0.8);
      }
    });

    it('updates restitution on the correct body', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            center: createVec2(100, 100),
            vertices: [
              createVec2(68, 68), createVec2(132, 68),
              createVec2(132, 132), createVec2(68, 132),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      generator.updateBodyParams(scene, 0, { restitution: 0.9 });

      const body = scene.bodies.find(b => b.index === 0);
      for (const fixture of body.fixtures) {
        expect(fixture.restitution).toBe(0.9);
      }
    });

    it('updates gravityScale on the correct body', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            center: createVec2(100, 100),
            vertices: [
              createVec2(68, 68), createVec2(132, 68),
              createVec2(132, 132), createVec2(68, 132),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      generator.updateBodyParams(scene, 0, { gravityScale: 2.5 });

      const body = scene.bodies.find(b => b.index === 0);
      expect(body.gravityScale).toBe(2.5);
    });

    it('updates multiple params at once', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            center: createVec2(100, 100),
            vertices: [
              createVec2(68, 68), createVec2(132, 68),
              createVec2(132, 132), createVec2(68, 132),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      generator.updateBodyParams(scene, 0, {
        density: 3.0,
        friction: 0.5,
        restitution: 0.7,
        gravityScale: 0.5,
      });

      const body = scene.bodies.find(b => b.index === 0);
      expect(body.gravityScale).toBe(0.5);
      for (const fixture of body.fixtures) {
        expect(fixture.density).toBe(3.0);
        expect(fixture.friction).toBe(0.5);
        expect(fixture.restitution).toBe(0.7);
      }
    });

    it('does not affect other bodies', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            center: createVec2(100, 100),
            vertices: [
              createVec2(68, 68), createVec2(132, 68),
              createVec2(132, 132), createVec2(68, 132),
            ],
            width: 64, height: 64,
          }),
          createBoundComponent({
            vmPropertyName: 't2',
            center: createVec2(300, 200),
            vertices: [
              createVec2(268, 168), createVec2(332, 168),
              createVec2(332, 232), createVec2(268, 232),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      generator.updateBodyParams(scene, 0, { density: 99.0 });

      const body1 = scene.bodies.find(b => b.index === 1);
      for (const fixture of body1.fixtures) {
        expect(fixture.density).toBe(1.0); // unchanged default
      }
    });

    it('silently ignores invalid body index', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            center: createVec2(100, 100),
            vertices: [
              createVec2(68, 68), createVec2(132, 68),
              createVec2(132, 132), createVec2(68, 132),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      // Should not throw
      generator.updateBodyParams(scene, 999, { density: 5.0 });

      // Original body unchanged
      const body = scene.bodies.find(b => b.index === 0);
      for (const fixture of body.fixtures) {
        expect(fixture.density).toBe(1.0);
      }
    });
  });

  // ─── updateGravity ─────────────────────────────────────────────────

  describe('updateGravity()', () => {
    it('updates the scene gravity vector', () => {
      const analysis = createAnalysisResult({
        components: [],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      generator.updateGravity(scene, 5, -20);

      expect(scene.gravity.x).toBe(5);
      expect(scene.gravity.y).toBe(-20);
    });

    it('can set gravity to zero', () => {
      const analysis = createAnalysisResult({
        components: [],
        artboardWidth: 640,
        artboardHeight: 480,
      });
      const scene = generator.generate(analysis);

      generator.updateGravity(scene, 0, 0);

      expect(scene.gravity.x).toBe(0);
      expect(scene.gravity.y).toBe(0);
    });
  });

  // ─── Serialization compatibility ───────────────────────────────────

  describe('serialization compatibility', () => {
    it('generated scene can be serialized by RubeSerializer without error', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            componentName: 'comp1',
            center: createVec2(160, 120),
            vertices: [
              createVec2(128, 88), createVec2(192, 88),
              createVec2(192, 152), createVec2(128, 152),
            ],
            width: 64, height: 64,
          }),
          createBoundComponent({
            vmPropertyName: 't2',
            componentName: 'comp2',
            center: createVec2(320, 240),
            vertices: [
              createVec2(288, 208), createVec2(352, 208),
              createVec2(352, 272), createVec2(288, 272),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });

      const scene = generator.generate(analysis);
      const serializer = new RubeSerializer();

      // Should not throw
      const json = serializer.serialize(scene);
      expect(typeof json).toBe('string');
      expect(json.length).toBeGreaterThan(0);

      // Should be valid JSON
      const parsed = JSON.parse(json);
      expect(parsed).toBeDefined();
      expect(parsed.body).toBeDefined();
      expect(parsed.body.length).toBe(3);
    });

    it('generated scene survives serialize → parse → serialize round-trip', () => {
      const analysis = createAnalysisResult({
        components: [
          createBoundComponent({
            vmPropertyName: 't1',
            componentName: 'comp1',
            center: createVec2(160, 120),
            vertices: [
              createVec2(128, 88), createVec2(192, 88),
              createVec2(192, 152), createVec2(128, 152),
            ],
            width: 64, height: 64,
          }),
        ],
        artboardWidth: 640,
        artboardHeight: 480,
      });

      const scene = generator.generate(analysis);
      const serializer = new RubeSerializer();
      const parser = new RubeParser();

      const json1 = serializer.serialize(scene);
      const parsed = parser.parse(json1);
      const json2 = serializer.serialize(parsed);

      expect(json1).toBe(json2);
    });
  });

  // ─── Coordinate round-trip with MVVMBinder ─────────────────────────

  describe('coordinate round-trip with MVVMBinder', () => {
    it('artboardToWorld → MVVMBinder.convertTransform recovers original position', () => {
      const artboardWidth = 640;
      const artboardHeight = 480;
      const artboardX = 200;
      const artboardY = 150;

      // Artboard → World
      const worldPos = generator.artboardToWorld(artboardX, artboardY, artboardWidth, artboardHeight);

      // World → Artboard via MVVMBinder
      const binder = new MVVMBinder();
      binder.setArtboardCenter(artboardWidth / 2, artboardHeight / 2);
      const bodyState = { x: worldPos.x, y: worldPos.y, angle: 0 };
      const transform = binder.convertTransform(bodyState);

      expect(transform.x).toBeCloseTo(artboardX, 2);
      expect(transform.y).toBeCloseTo(artboardY, 2);
    });

    it('round-trip works for artboard center', () => {
      const w = 640, h = 480;
      const worldPos = generator.artboardToWorld(w / 2, h / 2, w, h);

      const binder = new MVVMBinder();
      binder.setArtboardCenter(w / 2, h / 2);
      const transform = binder.convertTransform({ x: worldPos.x, y: worldPos.y, angle: 0 });

      expect(transform.x).toBeCloseTo(w / 2, 2);
      expect(transform.y).toBeCloseTo(h / 2, 2);
    });

    it('round-trip works for artboard corners', () => {
      const w = 640, h = 480;
      const binder = new MVVMBinder();
      binder.setArtboardCenter(w / 2, h / 2);

      const corners = [
        { ax: 0, ay: 0 },
        { ax: w, ay: 0 },
        { ax: w, ay: h },
        { ax: 0, ay: h },
      ];

      for (const { ax, ay } of corners) {
        const worldPos = generator.artboardToWorld(ax, ay, w, h);
        const transform = binder.convertTransform({ x: worldPos.x, y: worldPos.y, angle: 0 });
        expect(transform.x).toBeCloseTo(ax, 2);
        expect(transform.y).toBeCloseTo(ay, 2);
      }
    });
  });
});
