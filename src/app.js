/**
 * RUBE-Rive Visualizer — Web App Controller
 *
 * Coordinates file loading, physics simulation, MVVM binding, and Rive rendering.
 * Pure static frontend — no backend required.
 *
 * Requirements: 5.1–5.4, 7.1–7.7, 10.1–10.6
 *
 * @module app
 */

import { RubeParser } from './rubeParser.js';
import { MVVMBinder } from './mvvmBinder.js';
import { PhysicsSimulator } from './physicsSimulator.js';
import { FileLoader } from './fileLoader.js';
import { DebugRenderer } from './debugRenderer.js';

/**
 * Main application controller.
 */
export class RubeRiveApp {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.rive = null;
    this.riveFile = null;
    this.worldVM = null;
    this.vmInstances = {};

    this.parser = new RubeParser();
    this.simulator = null;
    this.binder = new MVVMBinder();
    this.debugRenderer = new DebugRenderer();
    this.bindings = [];
    this.scene = null;

    this.running = false;
    this.paused = false;
    this.speed = 1.0;

    // View state
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    // Interaction state
    this.selectedBody = null;
    this.dragging = false;
    this.panning = false;
    this.lastMouseX = 0;
    this.lastMouseY = 0;

    // Performance tracking
    this._frameCount = 0;
    this._lastFpsTime = 0;
    this._fps = 0;
    this._animFrameId = null;
  }

  /**
   * Initialize: load box2d-wasm module.
   */
  async init() {
    try {
      this._updateStatus('Loading box2d-wasm...');
      // box2d-wasm loaded via CDN or local — expects global initBox2D or module
      if (typeof globalThis.initBox2D === 'function') {
        const box2D = await globalThis.initBox2D();
        this.simulator = new PhysicsSimulator(box2D);
        this._updateStatus('Ready — drop files to begin');
      } else {
        this._updateStatus('Ready (no physics engine — drop files to begin)');
        console.warn('box2d-wasm not available; physics simulation disabled.');
      }
    } catch (err) {
      this._showError(`Failed to load box2d-wasm: ${err.message}`);
    }
  }

  /**
   * Load a .json + .riv file pair.
   * @param {File} jsonFile
   * @param {File} rivFile
   */
  async loadFiles(jsonFile, rivFile) {
    try {
      this._updateStatus('Parsing RUBE JSON...');

      // 1. Parse RUBE JSON
      const jsonText = await jsonFile.text();
      this.scene = this.parser.parse(jsonText);

      // 2. Build Box2D world
      if (this.simulator) {
        this._updateStatus('Building physics world...');
        try {
          this.simulator.buildWorld(this.scene);
          console.info(`Box2D world built: ${this.scene.bodies.length} bodies`);
        } catch (physErr) {
          console.error('Box2D world build failed:', physErr);
          this._showWarning(`Physics engine error: ${physErr.message}. Rive animation will still render.`);
          this.simulator = null; // Disable physics, keep Rive rendering
        }
      }

      // 3. Load Rive file
      this._updateStatus('Loading Rive file...');
      const rivBuffer = await rivFile.arrayBuffer();
      await this._loadRive(rivBuffer);

      // 4. Build MVVM bindings
      this.bindings = this.binder.buildBindings(this.scene);
      console.info(`MVVM bindings: ${this.bindings.length}`, this.bindings.map(b => b.vmPropertyName));

      // 4.5 Set artboard center for coordinate conversion
      // Product code: translate(width/2, height/2) before scaling
      if (this.rive && this.rive.bounds) {
        const bounds = this.rive.bounds;
        const artboardW = bounds.maxX - bounds.minX;
        const artboardH = bounds.maxY - bounds.minY;
        this.binder.setArtboardCenter(artboardW / 2, artboardH / 2);
        console.info(`Artboard center: (${artboardW/2}, ${artboardH/2}), size: ${artboardW}x${artboardH}`);
      } else {
        // Fallback: use canvas size
        this.binder.setArtboardCenter(this.canvas.width / 2, this.canvas.height / 2);
        console.info(`Artboard center (fallback canvas): (${this.canvas.width/2}, ${this.canvas.height/2})`);
      }

      // 5. Wire VM instances — now that bindings are ready, connect each
      //    binding's VM property name to the corresponding nested ViewModel instance
      if (this._worldVMI) {
        this._setupVMInstances(this._worldVMI);
      }

      // 6. Validate bindings against Rive ViewModel
      if (this.worldVM) {
        const riveProps = this._enumerateVMProperties();
        console.info('Rive VM properties:', riveProps);
        const validation = this.binder.validateBindings(this.bindings, riveProps);
        if (validation.unmatched.length > 0) {
          this._showWarning(`Unmatched VM properties: ${validation.unmatched.join(', ')}`);
        }
        if (validation.unused.length > 0) {
          console.info('Unused Rive ViewModel properties:', validation.unused);
        }
      }

      // 6. Hide drop zone, start simulation
      const dropZone = document.getElementById('drop-zone');
      if (dropZone) dropZone.classList.add('hidden');

      this._updateStatus(`Loaded: ${this.scene.bodies.length} bodies, ${this.bindings.length} bindings`);

      // Draw initial debug shapes (before simulation starts)
      if (this.simulator) {
        const initialStates = this.simulator.step(0); // get initial state without advancing
        this._lastBodyStates = initialStates;
        this._drawDebug();

        // Log initial state BEFORE simulation starts
        const initTransforms = this.binder.computeAllTransforms(initialStates, this.bindings);
        for (const [name, t] of Object.entries(initTransforms)) {
          console.info(`[INITIAL] ${name}: x=${t.x.toFixed(2)}, y=${t.y.toFixed(2)}, r=${t.r.toFixed(4)}`);
        }
      }

      this.start();
    } catch (err) {
      console.error('[RubeRiveApp] Load failed:', err);
      this._showError(`Load failed: ${err.message}`);
    }
  }

  /**
   * Load Rive file and set up ViewModel.
   * @param {ArrayBuffer} buffer
   */
  async _loadRive(buffer) {
    const RiveLib = globalThis.rive;
    if (!RiveLib || !RiveLib.Rive) {
      console.warn('Rive runtime not available; rendering disabled.');
      this._updateStatus('Rive runtime not loaded — animation rendering disabled');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.rive = new RiveLib.Rive({
          buffer: buffer,
          canvas: this.canvas,
          autoplay: true,
          shouldDisableRiveListeners: false,  // Ensure Rive registers pointer event listeners
          onLoad: () => {
            // Start all state machines after load
            const smNames = this.rive.stateMachineNames;
            console.info('Rive state machines:', smNames);
            if (smNames && smNames.length > 0) {
              for (const name of smNames) {
                this.rive.play(name);
              }
              console.info('Started state machines:', smNames);
            }
            try {
              console.info('Rive file loaded successfully');

              // === Diagnostic: dump all ViewModels ===
              const vmCount = this.rive.viewModelCount ?? 0;
              console.info(`Rive ViewModels found: ${vmCount}`);
              for (let i = 0; i < vmCount; i++) {
                const vm = this.rive.viewModelByIndex(i);
                if (vm) {
                  const props = vm.properties ?? [];
                  console.info(`  VM[${i}]: properties =`, props.map(p => `${p.name}(${p.type})`));
                }
              }

              // === Diagnostic: dump artboard info ===
              console.info('Rive artboard names:', this.rive.animationNames);
              console.info('Rive state machine names:', this.rive.stateMachineNames);

              // === Diagnostic: dump state machine inputs ===
              try {
                const inputs = this.rive.stateMachineInputs(this.rive.stateMachineNames?.[0]);
                if (inputs) {
                  console.info('State machine inputs:', inputs.map(i => `${i.name}(${i.type})`));
                }
              } catch (e) { /* no state machine */ }

              // === Diagnostic: check for text runs (disabled — causes noise) ===

              // Try to get "world" ViewModel, or fall back to default
              if (typeof this.rive.viewModelByName === 'function') {
                this.worldVM = this.rive.viewModelByName('world');
              }
              if (!this.worldVM && typeof this.rive.defaultViewModel === 'function') {
                this.worldVM = this.rive.defaultViewModel();
                console.info('Using default ViewModel (no "world" found)');
              }

              if (this.worldVM) {
                console.info('World ViewModel found, properties:', 
                  (this.worldVM.properties ?? []).map(p => `${p.name}(${p.type})`));

                const vmi = this.worldVM.defaultInstance();
                this.rive.bindViewModelInstance(vmi);
                this._worldVMI = vmi;
                console.info('World ViewModel instance bound');
              } else {
                console.warn('No ViewModel found in .riv file — physics binding disabled');

                // Try autoBind approach
                if (this.rive.viewModelInstance) {
                  this._worldVMI = this.rive.viewModelInstance;
                  console.info('Using auto-bound ViewModel instance');
                }
              }

              resolve();
            } catch (e) {
              console.warn('ViewModel setup failed:', e.message, e);
              resolve();
            }
          },
          onLoadError: (err) => {
            reject(new Error(`Rive load error: ${err}`));
          },
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Set up VM instances — try multiple strategies to access transform properties.
   * @param {object} vmi - World ViewModel instance
   */
  _setupVMInstances(vmi) {
    this.vmInstances = {};
    this._worldVMI = vmi;
    if (!vmi) return;

    console.info('=== Setting up VM instances ===');

    for (const br of this.bindings) {
      const name = br.vmPropertyName; // e.g. "t1"

      // Strategy 1: nested ViewModel (transform is a sub-ViewModel with x, y, r)
      try {
        const nested = vmi.viewModel(name);
        if (nested) {
          // Verify it has number properties
          const testX = nested.number('x');
          if (testX) {
            this.vmInstances[name] = nested;
            console.info(`  ✓ ${name}: nested ViewModel (x=${testX.value})`);
            continue;
          }
        }
      } catch (e) { /* try next strategy */ }

      // Strategy 2: path-based number access (x/y/r are at "t1/x", "t1/y", "t1/r")
      try {
        const testX = vmi.number(`${name}/x`);
        if (testX) {
          // Create a proxy object that mimics nested ViewModel API
          this.vmInstances[name] = {
            number: (prop) => vmi.number(`${name}/${prop}`),
          };
          console.info(`  ✓ ${name}: path-based access (${name}/x = ${testX.value})`);
          continue;
        }
      } catch (e) { /* try next strategy */ }

      // Strategy 3: direct number properties (flat structure: t1_x, t1_y, t1_r)
      try {
        const testX = vmi.number(`${name}_x`);
        if (testX) {
          this.vmInstances[name] = {
            number: (prop) => vmi.number(`${name}_${prop}`),
          };
          console.info(`  ✓ ${name}: flat naming (${name}_x = ${testX.value})`);
          continue;
        }
      } catch (e) { /* try next strategy */ }

      console.warn(`  ✗ ${name}: no matching ViewModel property found`);
    }

    console.info(`VM instances set up: ${Object.keys(this.vmInstances).length} of ${this.bindings.length}`);
  }

  /**
   * Get list of ViewModel property names from Rive.
   * Uses the World ViewModel's property descriptors.
   * @returns {string[]}
   */
  _enumerateVMProperties() {
    if (!this.worldVM) return [];
    try {
      const props = this.worldVM.properties;
      if (Array.isArray(props)) {
        return props.map(p => p.name).filter(Boolean);
      }
    } catch (e) {
      console.warn('Could not enumerate VM properties:', e.message);
    }
    return [];
  }

  // ------------------------------------------------------------------
  // Simulation loop
  // ------------------------------------------------------------------

  start() {
    this.running = true;
    this.paused = false;
    this._lastFpsTime = performance.now();
    this._frameCount = 0;
    this._updatePlayButton();
    this._simulationLoop();
  }

  pause() {
    this.paused = !this.paused;
    this._updatePlayButton();
  }

  stepOnce() {
    if (!this.simulator || !this.scene) return;
    this.paused = true;
    this._updatePlayButton();

    const bodyStates = this.simulator.step(this.speed);
    this._applyTransforms(bodyStates);
    this._updateStatusBar();
    this._drawDebug();

    // NaN/Inf check
    const invalid = this.simulator.validateBodyStates();
    if (invalid.length > 0) {
      this._showWarning(`NaN/Inf detected in: ${invalid.join(', ')}`);
    }
  }

  reset() {
    if (!this.simulator || !this.scene) return;
    this.simulator.reset(this.scene);
    this.running = false;
    this.paused = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    this._updatePlayButton();
    this._updateStatusBar();
    this._updateStatus('Reset — press Play to start');
  }

  _simulationLoop() {
    if (!this.running) return;

    if (!this.paused && this.simulator) {
      const bodyStates = this.simulator.step(this.speed);
      this._applyTransforms(bodyStates);

      // NaN/Inf check every 60 frames
      if (this.simulator.stepCount % 60 === 0) {
        const invalid = this.simulator.validateBodyStates();
        if (invalid.length > 0) {
          this.paused = true;
          this._updatePlayButton();
          this._showWarning(`NaN/Inf detected in: ${invalid.join(', ')}`);
        }
      }
    }

    // FPS tracking
    this._frameCount++;
    const now = performance.now();
    if (now - this._lastFpsTime >= 1000) {
      this._fps = this._frameCount;
      this._frameCount = 0;
      this._lastFpsTime = now;
    }

    this._updateStatusBar();
    this._drawDebug();
    // Update info panel if a body is selected
    if (this._selectedBodyIndex !== null) {
      this._showBodyInfoFromScene(this._selectedBodyIndex);
    }
    this._animFrameId = requestAnimationFrame(() => this._simulationLoop());
  }

  /**
   * Apply physics transforms to Rive ViewModel instances.
   * @param {import('./src/models.js').BodyState[]} bodyStates
   */
  _applyTransforms(bodyStates) {
    this._lastBodyStates = bodyStates; // Store for debug rendering
    const transforms = this.binder.computeAllTransforms(bodyStates, this.bindings);

    for (const [name, t] of Object.entries(transforms)) {
      const vmi = this.vmInstances[name];
      if (vmi) {
        try {
          vmi.number('x').value = t.x;
          vmi.number('y').value = t.y;
          vmi.number('r').value = t.r;
          // Debug: log first frame values
          if (this.simulator && this.simulator.stepCount <= 1) {
            console.info(`[VM write v3] ${name}: x=${t.x.toFixed(2)}, y=${t.y.toFixed(2)}, r=${t.r.toFixed(4)}`);
          }
        } catch (e) {
          // Rive VM property access may fail
        }
      }
    }
  }

  /**
   * Draw debug shapes overlay showing Box2D fixture outlines.
   */
  _drawDebug() {
    if (!this.debugRenderer || !this.scene) return;
    const states = this._lastBodyStates || [];
    this.debugRenderer.setArtboardCenter(
      this.binder._artboardCenterX,
      this.binder._artboardCenterY
    );
    this.debugRenderer.draw(
      this.scene, states,
      this.zoom, this.panX, this.panY,
      this._selectedBodyIndex ?? null,
      this.canvas  // pass rive canvas for overlay alignment
    );
  }

  /**
   * Toggle debug overlay visibility.
   * @returns {boolean} new state
   */
  toggleDebug() {
    if (!this.debugRenderer) return 'hidden';
    const mode = this.debugRenderer.cycleMode();
    if (mode !== 'hidden' && this._lastBodyStates) {
      this._drawDebug();
    }
    return mode;
  }

  // ------------------------------------------------------------------
  // User interaction (Task 18.2)
  // ------------------------------------------------------------------

  /**
   * Set up all mouse/keyboard event listeners.
   */
  setupInteraction() {
    const canvas = this.canvas;
    if (!canvas) return;

    // Mouse down — start drag or select body
    canvas.addEventListener('mousedown', (e) => {
      this.lastMouseX = e.offsetX;
      this.lastMouseY = e.offsetY;

      // Alt+click or middle button → pan
      if (e.altKey || e.button === 1) {
        this.panning = true;
        e.preventDefault();
        return;
      }

      if (!this.scene || !this._lastBodyStates) return;

      // Hit test using body states + artboard coordinate mapping
      const hitIndex = this._hitTestBody(e.offsetX, e.offsetY);
      if (hitIndex !== null) {
        this._selectedBodyIndex = hitIndex;
        this._showBodyInfoFromScene(hitIndex);

        // Create mouse joint for dynamic bodies
        if (this.simulator && this.scene.bodies[hitIndex].bodyType === 2) {
          const [wx, wy] = this._screenToWorld(e.offsetX, e.offsetY);
          try {
            const b2body = this.simulator._bodies[hitIndex];
            if (b2body) {
              console.info(`[mouse joint] creating at (${wx.toFixed(2)}, ${wy.toFixed(2)}) for body ${hitIndex}`);
              this.simulator.createMouseJoint(b2body, wx, wy);
              this.dragging = true;
              this._dragLogCount = 0;
              console.info(`[mouse joint] created, dragging=true`);
            }
          } catch (err) {
            console.warn('Mouse joint failed:', err.message);
          }
        }
      } else {
        this._selectedBodyIndex = null;
        this._clearBodyInfo();
      }
    });

    // Mouse move — update drag or pan
    canvas.addEventListener('mousemove', (e) => {
      if (this.panning) {
        const dx = e.offsetX - this.lastMouseX;
        const dy = e.offsetY - this.lastMouseY;
        this.panX += dx;
        this.panY += dy;
        this.lastMouseX = e.offsetX;
        this.lastMouseY = e.offsetY;
        return;
      }

      if (this.dragging && this.simulator) {
        const [wx, wy] = this._screenToWorld(e.offsetX, e.offsetY);
        this.simulator.updateMouseJoint(wx, wy);
        // Log first few moves
        if (!this._dragLogCount) this._dragLogCount = 0;
        if (this._dragLogCount < 3) {
          console.info(`[drag] move to world (${wx.toFixed(2)}, ${wy.toFixed(2)})`);
          this._dragLogCount++;
        }
      }
    });

    // Mouse up — end drag or pan
    canvas.addEventListener('mouseup', () => {
      if (this.dragging && this.simulator) {
        this.simulator.destroyMouseJoint();
        this.dragging = false;
      }
      this.panning = false;
    });

    // Mouse leave — clean up
    canvas.addEventListener('mouseleave', () => {
      if (this.dragging && this.simulator) {
        this.simulator.destroyMouseJoint();
        this.dragging = false;
      }
      this.panning = false;
    });

    // Double-click — center on body
    canvas.addEventListener('dblclick', (e) => {
      if (!this.simulator) return;
      const [wx, wy] = this._screenToWorld(e.offsetX, e.offsetY);
      const body = this.simulator.getBodyAt(wx, wy);
      if (body) {
        const pos = body.GetPosition();
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        this.panX = cx - pos.get_x() * 32 * this.zoom;
        this.panY = cy + pos.get_y() * 32 * this.zoom;
      }
    });

    // Mouse wheel — zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.1, Math.min(10.0, this.zoom * factor));

      // Zoom toward cursor
      const mx = e.offsetX;
      const my = e.offsetY;
      this.panX = mx - (mx - this.panX) * (newZoom / this.zoom);
      this.panY = my - (my - this.panY) * (newZoom / this.zoom);
      this.zoom = newZoom;
    }, { passive: false });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ignore if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.pause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.stepOnce();
          break;
        case 'KeyR':
          this.reset();
          break;
        case 'KeyD':
          this.toggleDebug();
          break;
        case 'Equal':
        case 'NumpadAdd':
          this.zoom = Math.min(10.0, this.zoom * 1.2);
          break;
        case 'Minus':
        case 'NumpadSubtract':
          this.zoom = Math.max(0.1, this.zoom / 1.2);
          break;
        case 'Digit0':
        case 'Numpad0':
          this._fitToScene();
          break;
      }
    });
  }

  /**
   * Convert screen pixel coordinates to Box2D world coordinates.
   * @param {number} sx
   * @param {number} sy
   * @returns {[number, number]}
   */
  _screenToWorld(sx, sy) {
    // Use artboard-aware mapping (same as _hitTestBody)
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect) return [0, 0];

    const bounds = this.rive?.bounds;
    const abW = bounds ? (bounds.maxX - bounds.minX) : (this.canvas?.width ?? 800);
    const abH = bounds ? (bounds.maxY - bounds.minY) : (this.canvas?.height ?? 600);

    const canvasAspect = rect.width / rect.height;
    const artboardAspect = abW / abH;
    let fitScale, padX, padY;
    if (canvasAspect > artboardAspect) {
      fitScale = rect.height / abH;
      padX = (rect.width - abW * fitScale) / 2;
      padY = 0;
    } else {
      fitScale = rect.width / abW;
      padX = 0;
      padY = (rect.height - abH * fitScale) / 2;
    }

    const abX = (sx - padX) / fitScale;
    const abY = (sy - padY) / fitScale;
    const wx = (abX - this.binder._artboardCenterX) / 32;
    const wy = -(abY - this.binder._artboardCenterY) / 32;
    return [wx, wy];
  }

  /**
   * Hit test: find which body the screen click lands on.
   * Uses Rive artboard coordinate mapping to match what's displayed.
   * @param {number} screenX
   * @param {number} screenY
   * @returns {number|null} body index or null
   */
  _hitTestBody(screenX, screenY) {
    if (!this.scene || !this._lastBodyStates || !this.canvas) return null;

    // The canvas element's offsetX/offsetY gives position relative to the canvas.
    // But the canvas CSS size may differ from its pixel size.
    // Also, Rive renders with Fit.contain + center alignment inside the canvas.

    // Get the actual rendered area of the canvas
    const rect = this.canvas.getBoundingClientRect();
    // Normalize click to 0..1 within the canvas element
    const normX = screenX / rect.width;
    const normY = screenY / rect.height;

    // Rive artboard dimensions
    const bounds = this.rive?.bounds;
    const abW = bounds ? (bounds.maxX - bounds.minX) : this.canvas.width;
    const abH = bounds ? (bounds.maxY - bounds.minY) : this.canvas.height;

    // Fit.contain: uniform scale, centered
    const canvasAspect = rect.width / rect.height;
    const artboardAspect = abW / abH;
    let fitScale, padX, padY;

    if (canvasAspect > artboardAspect) {
      // Canvas wider than artboard — padding on left/right
      fitScale = rect.height / abH;
      padX = (rect.width - abW * fitScale) / 2;
      padY = 0;
    } else {
      // Canvas taller than artboard — padding on top/bottom
      fitScale = rect.width / abW;
      padX = 0;
      padY = (rect.height - abH * fitScale) / 2;
    }

    // Screen pixel → artboard coords
    const abX = (screenX - padX) / fitScale;
    const abY = (screenY - padY) / fitScale;

    // Artboard → Box2D world coords
    // convertTransform does: x_ab = box2d_x * 32 + centerX, y_ab = -box2d_y * 32 + centerY
    // Inverse: box2d_x = (x_ab - centerX) / 32, box2d_y = -(y_ab - centerY) / 32
    const wx = (abX - this.binder._artboardCenterX) / 32;
    const wy = -(abY - this.binder._artboardCenterY) / 32;

    // Hit test: check if click is inside any body's fixtures
    // First try exact polygon containment, then fall back to distance
    const stateMap = new Map();
    for (const s of this._lastBodyStates) stateMap.set(s.index, s);

    // Pass 1: exact fixture containment test
    for (const body of this.scene.bodies) {
      const s = stateMap.get(body.index);
      if (!s) continue;
      if (this._pointInBody(wx, wy, body, s)) {
        return body.index;
      }
    }

    // Pass 2: closest body center within generous radius
    const hitRadius = 3.0;
    let bestDist = hitRadius;
    let bestIndex = null;
    for (const body of this.scene.bodies) {
      const s = stateMap.get(body.index);
      if (!s) continue;
      const dx = wx - s.x;
      const dy = wy - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIndex = body.index;
      }
    }
    return bestIndex;
  }

  /**
   * Test if a world-space point is inside any fixture of a body.
   * Transforms the point into body-local space, then tests polygon containment.
   */
  _pointInBody(wx, wy, body, state) {
    // Transform world point to body-local coordinates
    const dx = wx - state.x;
    const dy = wy - state.y;
    const cos = Math.cos(-state.angle);
    const sin = Math.sin(-state.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;

    for (const fixture of body.fixtures) {
      const shape = fixture.shape;
      if (!shape) continue;

      if (shape.shapeType === 'polygon' && shape.vertices?.length >= 3) {
        if (this._pointInPolygon(lx, ly, shape.vertices)) return true;
      }
      if (shape.shapeType === 'circle') {
        const cx = shape.center?.x ?? 0;
        const cy = shape.center?.y ?? 0;
        const r = shape.radius || 0.1;
        if ((lx - cx) ** 2 + (ly - cy) ** 2 <= r * r) return true;
      }
      if (shape.shapeType === 'chain' && shape.chainVertices?.length >= 3) {
        // Treat chain as polygon for hit test (works for closed boundaries)
        if (this._pointInPolygon(lx, ly, shape.chainVertices)) return true;
      }
    }
    return false;
  }

  /**
   * Point-in-polygon test using ray casting algorithm.
   */
  _pointInPolygon(px, py, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      if (((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  _fitToScene() {
    this.zoom = 1.0;
    this.panX = this.canvas ? this.canvas.width / 2 : 400;
    this.panY = this.canvas ? this.canvas.height / 2 : 300;
  }

  // ------------------------------------------------------------------
  // UI helpers
  // ------------------------------------------------------------------

  /**
   * Show body info from parsed scene data + current body state.
   * @param {number} bodyIndex
   */
  _showBodyInfoFromScene(bodyIndex) {
    const el = document.getElementById('info-content');
    if (!el || !this.scene) return;

    const body = this.scene.bodies[bodyIndex];
    if (!body) return;

    // Find current state
    const state = this._lastBodyStates?.find(s => s.index === bodyIndex);
    const x = state?.x ?? body.position.x;
    const y = state?.y ?? body.position.y;
    const angle = state?.angle ?? body.angle;
    const mass = state?.mass ?? 0;

    const typeNames = { 0: 'Static', 1: 'Kinematic', 2: 'Dynamic' };
    const vmName = body.customProperties?.VM ?? '—';
    const actorName = body.customProperties?.Actor ?? '—';

    el.innerHTML = `
      <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${body.name || `body[${bodyIndex}]`}</span></div>
      <div class="info-row"><span class="info-label">Type:</span><span class="info-value">${typeNames[body.bodyType] ?? '?'}</span></div>
      <div class="info-row"><span class="info-label">VM:</span><span class="info-value">${vmName}</span></div>
      <div class="info-row"><span class="info-label">Actor:</span><span class="info-value">${actorName}</span></div>
      <hr style="border-color:#333;margin:4px 0">
      <div class="info-row"><span class="info-label">Position:</span><span class="info-value">${x.toFixed(3)}, ${y.toFixed(3)} m</span></div>
      <div class="info-row"><span class="info-label">Pixels:</span><span class="info-value">${(x * 32).toFixed(1)}, ${(-y * 32).toFixed(1)} px</span></div>
      <div class="info-row"><span class="info-label">Angle:</span><span class="info-value">${angle.toFixed(3)} rad / ${(angle * 180 / Math.PI).toFixed(1)}°</span></div>
      <div class="info-row"><span class="info-label">Mass:</span><span class="info-value">${mass.toFixed(4)}</span></div>
      <hr style="border-color:#333;margin:4px 0">
      <div class="info-row"><span class="info-label">Fixtures:</span><span class="info-value">${body.fixtures.length}</span></div>
      ${body.fixtures.map((f, i) => `
        <div class="info-row"><span class="info-label">  [${i}]</span><span class="info-value">${f.shape?.shapeType ?? '?'} d=${f.density}</span></div>
      `).join('')}
    `;
  }

  _clearBodyInfo() {
    const el = document.getElementById('info-content');
    if (el) el.innerHTML = '<p class="info-placeholder">Click a body to inspect</p>';
  }

  _updatePlayButton() {
    const btn = document.getElementById('btn-play-pause');
    if (!btn) return;
    btn.textContent = (this.running && !this.paused) ? '⏸ Pause' : '▶ Play';
  }

  _updateStatusBar() {
    const sim = this.simulator;
    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setText('status-time', `Time: ${sim ? sim.simTime.toFixed(2) : '0.00'}s`);
    setText('status-steps', `Steps: ${sim ? sim.stepCount : 0}`);
    setText('status-fps', `FPS: ${this._fps}`);
    setText('status-zoom', `Zoom: ${Math.round(this.zoom * 100)}%`);
  }

  _updateStatus(msg) {
    const el = document.getElementById('status-message');
    if (el) el.textContent = msg;
  }

  _showWarning(msg) {
    const el = document.getElementById('status-message');
    if (el) {
      el.textContent = `⚠ ${msg}`;
      el.style.color = 'var(--warning-color)';
    }
    console.warn('[RubeRiveApp]', msg);
  }

  _showError(msg) {
    const overlay = document.getElementById('error-overlay');
    const msgEl = document.getElementById('error-message');
    if (overlay && msgEl) {
      msgEl.textContent = msg;
      overlay.classList.remove('hidden');
    }
    console.error('[RubeRiveApp]', msg);
  }
}

// ------------------------------------------------------------------
// Error handling (Task 18.3)
// ------------------------------------------------------------------

/** Global error handlers */
function setupGlobalErrorHandlers(app) {
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = `${message} (${source}:${lineno}:${colno})`;
    app._showError(msg);
    console.error('[window.onerror]', msg, error);
    return true; // prevent default browser error display
  };

  window.onunhandledrejection = (event) => {
    const msg = `Unhandled promise rejection: ${event.reason}`;
    app._showError(msg);
    console.error('[unhandledrejection]', event.reason);
  };
}

/** Wire error overlay buttons */
function setupErrorOverlay() {
  const dismissBtn = document.getElementById('btn-error-dismiss');
  const reloadBtn = document.getElementById('btn-error-reload');
  const overlay = document.getElementById('error-overlay');

  if (dismissBtn && overlay) {
    dismissBtn.addEventListener('click', () => overlay.classList.add('hidden'));
  }
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => window.location.reload());
  }
}

// ------------------------------------------------------------------
// Wiring (Task 18.4)
// ------------------------------------------------------------------

/**
 * Boot the application: wire FileLoader → App, controls → App, etc.
 */
async function boot() {
  const app = new RubeRiveApp('rive-canvas');

  // Error handling
  setupGlobalErrorHandlers(app);
  setupErrorOverlay();

  // Initialize (load box2d-wasm)
  await app.init();

  // File loader
  const fileLoader = new FileLoader('drop-zone', 'file-input');
  fileLoader.onFilesLoaded = (jsonFile, rivFile) => app.loadFiles(jsonFile, rivFile);
  fileLoader.onError = (msg) => app._showError(msg);
  fileLoader.init();

  // Simulation controls
  const btnPlay = document.getElementById('btn-play-pause');
  const btnStep = document.getElementById('btn-step');
  const btnReset = document.getElementById('btn-reset');
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');

  if (btnPlay) btnPlay.addEventListener('click', () => {
    if (!app.running) {
      app.start();
    } else {
      app.pause();
    }
  });
  if (btnStep) btnStep.addEventListener('click', () => app.stepOnce());
  if (btnReset) btnReset.addEventListener('click', () => app.reset());

  const btnDebug = document.getElementById('btn-debug');
  if (btnDebug) btnDebug.addEventListener('click', () => {
    const mode = app.toggleDebug();
    btnDebug.textContent = app.debugRenderer?.modeLabel ?? '⬜ Debug Off';
  });

  if (speedSlider && speedValue) {
    speedSlider.addEventListener('input', () => {
      app.speed = parseFloat(speedSlider.value);
      speedValue.textContent = `${app.speed.toFixed(1)}×`;
    });
  }

  // Mouse/keyboard interaction
  app.setupInteraction();
}

// Auto-boot when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
