/**
 * UI panel for editing per-body physics parameters and world settings.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 *
 * @module physicsEditor
 */

import { BodyType } from './models.js';

export class PhysicsEditor {
  /**
   * @param {string} panelContainerId - DOM element ID for the editor panel
   * @param {Function} onParamChange - Callback: (bodyIndex, paramName, value) => void
   * @param {Function} onGravityChange - Callback: (gx, gy) => void
   * @param {Function} [onPrecisionChange] - Callback: (bodyIndex, {ellipseSegments, curveSegments}) => void
   * @param {Function} [onBodySelect] - Callback: (bodyIndex) => void
   */
  constructor(panelContainerId, onParamChange, onGravityChange, onPrecisionChange, onBodySelect) {
    /** @private */
    this._containerId = panelContainerId;
    /** @private */
    this._container = typeof document !== 'undefined'
      ? document.getElementById(panelContainerId)
      : null;
    /** @private */
    this._onParamChange = onParamChange || (() => {});
    /** @private */
    this._onGravityChange = onGravityChange || (() => {});
    /** @private */
    this._onPrecisionChange = onPrecisionChange || (() => {});
    /** @private */
    this._onBodySelect = onBodySelect || (() => {});
    /** @private */
    this._scene = null;
    /** @private */
    this._selectedBodyIndex = null;
    /** @private */
    this._dynamicBodies = [];
    /** @private - per-body precision overrides: Map<bodyIndex, {ellipseSegments, curveSegments}> */
    this._precisionMap = new Map();
  }

  /**
   * Populate the editor panel with bodies from a RubeScene.
   * @param {import('./models.js').RubeScene} scene
   */
  populate(scene) {
    this._scene = scene;
    this._dynamicBodies = scene.bodies.filter(b => b.bodyType === BodyType.DYNAMIC);
    this._selectedBodyIndex = null;
    this._render();
  }

  /**
   * Highlight/select a body in the editor list.
   * @param {number} bodyIndex
   */
  selectBody(bodyIndex) {
    this._selectedBodyIndex = bodyIndex;
    this._render();
  }

  /**
   * Validate a numeric input value.
   * @param {string} value
   * @param {number} min
   * @param {number} max
   * @returns {{valid: boolean, number: number|null}}
   */
  _validateNumericInput(value, min, max) {
    if (value === '' || value == null) {
      return { valid: false, number: null };
    }
    const num = Number(value);
    if (!isFinite(num)) {
      return { valid: false, number: null };
    }
    if (num < min || num > max) {
      return { valid: false, number: null };
    }
    return { valid: true, number: num };
  }

