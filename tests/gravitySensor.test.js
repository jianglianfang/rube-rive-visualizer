/**
 * Unit tests for GravitySensor.
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7
 *
 * @module gravitySensor.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GravitySensor } from '../src/gravitySensor.js';

describe('GravitySensor', () => {
  let sensor;
  let gravityCallback;

  beforeEach(() => {
    gravityCallback = vi.fn();
    sensor = new GravitySensor(gravityCallback);
  });

  describe('toggle()', () => {
    it('should enable when toggled from disabled', () => {
      expect(sensor.enabled).toBe(false);
      const result = sensor.toggle();
      expect(result).toBe(true);
      expect(sensor.enabled).toBe(true);
    });

    it('should disable when toggled from enabled', () => {
      sensor.toggle(); // enable
      const result = sensor.toggle(); // disable
      expect(result).toBe(false);
      expect(sensor.enabled).toBe(false);
    });

    it('should return the new enabled state', () => {
      expect(sensor.toggle()).toBe(true);
      expect(sensor.toggle()).toBe(false);
      expect(sensor.toggle()).toBe(true);
    });
  });

  describe('getGravityVector()', () => {
    it('should return downward gravity at angle 0', () => {
      const vec = sensor.getGravityVector();
      // At angle 0: gx = mag*sin(0) = 0, gy = -mag*cos(0) = -10
      expect(vec.x).toBeCloseTo(0, 5);
      expect(vec.y).toBeCloseTo(-10, 5);
    });

    it('should return vector with correct magnitude', () => {
      sensor.setMagnitude(15);
      const vec = sensor.getGravityVector();
      const mag = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
      expect(mag).toBeCloseTo(15, 2);
    });

    it('should preserve magnitude regardless of angle', () => {
      sensor.setMagnitude(10);
      sensor.toggle(); // enable

      // Set various angles and check magnitude
      const angles = [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2];
      for (const angle of angles) {
        // Directly set internal angle for testing
        sensor._currentAngle = angle;
        const vec = sensor.getGravityVector();
        const mag = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
        expect(mag).toBeCloseTo(10, 2);
      }
    });

    it('should respect custom magnitude', () => {
      sensor.setMagnitude(5);
      const vec = sensor.getGravityVector();
      const mag = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
      expect(mag).toBeCloseTo(5, 2);
    });
  });

  describe('auto-cycle mode', () => {
    it('should progress through angles after multiple updates', () => {
      sensor.toggle(); // enable
      sensor.setCycleInterval(100); // 100ms per direction

      const initialAngle = sensor.currentAngle;

      // Simulate enough time to advance to next direction
      // Each update with dt=0.2s = 200ms should trigger at least one cycle
      for (let i = 0; i < 20; i++) {
        sensor.update(0.2);
      }

      // After enough updates, the target angle should have changed
      // and the callback should have been called
      expect(gravityCallback).toHaveBeenCalled();
    });

    it('should call onGravityChange during update', () => {
      sensor.toggle();
      sensor.update(0.016); // one frame
      expect(gravityCallback).toHaveBeenCalled();
    });
  });

  describe('mouse direction', () => {
    it('should set target angle from mouse position', () => {
      sensor.toggle();
      // Mouse at (0, 1) → atan2(1, 0) = π/2
      // At angle π/2: gx = mag*sin(π/2) = 10, gy = -mag*cos(π/2) ≈ 0
      sensor.setMouseDirection(0, 1);

      // After enough interpolation, angle should reach π/2
      for (let i = 0; i < 100; i++) {
        sensor.update(0.05);
      }

      const vec = sensor.getGravityVector();
      // Gravity pointing right: gx > 0, gy ≈ 0
      expect(vec.x).toBeGreaterThan(5);
      expect(Math.abs(vec.y)).toBeLessThan(2);
    });

    it('should switch to mouse mode when setMouseDirection is called', () => {
      sensor.toggle();
      sensor.setMouseDirection(0, 1);
      expect(sensor._mode).toBe('mouse');
    });

    it('should ignore (0, 0) mouse position', () => {
      sensor.toggle();
      sensor.setMouseDirection(0, 0);
      expect(sensor._mode).toBe('auto'); // should stay in auto mode
    });
  });

  describe('smooth interpolation', () => {
    it('should not change angle abruptly', () => {
      sensor.toggle();
      sensor._currentAngle = 0;
      sensor._targetAngle = Math.PI; // 180 degrees away

      // One small step should not jump to target
      sensor.update(0.016);
      expect(Math.abs(sensor.currentAngle)).toBeLessThan(Math.PI);
      expect(sensor.currentAngle).not.toBeCloseTo(Math.PI, 1);
    });

    it('should eventually reach target angle', () => {
      sensor.toggle();
      sensor._targetAngle = Math.PI / 2;
      sensor._mode = 'mouse'; // prevent auto-cycle from changing target

      // Many small steps
      for (let i = 0; i < 200; i++) {
        sensor.update(0.016);
      }

      expect(sensor.currentAngle).toBeCloseTo(Math.PI / 2, 1);
    });
  });

  describe('restore()', () => {
    it('should restore original gravity and disable sensor', () => {
      sensor.toggle(); // enable
      sensor.update(0.1);

      sensor.restore(0, -9.81);

      expect(sensor.enabled).toBe(false);
      expect(gravityCallback).toHaveBeenCalledWith(0, -9.81);
    });

    it('should set angle from restored gravity vector', () => {
      sensor.restore(0, -10);
      // For (0, -10): angle = atan2(0, 10) = 0
      expect(sensor.currentAngle).toBeCloseTo(0, 2);
    });

    it('should handle non-standard gravity direction', () => {
      sensor.restore(10, 0);
      // For (10, 0): angle = atan2(10, 0) = π/2
      expect(sensor.currentAngle).toBeCloseTo(Math.PI / 2, 2);
    });
  });

  describe('setMagnitude', () => {
    it('should update the magnitude', () => {
      sensor.setMagnitude(20);
      const vec = sensor.getGravityVector();
      const mag = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
      expect(mag).toBeCloseTo(20, 2);
    });
  });

  describe('setCycleInterval', () => {
    it('should update the cycle interval', () => {
      sensor.setCycleInterval(500);
      expect(sensor._cycleInterval).toBe(500);
    });
  });

  describe('update when disabled', () => {
    it('should not call callback when disabled', () => {
      sensor.update(0.016);
      expect(gravityCallback).not.toHaveBeenCalled();
    });
  });
});
