/**
 * Simulates watch-like gravity direction changes.
 * Supports auto-cycle mode (rotating through 8 compass directions) and
 * mouse-controlled mode (gravity points toward cursor).
 *
 * Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7
 *
 * @module gravitySensor
 */

/** 8 compass directions in radians (0 = down, π/4 = down-right, etc.) */
const COMPASS_ANGLES = [
  0,                    // Down (default gravity)
  Math.PI / 4,          // Down-Right
  Math.PI / 2,          // Right
  3 * Math.PI / 4,      // Up-Right
  Math.PI,              // Up
  -3 * Math.PI / 4,     // Up-Left
  -Math.PI / 2,         // Left
  -Math.PI / 4,         // Down-Left
];

/** Default interpolation speed (radians per second). */
const INTERPOLATION_SPEED = 4.0;

export class GravitySensor {
  /**
   * @param {Function} onGravityChange - Callback: (gx, gy) => void
   */
  constructor(onGravityChange) {
    /** @private */
    this._onGravityChange = onGravityChange || (() => {});
    /** @private */
    this._enabled = false;
    /** @private */
    this._currentAngle = 0; // radians, 0 = downward (-Y in world)
    /** @private */
    this._targetAngle = 0;
    /** @private */
    this._magnitude = 10; // m/s²
    /** @private */
    this._mode = 'auto'; // 'auto' | 'mouse'
    /** @private */
    this._cycleInterval = 2000; // ms
    /** @private */
    this._cycleTimer = 0; // accumulated time in ms
    /** @private */
    this._cycleIndex = 0;
    /** @private */
    this._originalGx = 0;
    /** @private */
    this._originalGy = -10;
  }

  /**
   * Enable/disable the gravity sensor.
   * @returns {boolean} New enabled state
   */
  toggle() {
    this._enabled = !this._enabled;
    if (this._enabled) {
      this._cycleTimer = 0;
      this._cycleIndex = 0;
      this._targetAngle = COMPASS_ANGLES[0];
      this._mode = 'auto';
    }
    return this._enabled;
  }

  /** @returns {boolean} */
  get enabled() {
    return this._enabled;
  }

  /**
   * Get the current gravity direction angle in radians.
   * @returns {number}
   */
  get currentAngle() {
    return this._currentAngle;
  }

  /**
   * Set the gravity magnitude (default 10 m/s²).
   * @param {number} magnitude
   */
  setMagnitude(magnitude) {
    this._magnitude = magnitude;
  }

  /**
   * Set the auto-cycle interval in milliseconds.
   * @param {number} intervalMs
   */
  setCycleInterval(intervalMs) {
    this._cycleInterval = intervalMs;
  }

  /**
   * Update from mouse position (manual control mode).
   * Gravity direction points from canvas center toward cursor.
   * @param {number} mouseX - relative to canvas center
   * @param {number} mouseY - relative to canvas center
   */
  setMouseDirection(mouseX, mouseY) {
    if (mouseX === 0 && mouseY === 0) return;
    this._mode = 'mouse';
    // atan2(y, x) gives angle from positive X axis
    // We use this directly as the gravity direction angle
    this._targetAngle = Math.atan2(mouseY, mouseX);
  }

  /**
   * Called each frame to interpolate gravity direction smoothly.
   * @param {number} deltaTime - seconds since last frame
   */
  update(deltaTime) {
    if (!this._enabled) return;

    // Auto-cycle mode: advance through compass directions
    if (this._mode === 'auto') {
      this._cycleTimer += deltaTime * 1000;
      if (this._cycleTimer >= this._cycleInterval) {
        this._cycleTimer -= this._cycleInterval;
        this._cycleIndex = (this._cycleIndex + 1) % COMPASS_ANGLES.length;
        this._targetAngle = COMPASS_ANGLES[this._cycleIndex];
      }
    }

    // Smooth interpolation toward target angle
    let diff = this._targetAngle - this._currentAngle;
    // Normalize to [-π, π]
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    const maxStep = INTERPOLATION_SPEED * deltaTime;
    if (Math.abs(diff) <= maxStep) {
      this._currentAngle = this._targetAngle;
    } else {
      this._currentAngle += Math.sign(diff) * maxStep;
    }

    // Normalize current angle to [-π, π]
    while (this._currentAngle > Math.PI) this._currentAngle -= 2 * Math.PI;
    while (this._currentAngle < -Math.PI) this._currentAngle += 2 * Math.PI;

    // Notify callback
    const vec = this.getGravityVector();
    this._onGravityChange(vec.x, vec.y);
  }

  /**
   * Get the current gravity vector.
   * For angle=0 (down), gravity is (0, -magnitude) in Box2D coords.
   * The angle rotates the gravity direction:
   *   gx = magnitude * sin(angle)
   *   gy = -magnitude * cos(angle)
   * @returns {import('./models.js').Vec2}
   */
  getGravityVector() {
    const gx = this._magnitude * Math.sin(this._currentAngle);
    const gy = -this._magnitude * Math.cos(this._currentAngle);
    return { x: gx, y: gy };
  }

  /**
   * Restore original gravity direction.
   * @param {number} gx - original gravity x
   * @param {number} gy - original gravity y
   */
  restore(gx, gy) {
    this._originalGx = gx;
    this._originalGy = gy;
    this._enabled = false;
    // Compute angle from gravity vector
    // gx = mag * sin(a), gy = -mag * cos(a)
    // a = atan2(gx, -gy)
    this._currentAngle = Math.atan2(gx, -gy);
    this._targetAngle = this._currentAngle;
    this._onGravityChange(gx, gy);
  }
}
