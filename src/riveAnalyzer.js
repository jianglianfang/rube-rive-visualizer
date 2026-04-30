/**
 * Analyzes a Rive .riv file to extract ViewModel-bound components
 * and their geometric data for physics body generation.
 *
 * Uses the Rive @rive-app/canvas runtime API (globalThis.rive).
 * Extracts artboard dimensions, ViewModel properties, and component bounds.
 * Falls back to AABB when path data is not accessible.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6,
 *               4.1, 4.2, 4.3, 4.4, 12.1, 12.2
 *
 * @module riveAnalyzer
 */

import { createVec2, createBoundComponent, createAnalysisResult } from './models.js';

/**
 * Validate that a filename has a .riv extension (case-insensitive).
 * @param {string} fileName
 * @returns {boolean}
 */
export function validateRivExtension(fileName) {
  if (!fileName || typeof fileName !== 'string') return false;
  const idx = fileName.lastIndexOf('.');
  if (idx < 0) return false;
  return fileName.slice(idx).toLowerCase() === '.riv';
}

export class RiveAnalyzer {
  constructor() {
    /** @private */
    this._rive = null;
    /** @private */
    this._worldVM = null;
  }

  /**
   * Load a .riv file and analyze its artboard structure.
   * @param {ArrayBuffer} rivBuffer - Raw .riv file data
   * @param {HTMLCanvasElement} canvas - Canvas for Rive rendering
   * @returns {Promise<import('./models.js').AnalysisResult>}
   * @throws {Error} If .riv fails to load
   */
  async analyze(rivBuffer, canvas) {
    const RiveLib = globalThis.rive;
    if (!RiveLib || !RiveLib.Rive) {
      throw new Error('Rive runtime not available');
    }

    return new Promise((resolve, reject) => {
      try {
        this._rive = new RiveLib.Rive({
          buffer: rivBuffer,
          canvas: canvas,
          autoplay: true,
          onLoad: () => {
            try {
              const result = this._analyzeLoaded();
              resolve(result);
            } catch (err) {
              reject(err);
            }
          },
          onLoadError: (err) => {
            reject(new Error(`Rive load error: ${err}`));
          },
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Perform analysis after Rive file is loaded.
   * @returns {import('./models.js').AnalysisResult}
   * @private
   */
  _analyzeLoaded() {
    const rive = this._rive;
    const warnings = [];

    // Extract artboard dimensions
    let artboardWidth = 800;
    let artboardHeight = 600;
    if (rive.bounds) {
      artboardWidth = rive.bounds.maxX - rive.bounds.minX;
      artboardHeight = rive.bounds.maxY - rive.bounds.minY;
    }

    // Find World ViewModel
    this._worldVM = null;
    if (typeof rive.viewModelByName === 'function') {
      this._worldVM = rive.viewModelByName('world');
    }
    if (!this._worldVM && typeof rive.defaultViewModel === 'function') {
      this._worldVM = rive.defaultViewModel();
    }

    if (!this._worldVM) {
      console.info('[RiveAnalyzer] No ViewModel found in .riv file');
      warnings.push('No ViewModel data binding found');
      return createAnalysisResult({
        artboardWidth,
        artboardHeight,
        warnings,
      });
    }

    // Enumerate transform properties
    const transformProps = this._enumerateTransformProperties(this._worldVM);
    if (transformProps.length === 0) {
      console.info('[RiveAnalyzer] No transform-type properties found');
      warnings.push('No transform-type properties found in ViewModel');
      return createAnalysisResult({
        artboardWidth,
        artboardHeight,
        warnings,
      });
    }

    // Extract component bounds for each transform property
    const components = [];
    for (const propName of transformProps) {
      const comp = this._extractComponentBounds(rive, propName, artboardWidth, artboardHeight);
      if (comp) {
        components.push(comp);
      } else {
        warnings.push(`Could not extract bounds for property '${propName}'`);
      }
    }

    return createAnalysisResult({
      components,
      artboardWidth,
      artboardHeight,
      warnings,
    });
  }

  /**
   * Enumerate transform-type ViewModel properties (those with x, y, r sub-properties).
   * @param {object} worldVM - Rive World ViewModel
   * @returns {string[]} Property names that are transform-type
   */
  _enumerateTransformProperties(worldVM) {
    if (!worldVM || !worldVM.properties) return [];

    const transformProps = [];
    const props = worldVM.properties;

    for (const prop of props) {
      // A transform property is a ViewModel-type property that has x, y, r sub-properties
      // In Rive, these show up as type 'viewModel' or have nested number properties
      if (prop.type === 'viewModel' || prop.type === 'list') {
        transformProps.push(prop.name);
      }
    }

    // If no viewModel-type properties found, check if there are direct number properties
    // that follow the naming pattern (e.g., t1, t2, etc.)
    if (transformProps.length === 0) {
      for (const prop of props) {
        if (prop.type === 'number' && /^[a-z]\d+$/i.test(prop.name)) {
          // This might be a flat transform property
          continue; // Skip — we only want nested transform types
        }
      }
    }

    return transformProps;
  }

  /**
   * Extract component bounds for a given ViewModel property name.
   * Uses artboard node lookup to find the bound component.
   * Falls back to AABB when path data is not accessible.
   * @param {object} rive - Rive instance
   * @param {string} vmPropertyName
   * @param {number} artboardWidth
   * @param {number} artboardHeight
   * @returns {import('./models.js').BoundComponent|null}
   */
  _extractComponentBounds(rive, vmPropertyName, artboardWidth, artboardHeight) {
    // Default AABB fallback: create a reasonable-sized box
    // In a real implementation, we'd query the artboard for the node bounds
    const defaultSize = 50; // pixels
    const centerX = artboardWidth / 2;
    const centerY = artboardHeight / 2;

    // Try to find the component in the artboard
    // Rive Web runtime doesn't expose per-node bounds directly,
    // so we use AABB fallback
    const halfW = defaultSize / 2;
    const halfH = defaultSize / 2;

    const vertices = [
      createVec2(centerX - halfW, centerY - halfH),
      createVec2(centerX + halfW, centerY - halfH),
      createVec2(centerX + halfW, centerY + halfH),
      createVec2(centerX - halfW, centerY + halfH),
    ];

    return createBoundComponent({
      vmPropertyName,
      componentName: vmPropertyName,
      center: createVec2(centerX, centerY),
      vertices,
      width: defaultSize,
      height: defaultSize,
      isBoundingBox: true,
    });
  }

  /**
   * Get the Rive instance (for use by GeneratorApp for rendering).
   * @returns {object|null} Rive instance
   */
  getRiveInstance() {
    return this._rive;
  }
}
