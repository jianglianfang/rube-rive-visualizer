/**
 * Generator mode application controller.
 * Coordinates: .riv load → analysis → scene generation → simulation → export.
 *
 * Requirements: 2.1, 2.5, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 10.1, 10.2, 10.3,
 *               10.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 15.1
 *
 * @module generatorApp
 */

import { RiveAnalyzer, validateRivExtension } from './riveAnalyzer.js';
import { ConvexDecomposer } from './convexDecomposer.js';
import { RubeSceneGenerator } from './rubeSceneGenerator.js';
import { PhysicsEditor } from './physicsEditor.js';
import { GravitySensor } from './gravitySensor.js';
import { PhysicsSimulator } from './physicsSimulator.js';
import { MVVMBinder } from './mvvmBinder.js';
import { RubeSerializer } from './rubeSerializer.js';
import { DebugRenderer } from './debugRenderer.js';

export class GeneratorApp {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;

    // Sub-modules (initialized in init())
    this.analyzer = new RiveAnalyzer();
    this.decomposer = new ConvexDecomposer();
    this.generator = new RubeSceneGenerator(this.decomposer);
    this.serializer = new RubeSerializer();
    this.binder = new MVVMBinder();
    this.simulator = null; // Needs box2d-wasm
    this.editor = null;    // Needs DOM
    this.gravitySensor = null;
    this.debugRenderer = null;

