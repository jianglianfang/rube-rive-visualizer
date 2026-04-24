/**
 * MVVM Binder — maps RUBE Body to Rive ViewModel properties.
 *
 * Coordinate conversion matches the product code (vg_anim_render_binder.cc):
 * 1. Box2D position (meters) → screen pixels via transformMatrix
 *    (scale by pixelRatio, flip Y, translate to view center)
 * 2. Screen pixels → Rive artboard coords via inverse view transform
 *
 * For the web visualizer, we simplify by computing the equivalent transform:
 *   screen_x = box2d_x * PIXEL_RATIO          (meters → pixels)
 *   screen_y = -box2d_y * PIXEL_RATIO          (meters → pixels, Y flip)
 * Then the Rive ViewModel x/y are in artboard-local coordinates.
 *
 * @module mvvmBinder
 */

import { PIXEL_RATIO, RAD_TO_DEG } from './models.js';

export class MVVMBinder {
  /**
   * Extract VM/Actor custom properties from bodies, return binding records.
   * @param {import('./models.js').RubeScene} scene
   * @returns {import('./models.js').BindingRecord[]}
   */
  buildBindings(scene) {
    const bindings = [];
    for (const body of scene.bodies) {
      if ('VM' in body.customProperties) {
        bindings.push({
          bodyIndex: body.index,
          bodyName: body.name,
          vmPropertyName: body.customProperties['VM'],
          isActor: 'Actor' in body.customProperties,
          actorName: body.customProperties['Actor'] ?? null,
        });
      }
    }
    return bindings;
  }

  /**
   * Validate bindings against Rive ViewModel property names.
   * @param {import('./models.js').BindingRecord[]} bindings
   * @param {string[]} riveVmProperties
   * @returns {{unmatched: string[], unused: string[]}}
   */
  validateBindings(bindings, riveVmProperties) {
    const bindingVmSet = new Set(bindings.map(br => br.vmPropertyName));
    const riveSet = new Set(riveVmProperties);
    const unmatched = [...bindingVmSet].filter(n => !riveSet.has(n)).sort();
    const unused = [...riveSet].filter(n => !bindingVmSet.has(n)).sort();
    return { unmatched, unused };
  }

  /**
   * Convert Box2D state to Rive ViewModel transform data.
   *
   * Matches product code (vg_anim_render_binder.cc + anim_world.cc):
   *   transformMatrix = identity
   *     → translate(offset.x, offset.y)
   *     → translate(translate.x + width/2, translate.y + height/2)
   *     → scale(pixelRatio, -pixelRatio)
   *   position_screen = transformMatrix * box2d_position
   *   position_rive = inverseViewTransform * position_screen
   *
   * In the web visualizer, the Rive ViewModel x/y bind directly to
   * component Position X/Y in artboard space. The product code's
   * screenToView uses Rive's computeAlignment(Fit::contain, center)
   * inverse, which maps screen coords → artboard coords.
   *
   * Since we don't have the exact screen/view dimensions, we pass
   * through the pixel-converted coordinates. The artboard offset
   * can be configured via setArtboardCenter().
   *
   * @param {import('./models.js').BodyState} bodyState
   * @returns {import('./models.js').TransformData}
   */
  convertTransform(bodyState) {
    // Step 1: Box2D meters → screen pixels (same as product transformMatrix)
    const screenX = bodyState.x * PIXEL_RATIO;
    const screenY = -bodyState.y * PIXEL_RATIO;

    // Step 2: Apply artboard offset (center of artboard)
    // In product code this is translate(width/2, height/2)
    const x = screenX + this._artboardCenterX;
    const y = screenY + this._artboardCenterY;

    // Rotation: negate (Box2D CCW → Rive CW), in radians
    const r = -bodyState.angle;

    return { x, y, r };
  }

  /**
   * Set the artboard center offset for coordinate conversion.
   * This corresponds to the product code's translate(width/2, height/2).
   *
   * @param {number} centerX - artboard width / 2
   * @param {number} centerY - artboard height / 2
   */
  setArtboardCenter(centerX, centerY) {
    this._artboardCenterX = centerX;
    this._artboardCenterY = centerY;
  }

  /** @private */
  _artboardCenterX = 0;
  /** @private */
  _artboardCenterY = 0;

  /**
   * Batch-compute transforms for all bound bodies.
   * @param {import('./models.js').BodyState[]} bodyStates
   * @param {import('./models.js').BindingRecord[]} bindings
   * @returns {Object<string, import('./models.js').TransformData>}
   */
  computeAllTransforms(bodyStates, bindings) {
    const stateByIndex = new Map();
    for (const s of bodyStates) {
      stateByIndex.set(s.index, s);
    }
    const result = {};
    for (const br of bindings) {
      const state = stateByIndex.get(br.bodyIndex);
      if (state !== undefined) {
        result[br.vmPropertyName] = this.convertTransform(state);
      }
    }
    return result;
  }
}
