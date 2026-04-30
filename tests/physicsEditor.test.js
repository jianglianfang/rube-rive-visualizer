/**
 * Unit tests for PhysicsEditor.
 *
 * Uses jsdom (available in vitest) for DOM testing.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 *
 * @module physicsEditor.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhysicsEditor } from '../src/physicsEditor.js';
import { createRubeScene, createRubeBody, BodyType, createVec2, createCollisionFilter } from '../src/models.js';

/**
 * Create a test scene with dynamic and static bodies.
 */
function createTestScene() {
  return createRubeScene({
    gravity: createVec2(0, -10),
    bodies: [
      createRubeBody({
        name: 'boundary',
        index: 0,
        bodyType: BodyType.STATIC,
        fixtures: [{
          name: 'chain',
          shape: { shapeType: 'chain', chainVertices: [] },
          density: 0, friction: 0.3, restitution: 0.2,
          sensor: false, filter: createCollisionFilter(),
          customProperties: {},
        }],
        customProperties: {},
      }),
      createRubeBody({
        name: 'body_t1',
        index: 1,
        bodyType: BodyType.DYNAMIC,
        fixtures: [{
          name: 'poly',
          shape: { shapeType: 'polygon', vertices: [] },
          density: 1.0, friction: 0.3, restitution: 0.2,
          sensor: false, filter: createCollisionFilter(),
          customProperties: {},
        }],
        customProperties: { VM: 't1' },
      }),
      createRubeBody({
        name: 'body_t2',
        index: 2,
        bodyType: BodyType.DYNAMIC,
        fixtures: [{
          name: 'poly',
          shape: { shapeType: 'polygon', vertices: [] },
          density: 2.0, friction: 0.5, restitution: 0.1,
          sensor: false, filter: createCollisionFilter(),
          customProperties: {},
        }],
        customProperties: { VM: 't2' },
      }),
    ],
  });
}

describe('PhysicsEditor', () => {
  let container;
  let onParamChange;
  let onGravityChange;
  let editor;

  beforeEach(() => {
    // Set up DOM
    container = document.createElement('div');
    container.id = 'test-editor-panel';
    document.body.innerHTML = '';
    document.body.appendChild(container);

    onParamChange = vi.fn();
    onGravityChange = vi.fn();
    editor = new PhysicsEditor('test-editor-panel', onParamChange, onGravityChange);
  });

  describe('_validateNumericInput', () => {
    it('should accept valid number within range', () => {
      const result = editor._validateNumericInput('5.5', 0, 10);
      expect(result.valid).toBe(true);
      expect(result.number).toBe(5.5);
    });

    it('should accept zero when in range', () => {
      const result = editor._validateNumericInput('0', -1, 1);
      expect(result.valid).toBe(true);
      expect(result.number).toBe(0);
    });

    it('should accept negative numbers when in range', () => {
      const result = editor._validateNumericInput('-5', -10, 10);
      expect(result.valid).toBe(true);
      expect(result.number).toBe(-5);
    });

    it('should reject non-numeric strings', () => {
      expect(editor._validateNumericInput('abc', 0, 10).valid).toBe(false);
      expect(editor._validateNumericInput('hello', 0, 10).valid).toBe(false);
      expect(editor._validateNumericInput('12abc', 0, 100).valid).toBe(false);
    });

    it('should reject NaN', () => {
      const result = editor._validateNumericInput('NaN', 0, 10);
      expect(result.valid).toBe(false);
      expect(result.number).toBeNull();
    });

    it('should reject Infinity', () => {
      expect(editor._validateNumericInput('Infinity', 0, 10).valid).toBe(false);
      expect(editor._validateNumericInput('-Infinity', -10, 10).valid).toBe(false);
    });

    it('should reject out-of-range values (too high)', () => {
      const result = editor._validateNumericInput('15', 0, 10);
      expect(result.valid).toBe(false);
    });

    it('should reject out-of-range values (too low)', () => {
      const result = editor._validateNumericInput('-5', 0, 10);
      expect(result.valid).toBe(false);
    });

    it('should accept boundary values', () => {
      expect(editor._validateNumericInput('0', 0, 10).valid).toBe(true);
      expect(editor._validateNumericInput('10', 0, 10).valid).toBe(true);
    });

    it('should reject empty string', () => {
      const result = editor._validateNumericInput('', 0, 10);
      expect(result.valid).toBe(false);
      expect(result.number).toBeNull();
    });

    it('should reject null', () => {
      const result = editor._validateNumericInput(null, 0, 10);
      expect(result.valid).toBe(false);
    });
  });

  describe('populate', () => {
    it('should create body list entries for dynamic bodies only', () => {
      const scene = createTestScene();
      editor.populate(scene);

      const items = container.querySelectorAll('.body-list-item');
      expect(items.length).toBe(2); // Only 2 dynamic bodies, not the static one
    });

    it('should display VM property names in body list', () => {
      const scene = createTestScene();
      editor.populate(scene);

      const items = container.querySelectorAll('.body-list-item');
      const names = Array.from(items).map(li => li.textContent);
      expect(names).toContain('t1');
      expect(names).toContain('t2');
    });

    it('should show "No scene loaded" when no scene', () => {
      editor._render();
      expect(container.textContent).toContain('No scene loaded');
    });

    it('should render gravity inputs', () => {
      const scene = createTestScene();
      editor.populate(scene);

      const gxInput = container.querySelector('#gravity-x');
      const gyInput = container.querySelector('#gravity-y');
      expect(gxInput).not.toBeNull();
      expect(gyInput).not.toBeNull();
      expect(gxInput.value).toBe('0');
      expect(gyInput.value).toBe('-10');
    });
  });

  describe('selectBody', () => {
    it('should highlight the selected body entry', () => {
      const scene = createTestScene();
      editor.populate(scene);
      editor.selectBody(1);

      const items = container.querySelectorAll('.body-list-item');
      const selected = container.querySelectorAll('.body-list-item.selected');
      expect(selected.length).toBe(1);
      expect(selected[0].dataset.bodyIndex).toBe('1');
    });

    it('should show parameter fields for selected body', () => {
      const scene = createTestScene();
      editor.populate(scene);
      editor.selectBody(1);

      const densityInput = container.querySelector('#param-density');
      expect(densityInput).not.toBeNull();
      expect(densityInput.value).toBe('1');
    });
  });

  describe('parameter change callback', () => {
    it('should fire onParamChange with correct arguments', () => {
      const scene = createTestScene();
      editor.populate(scene);
      editor.selectBody(1);

      const densityInput = container.querySelector('#param-density');
      expect(densityInput).not.toBeNull();

      // Simulate input change
      densityInput.value = '2.5';
      densityInput.dispatchEvent(new Event('change'));

      expect(onParamChange).toHaveBeenCalledWith(1, 'density', 2.5);
    });
  });

  describe('gravity change callback', () => {
    it('should fire onGravityChange with correct arguments', () => {
      const scene = createTestScene();
      editor.populate(scene);

      const gxInput = container.querySelector('#gravity-x');
      expect(gxInput).not.toBeNull();

      gxInput.value = '5';
      gxInput.dispatchEvent(new Event('change'));

      expect(onGravityChange).toHaveBeenCalledWith(5, -10);
    });
  });
});