  /** Render the body list and parameter fields. */
  _render() {
    if (!this._container) return;
    const container = this._container;
    container.innerHTML = '';

    if (!this._scene) {
      container.innerHTML = '<p class="info-placeholder">No scene loaded</p>';
      return;
    }

    // World gravity section
    const gravSection = document.createElement('div');
    gravSection.className = 'editor-section';
    gravSection.innerHTML = '<h3>World Gravity</h3>';

    const gravRow = document.createElement('div');
    gravRow.className = 'editor-row';

    const gxInput = this._createNumberInput(
      'gravity-x', 'X:', this._scene.gravity.x, -100, 100,
      (val) => {
        this._scene.gravity.x = val;
        this._onGravityChange(this._scene.gravity.x, this._scene.gravity.y);
      }
    );
    const gyInput = this._createNumberInput(
      'gravity-y', 'Y:', this._scene.gravity.y, -100, 100,
      (val) => {
        this._scene.gravity.y = val;
        this._onGravityChange(this._scene.gravity.x, this._scene.gravity.y);
      }
    );
    gravRow.appendChild(gxInput);
    gravRow.appendChild(gyInput);
    gravSection.appendChild(gravRow);
    container.appendChild(gravSection);

    // Body list section
    const bodySection = document.createElement('div');
    bodySection.className = 'editor-section';
    bodySection.innerHTML = '<h3>Dynamic Bodies</h3>';

    if (this._dynamicBodies.length === 0) {
      bodySection.innerHTML += '<p class="info-placeholder">No dynamic bodies</p>';
    } else {
      const list = document.createElement('ul');
      list.className = 'body-list';

      for (const body of this._dynamicBodies) {
        const li = document.createElement('li');
        li.className = 'body-list-item';
        if (body.index === this._selectedBodyIndex) {
          li.classList.add('selected');
        }
        const vmName = body.customProperties?.VM || body.name || `body[${body.index}]`;
        li.textContent = vmName;
        li.dataset.bodyIndex = body.index;
        li.addEventListener('click', () => {
          this._selectedBodyIndex = body.index;
          this._onBodySelect(body.index);
          this._render();
        });
        list.appendChild(li);
      }
      bodySection.appendChild(list);
    }
    container.appendChild(bodySection);

    // Parameter fields for selected body
    if (this._selectedBodyIndex !== null) {
      const body = this._scene.bodies.find(b => b.index === this._selectedBodyIndex);
      if (body && body.bodyType === BodyType.DYNAMIC) {
        const paramSection = document.createElement('div');
        paramSection.className = 'editor-section';
        paramSection.innerHTML = `<h3>Parameters: ${body.customProperties?.VM || body.name}</h3>`;

        const fixture = body.fixtures[0]; // Use first fixture for params
        if (fixture) {
          const fields = [
            { name: 'density', label: 'Density', value: fixture.density, min: 0, max: 1000 },
            { name: 'friction', label: 'Friction', value: fixture.friction, min: 0, max: 10 },
            { name: 'restitution', label: 'Restitution', value: fixture.restitution, min: 0, max: 2 },
          ];

          for (const field of fields) {
            const input = this._createNumberInput(
              `param-${field.name}`, `${field.label}:`, field.value, field.min, field.max,
              (val) => this._onParamChange(this._selectedBodyIndex, field.name, val)
            );
            paramSection.appendChild(input);
          }

          // gravityScale is on the body, not fixture
          const gsInput = this._createNumberInput(
            'param-gravityScale', 'Gravity Scale:', body.gravityScale, -10, 10,
            (val) => this._onParamChange(this._selectedBodyIndex, 'gravityScale', val)
          );
          paramSection.appendChild(gsInput);
        }
        container.appendChild(paramSection);

        // Shape Detail slider — always show for dynamic bodies
        try {
          const precisionSection = document.createElement('div');
          precisionSection.className = 'editor-section';
          precisionSection.innerHTML = '<h3>Shape Detail</h3>';

          const currentPrec = this._precisionMap.get(this._selectedBodyIndex) || {
            ellipseSegments: 12,
            curveSegments: 4,
          };

          const detail = currentPrec.ellipseSegments;
          const detailSlider = this._createSliderInput(
            'precision-detail', 'Vertices:', detail, 3, 100, 1,
            (val) => {
              const prec = {
                ellipseSegments: val,
                curveSegments: Math.max(2, Math.round(val / 3)),
              };
              this._precisionMap.set(this._selectedBodyIndex, prec);
              this._onPrecisionChange(this._selectedBodyIndex, { ...prec });
            }
          );
          precisionSection.appendChild(detailSlider);
          container.appendChild(precisionSection);
        } catch (e) {
          console.error('[PhysicsEditor] Precision section render failed:', e);
        }
      }
    }
  }

  /**
   * Create a labeled number input element.
   * @private
   */
  _createNumberInput(id, label, value, min, max, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editor-field';

    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.value = value;
    input.step = 'any';
    input.min = min;
    input.max = max;

    const errorSpan = document.createElement('span');
    errorSpan.className = 'input-error';

    input.addEventListener('change', () => {
      const result = this._validateNumericInput(input.value, min, max);
      if (result.valid) {
        errorSpan.textContent = '';
        input.classList.remove('invalid');
        onChange(result.number);
      } else {
        errorSpan.textContent = 'Invalid';
        input.classList.add('invalid');
      }
    });

    wrapper.appendChild(lbl);
    wrapper.appendChild(input);
    wrapper.appendChild(errorSpan);
    return wrapper;
  }

  /**
   * Create a labeled range slider with value display.
   * @private
   */
  _createSliderInput(id, label, value, min, max, step, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'editor-field editor-slider';

    const lbl = document.createElement('label');
    lbl.htmlFor = id;
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.value = value;
    input.min = min;
    input.max = max;
    input.step = step;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'slider-value';
    valueSpan.textContent = value;

    input.addEventListener('change', () => {
      const val = Number(input.value);
      valueSpan.textContent = val;
      onChange(val);
    });

    input.addEventListener('input', () => {
      valueSpan.textContent = input.value;
    });

    wrapper.appendChild(lbl);
    wrapper.appendChild(input);
    wrapper.appendChild(valueSpan);
    return wrapper;
  }
}
