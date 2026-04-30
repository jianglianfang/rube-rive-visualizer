/**
 * Unit tests for GeneratorApp.
 *
 * Uses mock Rive runtime and mock box2d-wasm to test the generation pipeline.
 *
 * Requirements: 2.1, 2.5, 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3, 12.1, 12.2, 12.5, 12.6
 *
 * @module generatorApp.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeneratorApp } from '../src/generatorApp.js';
import { validateRivExtension } from '../src/riveAnalyzer.js';
import { createRubeScene, createRubeBody, BodyType, createVec2, createCollisionFilter } from '../src/models.js';

// =====================================================================
// Helper: create a mock File
// =====================================================================

function createMockFile(name, content = '') {
  const blob = new Blob([content], { type: 'application/octet-stream' });
  return new File([blob], name);
}

// =====================================================================
// GeneratorApp tests
// =====================================================================

describe('GeneratorApp', () => {
  let app;
  let canvas;

  beforeEach(() => {
    // Set up minimal DOM
    document.body.innerHTML = `
      <canvas id="gen-canvas" width="800" height="600"></canvas>
      <div id="generator-editor"></div>
      <div id="generator-status"></div>
      <div id="error-overlay" class="hidden">
        <p id="error-message"></p>
      </div>
    `;
    canvas = document.getElementById('gen-canvas');
    app = new GeneratorApp(canvas);

    // Clean up globals
    delete globalThis.rive;
    delete globalThis.initBox2D;
  });

  afterEach(() => {
    if (app._animFrameId) {
      cancelAnimationFrame(app._animFrameId);
    }
    delete globalThis.rive;
    delete globalThis.initBox2D;
  });

  describe('constructor', () => {
    it('should initialize with null scene', () => {
      expect(app.scene).toBeNull();
    });

    it('should initialize with empty bindings', () => {
      expect(app.bindings).toEqual([]);
    });

    it('should not be running initially', () => {
      expect(app.running).toBe(false);
    });
  });

  describe('loadRivFile', () => {
    it('should reject non-.riv files', async () => {
      const file = createMockFile('test.json');
      await expect(app.loadRivFile(file)).rejects.toThrow('Invalid file type');
    });

    it('should reject files with no extension', async () => {
      const file = createMockFile('testfile');
      await expect(app.loadRivFile(file)).rejects.toThrow('Invalid file type');
    });

    it('should accept .riv files (validates extension)', () => {
      expect(validateRivExtension('test.riv')).toBe(true);
      expect(validateRivExtension('test.RIV')).toBe(true);
    });

    it('should handle Rive runtime not available', async () => {
      delete globalThis.rive;
      const file = createMockFile('test.riv');
      await expect(app.loadRivFile(file)).rejects.toThrow();
    });

    it('should handle no ViewModel (INFO notice)', async () => {
      // Mock Rive runtime with no ViewModel
      globalThis.rive = {
        Rive: class MockRive {
          constructor(opts) {
            setTimeout(() => {
              this.bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
              this.viewModelByName = () => null;
              this.defaultViewModel = () => null;
              opts.onLoad();
            }, 0);
          }
        },
      };

      const file = createMockFile('test.riv');
      // Should not throw — just show info
      await app.loadRivFile(file);
      expect(app._infoMessage).toContain('No ViewModel');
    });
  });

  describe('exportJSON', () => {
    it('should return null/throw when no scene loaded', () => {
      expect(app.scene).toBeNull();
      app.exportJSON('test');
      // Should show error but not crash
    });

    it('should produce valid JSON when scene exists', () => {
      // Manually set a scene
      app.scene = createRubeScene({
        gravity: createVec2(0, -10),
        bodies: [
          createRubeBody({
            name: 'test',
            index: 0,
            bodyType: BodyType.DYNAMIC,
            fixtures: [{
              name: 'poly',
              shape: { shapeType: 'polygon', vertices: [
                { x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 },
                { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 },
              ]},
              density: 1.0, friction: 0.3, restitution: 0.2,
              sensor: false, filter: createCollisionFilter(),
              customProperties: {},
            }],
            customProperties: { VM: 't1' },
          }),
        ],
      });

      const json = app.exportJSON('test');
      expect(json).toBeDefined();
      expect(typeof json).toBe('string');

      // Should be valid JSON
      const parsed = JSON.parse(json);
      expect(parsed.body).toBeDefined();
      expect(parsed.body.length).toBe(1);
    });

    it('should use correct filename format', () => {
      app.scene = createRubeScene();
      app._rivFileName = 'myfile.riv';

      // Mock URL.createObjectURL for jsdom
      const origCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = vi.fn(() => 'blob:mock');
      URL.revokeObjectURL = vi.fn();

      // Mock createElement to capture download filename
      const mockAnchor = { click: vi.fn(), href: '', download: '' };
      const origCreate = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag === 'a') return mockAnchor;
        return origCreate(tag);
      });

      app.exportJSON();
      expect(mockAnchor.download).toBe('myfile_generated.json');

      vi.restoreAllMocks();
      URL.createObjectURL = origCreateObjectURL;
    });
  });

  describe('toggleGravitySensor', () => {
    it('should toggle gravity sensor state', async () => {
      // Initialize gravity sensor manually
      const { GravitySensor } = await import('../src/gravitySensor.js');
      app.gravitySensor = new GravitySensor(() => {});

      expect(app.gravitySensor.enabled).toBe(false);
      const result = app.toggleGravitySensor();
      expect(result).toBe(true);
      expect(app.gravitySensor.enabled).toBe(true);
    });

    it('should return false when no gravity sensor', () => {
      app.gravitySensor = null;
      expect(app.toggleGravitySensor()).toBe(false);
    });
  });

  describe('simulation controls', () => {
    it('should start simulation', () => {
      app.scene = createRubeScene();
      // Can't fully test without box2d, but verify state changes
      app.running = false;
      app.start();
      expect(app.running).toBe(true);
      expect(app.paused).toBe(false);
      // Clean up
      app.running = false;
      if (app._animFrameId) cancelAnimationFrame(app._animFrameId);
    });

    it('should toggle pause', () => {
      app.paused = false;
      app.pause();
      expect(app.paused).toBe(true);
      app.pause();
      expect(app.paused).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should set error message on serialization failure', () => {
      app.scene = createRubeScene();
      // Mock serializer to throw
      app.serializer.serialize = () => { throw new Error('serialize failed'); };

      expect(() => app.exportJSON('test')).toThrow('serialize failed');
      expect(app._errorMessage).toContain('Export failed');
    });
  });
});
