/**
 * Debug Renderer — draws Box2D fixture shapes.
 *
 * Three display modes:
 *   'hidden'  — nothing shown
 *   'overlay' — semi-transparent shapes on overlay-canvas (on top of Rive)
 *   'side'    — shapes in debug-wrapper (right half, side-by-side with Rive)
 *
 * @module debugRenderer
 */

import { PIXEL_RATIO } from './models.js';

const COLORS = {
  static: 'rgba(100, 200, 100, 0.7)',
  dynamic: 'rgba(100, 150, 255, 0.7)',
  kinematic: 'rgba(255, 200, 100, 0.7)',
  selected: 'rgba(255, 255, 0, 0.9)',
};

const MODES = ['hidden', 'overlay', 'side'];
const MODE_LABELS = { hidden: '⬜ Debug Off', overlay: '🔲 Overlay', side: '◫ Side-by-Side' };

export class DebugRenderer {
  constructor() {
    this.overlayCanvas = document.getElementById('overlay-canvas');
    this.overlayCtx = this.overlayCanvas?.getContext('2d') ?? null;

    this.sideCanvas = document.getElementById('debug-canvas');
    this.sideCtx = this.sideCanvas?.getContext('2d') ?? null;

    this.debugWrapper = document.getElementById('debug-wrapper');

    this._mode = 'hidden';
    this._artboardCenterX = 0;
    this._artboardCenterY = 0;
  }

  get mode() { return this._mode; }
  get modeLabel() { return MODE_LABELS[this._mode]; }

  setArtboardCenter(cx, cy) {
    this._artboardCenterX = cx;
    this._artboardCenterY = cy;
  }

  cycleMode() {
    const idx = MODES.indexOf(this._mode);
    this._mode = MODES[(idx + 1) % MODES.length];
    this._sideBounds = null; // recalculate on next draw
    this._applyLayout();
    return this._mode;
  }

  _applyLayout() {
    // Overlay canvas
    if (this.overlayCanvas) {
      this.overlayCanvas.style.display = this._mode === 'overlay' ? 'block' : 'none';
    }
    // Side-by-side wrapper
    if (this.debugWrapper) {
      if (this._mode === 'side') {
        this.debugWrapper.classList.remove('debug-hidden');
      } else {
        this.debugWrapper.classList.add('debug-hidden');
      }
    }
    // Clear both when hidden
    if (this._mode === 'hidden') {
      if (this.overlayCtx && this.overlayCanvas) {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      }
      if (this.sideCtx && this.sideCanvas) {
        this.sideCtx.clearRect(0, 0, this.sideCanvas.width, this.sideCanvas.height);
      }
    }
  }