    // State
    this.scene = null;
    this.bindings = [];
    this.running = false;
    this.paused = false;
    this._animFrameId = null;
    this._lastBodyStates = [];
    this._rivFileName = '';
    this._rivBuffer = null; // Stored for re-analysis on precision change
    this._infoMessage = '';
    this._errorMessage = '';
    this._selectedBodyIndex = null; // Currently selected body for highlight
  }

  /** Initialize box2d-wasm and sub-modules. */
  async init() {
    // Initialize physics engine
    if (typeof globalThis.initBox2D === 'function') {
      const box2D = await globalThis.initBox2D();
      this.simulator = new PhysicsSimulator(box2D);
    }

    // Initialize editor
    this.editor = new PhysicsEditor(
      'generator-editor',
      (bodyIndex, paramName, value) => this._onParamChange(bodyIndex, paramName, value),
      (gx, gy) => this._onGravityChange(gx, gy),
      (bodyIndex, precision) => this._onPrecisionChange(bodyIndex, precision),
      (bodyIndex) => {
        // Editor list click → highlight on canvas
        this._selectedBodyIndex = bodyIndex;
        this._drawDebug();
      }
    );

    // Initialize gravity sensor
    this.gravitySensor = new GravitySensor((gx, gy) => {
      if (this.scene) {
        this.scene.gravity.x = gx;
        this.scene.gravity.y = gy;
      }
    });

    // Initialize debug renderer bound to generator canvas overlay
    this._initDebugRenderer();

    // Set up canvas click interaction for body selection
    this.setupInteraction();
  }

  /**
   * Load a .riv file and run the full generation pipeline.
   * @param {File} rivFile
   */
  async loadRivFile(rivFile) {
    this._errorMessage = '';
    this._infoMessage = '';

    // Validate file extension
    if (!validateRivExtension(rivFile.name)) {
      this._errorMessage = 'Invalid file type. Please provide a .riv file.';
      this._showError(this._errorMessage);
      throw new Error(this._errorMessage);
    }

    this._rivFileName = rivFile.name;

    try {
      // 1. Read file
      const buffer = await rivFile.arrayBuffer();
      this._rivBuffer = buffer;

      // 2. Analyze (binary parser + runtime)
      const analysis = await this.analyzer.analyze(buffer, this.canvas);

      // Log diagnostic info from binary parser
      const parseResult = this.analyzer.getParseResult();
      if (parseResult) {
        console.log('[GeneratorApp] Binary parse result:', {
          format: `v${parseResult.majorVersion}.${parseResult.minorVersion}`,
          artboard: parseResult.artboard,
          totalObjects: parseResult.objects.length,
          nodes: parseResult.nodes.length,
          shapes: parseResult.shapes.length,
          paths: parseResult.paths.length,
          vertices: parseResult.vertices.length,
          viewModels: parseResult.viewModels.length,
          dataBinds: parseResult.dataBinds.length,
        });
      }
      console.log('[GeneratorApp] Analysis result:', {
        components: analysis.components.length,
        artboard: `${analysis.artboardWidth}x${analysis.artboardHeight}`,
        warnings: analysis.warnings,
      });

      // Check for no-ViewModel case (INFO, not error)
      if (analysis.components.length === 0) {
        this._infoMessage = analysis.warnings.join('; ') || 'No ViewModel-bound components found';
        console.info('[GeneratorApp]', this._infoMessage);
        this._showInfo(this._infoMessage);
        return;
      }

      // 3. Generate scene
      this.scene = this.generator.generate(analysis);

      // 4. Build physics world
      if (this.simulator) {
        this.simulator.buildWorld(this.scene);
      }

      // 5. Build MVVM bindings
      this.bindings = this.binder.buildBindings(this.scene);
      if (this.canvas) {
        this.binder.setArtboardCenter(
          analysis.artboardWidth / 2,
          analysis.artboardHeight / 2
        );
      }

      // 5.5 Set up Rive ViewModel instances for physics-driven animation
      this._setupVMInstances();

      // 6. Populate editor
      if (this.editor) {
        this.editor.populate(this.scene);
      }

      // 7. Draw initial debug frame (show shapes overlaid on Rive without playing)
      this._showDebugCanvas();
      if (this.simulator) {
        const initialStates = this.simulator.step(0);
        this._lastBodyStates = initialStates;
        this._drawDebug();
      }

      // 8. Start simulation paused — designer sees shapes aligned with Rive first
      this.running = true;
      this.paused = true;

    } catch (err) {
      this._errorMessage = `Generation failed: ${err.message}`;
      console.error('[GeneratorApp]', err);
      this._showError(this._errorMessage);
      throw err;
    }
  }

  /** Start simulation. */
  start() {
    this.running = true;
    this.paused = false;
    this._simulationLoop();
  }

  /** Pause/unpause simulation. */
  pause() {
    this.paused = !this.paused;
  }

  /** Step one frame. */
  stepOnce() {
    if (!this.simulator || !this.scene) return;
    this.paused = true;
    const bodyStates = this.simulator.step(1.0);
    this._lastBodyStates = bodyStates;
    this._applyTransforms(bodyStates);
  }

  /** Reset simulation. */
  reset() {
    if (!this.simulator || !this.scene) return;
    this.running = false;
    this.paused = false;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    this.simulator.reset(this.scene);
  }

  /**
   * Export current scene as RUBE JSON file download.
   * @param {string} [baseFileName] - .riv file base name
   */
  exportJSON(baseFileName) {
    if (!this.scene) {
      this._showError('No scene to export');
      return;
    }

    try {
      const json = this.serializer.serialize(this.scene);
      const name = baseFileName || this._rivFileName.replace(/\.riv$/i, '') || 'scene';
      const fileName = `${name}_generated.json`;

      // Trigger browser download
      if (typeof document !== 'undefined') {
        const blob = new Blob([json], { type: 'application/json' });
        if (typeof URL.createObjectURL === 'function') {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        }
      }

      return json; // Return for testing
    } catch (err) {
      this._errorMessage = `Export failed: ${err.message}`;
      this._showError(this._errorMessage);
      throw err;
    }
  }

  /** Toggle gravity sensor mode. */
  toggleGravitySensor() {
    if (!this.gravitySensor) return false;
    return this.gravitySensor.toggle();
  }

  /** Toggle debug overlay. */
  toggleDebug() {
    if (!this.debugRenderer) return 'hidden';
    const mode = this.debugRenderer.cycleMode();
    if (mode !== 'hidden' && this._lastBodyStates.length > 0) {
      this._drawDebug();
    }
    return mode;
  }

  /**
   * Initialize DebugRenderer for the generator canvas.
   * Uses "overlay" mode to draw physics shapes on top of Rive rendering,
   * so designers can see which rigid body corresponds to which Rive component.
   * @private
   */
  _initDebugRenderer() {
    if (typeof document === 'undefined') return;

    const debugCanvas = document.getElementById('generator-debug-canvas');
    if (!debugCanvas) {
      this.debugRenderer = null;
      return;
    }

    this.debugRenderer = new DebugRenderer();
    // Override the overlay canvas to use the generator debug canvas
    this.debugRenderer.overlayCanvas = debugCanvas;
    this.debugRenderer.overlayCtx = debugCanvas.getContext('2d');
    // Use "overlay" mode so shapes align with Rive components
    this.debugRenderer._mode = 'overlay';
    // Canvas stays hidden until a file is loaded (see _showDebugCanvas)
  }

  /**
   * Show the debug canvas overlay (called after successful file load).
   * @private
   */
  _showDebugCanvas() {
    const debugCanvas = document.getElementById('generator-debug-canvas');
    if (debugCanvas) debugCanvas.style.display = 'block';
  }

  /**
   * Set up canvas click interaction for body selection.
   * Clicking a body on the canvas highlights it and selects it in the editor.
   */
  setupInteraction() {
    if (!this.canvas) return;

    // Bind click to the canvas area container so clicks work over both canvases
    const canvasArea = this.canvas.parentElement;
    if (!canvasArea) return;

    canvasArea.addEventListener('click', (e) => {
      if (!this.scene || !this._lastBodyStates) return;

      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const hitIndex = this._hitTestBody(clickX, clickY);
      this.selectBody(hitIndex);
    });
  }

  /**
   * Select a body by index — syncs canvas highlight and editor panel.
   * @param {number|null} bodyIndex
   */
  selectBody(bodyIndex) {
    this._selectedBodyIndex = bodyIndex;

    // Sync editor panel selection
    if (this.editor) {
      if (bodyIndex !== null) {
        this.editor.selectBody(bodyIndex);
      }
    }

    // Redraw debug to show highlight
    this._drawDebug();
  }

  /**
   * Hit test: find which body the click lands on.
   * Converts screen coordinates to Box2D world coordinates and checks proximity.
   * @param {number} screenX
   * @param {number} screenY
   * @returns {number|null}
   * @private
   */
  _hitTestBody(screenX, screenY) {
    if (!this.scene || !this._lastBodyStates || !this.canvas) return null;

    const rect = this.canvas.getBoundingClientRect();
    const abW = this.binder._artboardCenterX * 2;
    const abH = this.binder._artboardCenterY * 2;

    if (abW <= 0 || abH <= 0) return null;

    // Compute Fit.contain scale and offset (same as Rive rendering)
    const canvasW = rect.width;
    const canvasH = rect.height;
    const scaleX = canvasW / abW;
    const scaleY = canvasH / abH;
    const fitScale = Math.min(scaleX, scaleY);
    const renderedW = abW * fitScale;
    const renderedH = abH * fitScale;
    const offsetX = (canvasW - renderedW) / 2;
    const offsetY = (canvasH - renderedH) / 2;

    // Screen → artboard coords
    const abX = (screenX - offsetX) / fitScale;
    const abY = (screenY - offsetY) / fitScale;

    // Artboard → Box2D world coords
    const PIXEL_RATIO = 32;
    const wx = (abX - this.binder._artboardCenterX) / PIXEL_RATIO;
    const wy = -(abY - this.binder._artboardCenterY) / PIXEL_RATIO;

    // Find nearest body within hit radius
    const stateMap = new Map();
    for (const s of this._lastBodyStates) stateMap.set(s.index, s);

    const hitRadius = 2.0; // meters
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
   * Draw debug physics shapes overlaid on Rive rendering.
   * @private
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
      1.0, 0, 0,
      this._selectedBodyIndex,  // highlight selected body
      this.canvas
    );
  }

  /** @private */
  _simulationLoop() {
    if (!this.running) return;

    if (!this.paused && this.simulator) {
      // Update gravity sensor
      if (this.gravitySensor && this.gravitySensor.enabled) {
        this.gravitySensor.update(1 / 60);
      }

      const bodyStates = this.simulator.step(1.0);
      this._lastBodyStates = bodyStates;
      this._applyTransforms(bodyStates);

      // NaN/Inf check every 60 frames
      if (this.simulator.stepCount % 60 === 0) {
        const invalid = this.simulator.validateBodyStates();
        if (invalid.length > 0) {
          this.paused = true;
          console.warn('[GeneratorApp] NaN/Inf detected:', invalid);
        }
      }
    }

    this._drawDebug();
    this._animFrameId = requestAnimationFrame(() => this._simulationLoop());
  }

  /** @private */
  _applyTransforms(bodyStates) {
    const transforms = this.binder.computeAllTransforms(bodyStates, this.bindings);
    // Write to Rive ViewModel instances
    for (const [name, t] of Object.entries(transforms)) {
      const vmi = this._vmInstances?.[name];
      if (vmi) {
        try {
          const xProp = vmi.number('x');
          const yProp = vmi.number('y');
          const rProp = vmi.number('r');
          if (xProp) xProp.value = t.x;
          if (yProp) yProp.value = t.y;
          if (rProp) rProp.value = t.r;
        } catch (e) { /* VM property access may fail */ }
      }
    }
  }

  /**
   * Set up Rive ViewModel instances to enable physics → Rive transform writing.
   * Mirrors the logic from app.js Preview mode (_setupVMInstances).
   * @private
   */
  _setupVMInstances() {
    this._vmInstances = {};
    const rive = this.analyzer.getRiveInstance();
    if (!rive) return;

    // Start state machines (required for ViewModel updates to render)
    try {
      const smNames = rive.stateMachineNames;
      if (smNames && smNames.length > 0) {
        for (const name of smNames) {
          rive.play(name);
        }
      }
    } catch (e) { /* ignore */ }

    // Find and bind the "world" ViewModel
    let worldVM = null;
    if (typeof rive.viewModelByName === 'function') {
      worldVM = rive.viewModelByName('world');
    }
    if (!worldVM && typeof rive.defaultViewModel === 'function') {
      worldVM = rive.defaultViewModel();
    }
    if (!worldVM) {
      console.warn('[GeneratorApp] No ViewModel found — physics will not drive Rive');
      return;
    }

    // Get or create a ViewModel instance and bind it
    let vmi;
    try {
      vmi = worldVM.defaultInstance();
      rive.bindViewModelInstance(vmi);
    } catch (e) {
      console.warn('[GeneratorApp] ViewModel instance bind failed:', e.message);
      return;
    }

    // For each binding, try to access the nested VM instance (tN → x, y, r)
    for (const binding of this.bindings) {
      const name = binding.vmPropertyName; // e.g. "t1"

      // Strategy 1: nested ViewModel
      try {
        const nested = vmi.viewModel(name);
        if (nested) {
          const testX = nested.number('x');
          if (testX) {
            this._vmInstances[name] = nested;
            continue;
          }
        }
      } catch (e) { /* next strategy */ }

      // Strategy 2: path-based "t1/x"
      try {
        const testX = vmi.number(`${name}/x`);
        if (testX) {
          this._vmInstances[name] = {
            number: (prop) => vmi.number(`${name}/${prop}`),
          };
          continue;
        }
      } catch (e) { /* next strategy */ }

      // Strategy 3: flat naming "t1_x"
      try {
        const testX = vmi.number(`${name}_x`);
        if (testX) {
          this._vmInstances[name] = {
            number: (prop) => vmi.number(`${name}_${prop}`),
          };
          continue;
        }
      } catch (e) { /* skip */ }
    }

    console.info(`[GeneratorApp] VM instances: ${Object.keys(this._vmInstances).length} of ${this.bindings.length}`);
  }

  /** @private */
  _onParamChange(bodyIndex, paramName, value) {
    if (!this.scene) return;
    this.generator.updateBodyParams(this.scene, bodyIndex, { [paramName]: value });
    // Rebuild world with updated params
    if (this.simulator) {
      this.simulator.reset(this.scene);
    }
  }

  /** @private */
  _onGravityChange(gx, gy) {
    if (!this.scene) return;
    this.generator.updateGravity(this.scene, gx, gy);
  }

  /**
   * Handle precision slider change: re-extract only the selected body's shape
   * with new precision, update its fixtures, and rebuild the physics world.
   * @private
   * @param {number} bodyIndex
   * @param {{ellipseSegments: number, curveSegments: number}} precision
   */
  _onPrecisionChange(bodyIndex, precision) {
    if (!this.scene) return;

    const body = this.scene.bodies.find(b => b.index === bodyIndex);
    if (!body) return;

    const vmName = body.customProperties?.VM;
    if (!vmName) return;

    // Get artboard dimensions from binder
    const artboardW = this.binder._artboardCenterX * 2;
    const artboardH = this.binder._artboardCenterY * 2;

    // Re-extract only this component's shape with custom precision
    const shapeData = this.analyzer.reExtractComponentShape(
      vmName,
      precision.ellipseSegments,
      precision.curveSegments,
      artboardW,
      artboardH
    );

    if (!shapeData || !shapeData.vertices || shapeData.vertices.length < 3) {
      console.warn(`[GeneratorApp] Precision change: no shape data for ${vmName}`);
      return;
    }

    // Convert vertices to body-local coordinates and decompose into convex polygons
    const localVertices = this.generator.artboardVerticesToLocal(
      shapeData.vertices,
      shapeData.center
    );

    let convexPolygons;
    try {
      convexPolygons = this.decomposer.decompose(localVertices);
    } catch {
      // Fallback to bounding box
      const hw = shapeData.width / 2 / 32; // PIXEL_RATIO
      const hh = shapeData.height / 2 / 32;
      convexPolygons = [[
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ]];
    }

    // Preserve existing fixture physics params (density, friction, etc.)
    const oldFixture = body.fixtures[0];
    const density = oldFixture?.density ?? 1.0;
    const friction = oldFixture?.friction ?? 0.3;
    const restitution = oldFixture?.restitution ?? 0.2;

    // Replace fixtures with new convex polygons
    body.fixtures = convexPolygons.map(polygon => ({
      name: '',
      shape: {
        shapeType: 'polygon',
        vertices: polygon.map(v => ({ x: v.x, y: v.y })),
      },
      density,
      friction,
      restitution,
      sensor: false,
      filter: { categoryBits: 1, maskBits: 65535, groupIndex: 0 },
      customProperties: {},
    }));

    // Rebuild physics world with updated body
    if (this.simulator) {
      this.simulator.buildWorld(this.scene);
      const states = this.simulator.step(0);
      this._lastBodyStates = states;
      this._drawDebug();
    }

    console.info(`[GeneratorApp] ${vmName} precision: ellipse=${precision.ellipseSegments}, curve=${precision.curveSegments}, fixtures=${body.fixtures.length}`);
  }

  /** @private */
  _showError(msg) {
    const overlay = typeof document !== 'undefined' ? document.getElementById('error-overlay') : null;
    const msgEl = typeof document !== 'undefined' ? document.getElementById('error-message') : null;
    if (overlay && msgEl) {
      msgEl.textContent = msg;
      overlay.classList.remove('hidden');
    }
  }

  /** @private */
  _showInfo(msg) {
    const el = typeof document !== 'undefined' ? document.getElementById('generator-status') : null;
    if (el) el.textContent = msg;
  }
}
