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

// Note: DebugRenderer is not imported directly to avoid path issues.
// It's initialized lazily from DOM elements when available.

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
    this._infoMessage = '';
    this._errorMessage = '';
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
      (gx, gy) => this._onGravityChange(gx, gy)
    );

    // Initialize gravity sensor
    this.gravitySensor = new GravitySensor((gx, gy) => {
      if (this.scene) {
        this.scene.gravity.x = gx;
        this.scene.gravity.y = gy;
      }
    });

    // Initialize debug renderer (lazy — may not have DOM elements)
    this.debugRenderer = null;
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

      // 2. Analyze
      const analysis = await this.analyzer.analyze(buffer, this.canvas);

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

      // 6. Populate editor
      if (this.editor) {
        this.editor.populate(this.scene);
      }

      // 7. Start simulation
      this.start();

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
    return this.debugRenderer.cycleMode();
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

    this._animFrameId = requestAnimationFrame(() => this._simulationLoop());
  }

  /** @private */
  _applyTransforms(bodyStates) {
    const transforms = this.binder.computeAllTransforms(bodyStates, this.bindings);
    // Write to Rive ViewModel if available
    const rive = this.analyzer.getRiveInstance();
    if (rive) {
      // Transform writing would happen here with VM instances
    }
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