  _resizeCanvas(canvas) {
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }
  }

  /**
   * @param {object} scene
   * @param {object[]} bodyStates
   * @param {number} zoom - app zoom (used for overlay mode)
   * @param {number} panX - app panX (used for overlay mode)
   * @param {number} panY - app panY (used for overlay mode)
   * @param {number|null} selectedIndex
   * @param {HTMLCanvasElement} riveCanvas - for overlay alignment
   */
  draw(scene, bodyStates, zoom, panX, panY, selectedIndex, riveCanvas) {
    if (this._mode === 'hidden' || !scene) return;

    if (this._mode === 'overlay') {
      this._drawOverlay(scene, bodyStates, selectedIndex, riveCanvas);
    } else if (this._mode === 'side') {
      this._drawSide(scene, bodyStates, selectedIndex);
    }
  }

  /**
   * Overlay mode: draw debug shapes aligned with Rive artboard.
   * The overlay canvas covers the entire canvas-container.
   * We need to match Rive's Fit.contain + center alignment.
   */
  _drawOverlay(scene, bodyStates, selectedIndex, riveCanvas) {
    if (!this.overlayCtx || !this.overlayCanvas) return;
    this._resizeCanvas(this.overlayCanvas);

    const ctx = this.overlayCtx;
    const cw = this.overlayCanvas.width;
    const ch = this.overlayCanvas.height;
    ctx.clearRect(0, 0, cw, ch);

    if (!riveCanvas) return;

    // Rive renders with Fit.contain + center alignment.
    // We need to compute the same transform to align debug shapes.
    // Rive artboard is centered in the canvas with uniform scale.
    const abW = this._artboardCenterX * 2; // artboard width
    const abH = this._artboardCenterY * 2; // artboard height

    if (abW <= 0 || abH <= 0) return;

    // Compute Fit.contain scale and offset (same as Rive does internally)
    const riveW = riveCanvas.clientWidth;
    const riveH = riveCanvas.clientHeight;
    const riveLeft = riveCanvas.offsetLeft;
    const riveTop = riveCanvas.offsetTop;

    const scaleX = riveW / abW;
    const scaleY = riveH / abH;
    const fitScale = Math.min(scaleX, scaleY);

    const renderedW = abW * fitScale;
    const renderedH = abH * fitScale;
    const offsetX = riveLeft + (riveW - renderedW) / 2;
    const offsetY = riveTop + (riveH - renderedH) / 2;

    // Now draw bodies: Box2D pos → artboard coords → screen coords
    const stateMap = new Map();
    for (const s of bodyStates) stateMap.set(s.index, s);

    for (const body of scene.bodies) {
      const state = stateMap.get(body.index);
      if (!state) continue;

      const color = this._colorForBody(body, selectedIndex);

      // Box2D → artboard coords (same as convertTransform)
      const abX = state.x * PIXEL_RATIO + this._artboardCenterX;
      const abY = -state.y * PIXEL_RATIO + this._artboardCenterY;

      // Artboard → screen
      const sx = offsetX + abX * fitScale;
      const sy = offsetY + abY * fitScale;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-state.angle);
      ctx.scale(fitScale * PIXEL_RATIO, -fitScale * PIXEL_RATIO);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / (fitScale * PIXEL_RATIO);
      this._drawFixtures(ctx, body);

      ctx.fillStyle = color;
      const ms = 3 / (fitScale * PIXEL_RATIO);
      ctx.fillRect(-ms / 2, -ms / 2, ms, ms);
      ctx.restore();

      this._drawLabel(ctx, body, sx, sy, color, fitScale);
    }
  }

  /**
   * Side-by-side mode: draw in the debug-canvas with auto-fit.
   * Uses a fixed viewport based on the first frame's bounding box.
   */
  _drawSide(scene, bodyStates, selectedIndex) {
    if (!this.sideCtx || !this.sideCanvas) return;
    this._resizeCanvas(this.sideCanvas);

    const ctx = this.sideCtx;
    const cw = this.sideCanvas.width;
    const ch = this.sideCanvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const stateMap = new Map();
    for (const s of bodyStates) stateMap.set(s.index, s);

    // Compute bounding box only once (first frame), then reuse
    if (!this._sideBounds) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const body of scene.bodies) {
        const s = stateMap.get(body.index);
        if (!s) continue;
        // Use fixture vertices for accurate bounds
        for (const fixture of body.fixtures) {
          const shape = fixture.shape;
          if (!shape) continue;
          const verts = shape.vertices || shape.chainVertices || [];
          for (const v of verts) {
            // Transform local vertex to world (approximate: ignore rotation for bounds)
            const wx = s.x + v.x;
            const wy = s.y + v.y;
            minX = Math.min(minX, wx);
            maxX = Math.max(maxX, wx);
            minY = Math.min(minY, wy);
            maxY = Math.max(maxY, wy);
          }
          if (shape.shapeType === 'circle') {
            const r = shape.radius || 0.1;
            const cx = s.x + (shape.center?.x ?? 0);
            const cy = s.y + (shape.center?.y ?? 0);
            minX = Math.min(minX, cx - r);
            maxX = Math.max(maxX, cx + r);
            minY = Math.min(minY, cy - r);
            maxY = Math.max(maxY, cy + r);
          }
        }
        // Fallback: at least include body position
        minX = Math.min(minX, s.x);
        maxX = Math.max(maxX, s.x);
        minY = Math.min(minY, s.y);
        maxY = Math.max(maxY, s.y);
      }
      if (!isFinite(minX)) return;
      this._sideBounds = { minX, maxX, minY, maxY };
    }

    const { minX, maxX, minY, maxY } = this._sideBounds;
    const margin = 1; // meters of padding
    const rangeX = maxX - minX + margin * 2;
    const rangeY = maxY - minY + margin * 2;
    const fitZoom = Math.min(
      (cw - 20) / (rangeX * PIXEL_RATIO),
      (ch - 30) / (rangeY * PIXEL_RATIO),
      1.5
    ) * 0.85; // 85% fill to leave visual margin
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const fitPanX = cw / 2 - centerX * PIXEL_RATIO * fitZoom;
    // by = -state.y * PR * zoom + fitPanY
    // We want centerY (Box2D) to map to ch/2 (screen):
    //   ch/2 = -centerY * PR * zoom + fitPanY
    const fitPanY = ch / 2 + centerY * PIXEL_RATIO * fitZoom;

    // Draw crosshair at physics origin (0,0) for reference
    const originX = 0 * PIXEL_RATIO * fitZoom + fitPanX;
    const originY = -0 * PIXEL_RATIO * fitZoom + fitPanY;
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(originX - 15, originY);
    ctx.lineTo(originX + 15, originY);
    ctx.moveTo(originX, originY - 15);
    ctx.lineTo(originX, originY + 15);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '10px monospace';
    ctx.fillText('(0,0)', originX + 3, originY - 3);

    for (const body of scene.bodies) {
      const state = stateMap.get(body.index);
      if (!state) continue;

      const color = this._colorForBody(body, selectedIndex);
      const bx = state.x * PIXEL_RATIO * fitZoom + fitPanX;
      const by = -state.y * PIXEL_RATIO * fitZoom + fitPanY;

      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(-state.angle);
      ctx.scale(fitZoom * PIXEL_RATIO, -fitZoom * PIXEL_RATIO);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 / (fitZoom * PIXEL_RATIO);
      this._drawFixtures(ctx, body);

      ctx.fillStyle = color;
      const ms = 3 / (fitZoom * PIXEL_RATIO);
      ctx.fillRect(-ms / 2, -ms / 2, ms, ms);
      ctx.restore();

      this._drawLabel(ctx, body, bx, by, color, fitZoom);
    }
  }

  _colorForBody(body, selectedIndex) {
    if (body.index === selectedIndex) return COLORS.selected;
    if (body.bodyType === 0) return COLORS.static;
    if (body.bodyType === 2) return COLORS.dynamic;
    return COLORS.kinematic;
  }

  _drawFixtures(ctx, body) {
    for (const fixture of body.fixtures) {
      const shape = fixture.shape;
      if (!shape) continue;

      if (shape.shapeType === 'polygon' && shape.vertices?.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(shape.vertices[0].x, shape.vertices[0].y);
        for (let i = 1; i < shape.vertices.length; i++) {
          ctx.lineTo(shape.vertices[i].x, shape.vertices[i].y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      if (shape.shapeType === 'chain' && shape.chainVertices?.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(shape.chainVertices[0].x, shape.chainVertices[0].y);
        for (let i = 1; i < shape.chainVertices.length; i++) {
          ctx.lineTo(shape.chainVertices[i].x, shape.chainVertices[i].y);
        }
        ctx.stroke();
      }
      if (shape.shapeType === 'circle') {
        const cx = shape.center?.x ?? 0;
        const cy = shape.center?.y ?? 0;
        ctx.beginPath();
        ctx.arc(cx, cy, shape.radius || 0.1, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (shape.shapeType === 'edge') {
        ctx.beginPath();
        ctx.moveTo(shape.vertex1.x, shape.vertex1.y);
        ctx.lineTo(shape.vertex2.x, shape.vertex2.y);
        ctx.stroke();
      }
    }
  }

  _drawLabel(ctx, body, bx, by, color, zoom) {
    const vmName = body.customProperties?.VM;
    if (vmName) {
      ctx.save();
      ctx.font = `${Math.max(10, 11 * zoom)}px monospace`;
      ctx.fillStyle = color;
      ctx.fillText(vmName, bx + 4, by - 4);
      ctx.restore();
    }
  }
}
