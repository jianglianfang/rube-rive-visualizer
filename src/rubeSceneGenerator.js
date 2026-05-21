/**
 * Generates a complete RubeScene from analyzed Rive component data.
 * Handles Artboard→World coordinate conversion and scene assembly.
 *
 * Coordinate conversion is the inverse of MVVMBinder.convertTransform:
 *   world_x = (artboard_x - artboardWidth/2) / PIXEL_RATIO
 *   world_y = -(artboard_y - artboardHeight/2) / PIXEL_RATIO
 *
 * Requirements: 6.1, 6.2, 6.3, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7,
 *               8.3, 8.5, 11.1, 11.2, 11.3, 11.4, 13.1, 13.3, 13.4
 *
 * @module rubeSceneGenerator
 */

import {
  PIXEL_RATIO,
  BodyType,
  createVec2,
  createRubeScene,
  createRubeBody,
  createCollisionFilter,
} from './models.js';

/** Default physics parameters for generated dynamic bodies. */
const DEFAULT_DENSITY = 1.0;
const DEFAULT_FRICTION = 0.3;
const DEFAULT_RESTITUTION = 0.2;
const DEFAULT_GRAVITY_SCALE = 1.0;

/** Default world gravity (m/s²). */
const DEFAULT_GRAVITY_X = 0;
const DEFAULT_GRAVITY_Y = -10;

export class RubeSceneGenerator {
  /**
   * @param {import('./convexDecomposer.js').ConvexDecomposer} decomposer
   */
  constructor(decomposer) {
    this._decomposer = decomposer;
  }

  /**
   * Generate a complete RubeScene from analysis results.
   *
   * Creates one dynamic body per BoundComponent (with polygon fixtures and
   * "VM" CustomProperty) plus one static boundary body with a chain shape.
   *
   * @param {import('./riveAnalyzer.js').AnalysisResult} analysis
   * @returns {import('./models.js').RubeScene}
   */
  generate(analysis) {
    const { components, artboardWidth, artboardHeight } = analysis;

    const bodies = [];
    let bodyIndex = 0;

    // Generate dynamic bodies for each bound component
    for (const component of components) {
      const body = this._generateDynamicBody(
        component,
        bodyIndex,
        artboardWidth,
        artboardHeight,
      );
      bodies.push(body);
      bodyIndex++;
    }

    // Generate boundary body
    const boundary = this._generateBoundary(artboardWidth, artboardHeight);
    boundary.index = bodyIndex;
    bodies.push(boundary);

    // Assemble scene
    const scene = createRubeScene({
      gravity: createVec2(DEFAULT_GRAVITY_X, DEFAULT_GRAVITY_Y),
      allowSleep: true,
      autoClearForces: true,
      warmStarting: true,
      continuousPhysics: true,
      subStepping: false,
      bodies,
      joints: [],
      images: [],
      customProperties: {},
    });

    return scene;
  }

  /**
   * Convert a position from Artboard_Space to World_Space.
   * Inverse of MVVMBinder.convertTransform:
   *   world_x = (artboard_x - artboardWidth/2) / PIXEL_RATIO
   *   world_y = -(artboard_y - artboardHeight/2) / PIXEL_RATIO
   *
   * @param {number} artboardX
   * @param {number} artboardY
   * @param {number} artboardWidth
   * @param {number} artboardHeight
   * @returns {import('./models.js').Vec2}
   */
  artboardToWorld(artboardX, artboardY, artboardWidth, artboardHeight) {
    const worldX = (artboardX - artboardWidth / 2) / PIXEL_RATIO;
    const worldY = -(artboardY - artboardHeight / 2) / PIXEL_RATIO;
    return createVec2(worldX, worldY);
  }

  /**
   * Convert path vertices from Artboard_Space to body-local World_Space.
   * Subtracts component center, divides by PIXEL_RATIO, flips Y.
   *
   * @param {import('./models.js').Vec2[]} vertices - Artboard_Space vertices
   * @param {import('./models.js').Vec2} center - Component center in Artboard_Space
   * @returns {import('./models.js').Vec2[]} Body-local World_Space vertices
   */
  artboardVerticesToLocal(vertices, center) {
    return vertices.map(v => createVec2(
      (v.x - center.x) / PIXEL_RATIO,
      -(v.y - center.y) / PIXEL_RATIO,
    ));
  }

  /**
   * Generate a boundary chain body from artboard dimensions.
   * Creates a static body with a chain shape fixture forming a rectangular
   * boundary from the four artboard corners converted to World_Space.
   *
   * @param {number} artboardWidth
   * @param {number} artboardHeight
   * @returns {import('./models.js').RubeBody}
   */
  _generateBoundary(artboardWidth, artboardHeight) {
    // Generate inscribed circle boundary for a square artboard.
    // Radius = half of the shorter side (inscribed in the square).
    // Uses a chain shape polygon approximation (Box2D 2.3.x compatible).
    const radius = Math.min(artboardWidth, artboardHeight) / 2 / PIXEL_RATIO;
    const segments = 64; // enough for smooth circle

    // Chain vertices forming a closed circle (in world coordinates, centered at origin)
    // Winding: clockwise so chain normals point inward (keeps objects inside)
    const chainVertices = [];
    for (let i = 0; i <= segments; i++) {
      const angle = -(i / segments) * Math.PI * 2; // clockwise
      chainVertices.push(createVec2(
        radius * Math.cos(angle),
        radius * Math.sin(angle),
      ));
    }

    const chainFixture = {
      name: '',
      shape: {
        shapeType: 'chain',
        chainVertices,
        hasPrevVertex: true,
        hasNextVertex: true,
        prevVertex: createVec2(
          radius * Math.cos((1 / segments) * Math.PI * 2),
          radius * Math.sin((1 / segments) * Math.PI * 2),
        ),
        nextVertex: createVec2(
          radius * Math.cos((-1 / segments) * Math.PI * 2),
          radius * Math.sin((-1 / segments) * Math.PI * 2),
        ),
      },
      density: 0,
      friction: DEFAULT_FRICTION,
      restitution: DEFAULT_RESTITUTION,
      sensor: false,
      filter: createCollisionFilter(),
      customProperties: {},
    };

    return createRubeBody({
      name: 'boundary',
      index: 0, // will be set by caller
      bodyType: BodyType.STATIC,
      position: createVec2(0, 0), // centered at world origin
      angle: 0,
      fixtures: [chainFixture],
      customProperties: {},
    });
  }

  /**
   * Generate a dynamic body for a bound component.
   * Creates a dynamic body positioned at the component's center in World_Space,
   * with polygon fixtures from convex decomposition and a "VM" CustomProperty.
   *
   * @param {import('./riveAnalyzer.js').BoundComponent} component
   * @param {number} bodyIndex
   * @param {number} artboardWidth
   * @param {number} artboardHeight
   * @returns {import('./models.js').RubeBody}
   */
  _generateDynamicBody(component, bodyIndex, artboardWidth, artboardHeight) {
    // Convert component center to World_Space
    const worldPos = this.artboardToWorld(
      component.center.x,
      component.center.y,
      artboardWidth,
      artboardHeight,
    );

    // Convert vertices to body-local coordinates (relative to center)
    const localVertices = this.artboardVerticesToLocal(
      component.vertices,
      component.center,
    );

    // Decompose into convex polygons
    let convexPolygons;
    try {
      convexPolygons = this._decomposer.decompose(localVertices);
    } catch {
      // Fallback to AABB if decomposition fails
      const hw = component.width / 2 / PIXEL_RATIO;
      const hh = component.height / 2 / PIXEL_RATIO;
      convexPolygons = [[
        createVec2(-hw, -hh),
        createVec2(hw, -hh),
        createVec2(hw, hh),
        createVec2(-hw, hh),
      ]];
    }

    // Create polygon fixtures
    const fixtures = convexPolygons.map(polygon => ({
      name: '',
      shape: {
        shapeType: 'polygon',
        vertices: polygon.map(v => createVec2(v.x, v.y)),
      },
      density: DEFAULT_DENSITY,
      friction: DEFAULT_FRICTION,
      restitution: DEFAULT_RESTITUTION,
      sensor: false,
      filter: createCollisionFilter(),
      customProperties: {},
    }));

    return createRubeBody({
      name: component.vmPropertyName,
      index: bodyIndex,
      bodyType: BodyType.DYNAMIC,
      position: worldPos,
      angle: 0,
      gravityScale: DEFAULT_GRAVITY_SCALE,
      awake: true,
      fixtures,
      customProperties: {
        VM: component.vmPropertyName,
        shapeType: component.shapeType || 'rectangle',
      },
    });
  }

  /**
   * Update a body's physics parameters in the scene.
   * Updates density/friction/restitution on all fixtures and gravityScale on the body.
   *
   * @param {import('./models.js').RubeScene} scene
   * @param {number} bodyIndex
   * @param {Object} params - {density?, friction?, restitution?, gravityScale?}
   */
  updateBodyParams(scene, bodyIndex, params) {
    const body = scene.bodies.find(b => b.index === bodyIndex);
    if (!body) return;

    if (params.gravityScale !== undefined) {
      body.gravityScale = params.gravityScale;
    }

    // Update fixture-level params
    for (const fixture of body.fixtures) {
      if (params.density !== undefined) {
        fixture.density = params.density;
      }
      if (params.friction !== undefined) {
        fixture.friction = params.friction;
      }
      if (params.restitution !== undefined) {
        fixture.restitution = params.restitution;
      }
    }
  }

  /**
   * Update world gravity in the scene.
   *
   * @param {import('./models.js').RubeScene} scene
   * @param {number} gx
   * @param {number} gy
   */
  updateGravity(scene, gx, gy) {
    scene.gravity = createVec2(gx, gy);
  }
}
