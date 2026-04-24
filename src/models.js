/**
 * Data models for RUBE-Rive Visualizer (Web Mode).
 *
 * Defines all core data structures used across the web application:
 * - RUBE scene data (Vec2, Body, Fixture, Joint, Image, Scene)
 * - Enums (BodyType)
 * - Runtime state (BodyState, TransformData, BindingRecord)
 * - Constants (PIXEL_RATIO, RAD_TO_DEG)
 *
 * @module models
 */

// === Constants ===

/** Conversion ratio: 1 meter = 32 pixels. */
export const PIXEL_RATIO = 32.0;

/** Conversion factor from radians to degrees. */
export const RAD_TO_DEG = 180.0 / Math.PI;

// === Enums ===

/**
 * Box2D body types matching RUBE JSON integer encoding.
 * @enum {number}
 */
export const BodyType = Object.freeze({
  STATIC: 0,
  KINEMATIC: 1,
  DYNAMIC: 2,
});

// === JSDoc Typedefs ===

/**
 * 2D vector used for positions, velocities, and other vector quantities.
 * @typedef {Object} Vec2
 * @property {number} x
 * @property {number} y
 */

/**
 * Box2D collision filter data for a fixture.
 * @typedef {Object} CollisionFilter
 * @property {number} categoryBits - Default: 0x0001
 * @property {number} maskBits - Default: 0xFFFF
 * @property {number} groupIndex - Default: 0
 */

/**
 * Geometric shape data for a fixture. Fields are populated based on shapeType.
 * @typedef {Object} RubeShape
 * @property {string} shapeType - One of: "circle", "polygon", "edge", "chain"
 * @property {number} radius - Circle radius (circle only)
 * @property {Vec2} center - Circle center (circle only)
 * @property {Vec2[]} vertices - Polygon vertices (polygon only)
 * @property {Vec2} vertex1 - Edge start vertex (edge only)
 * @property {Vec2} vertex2 - Edge end vertex (edge only)
 * @property {boolean} hasVertex0 - Edge ghost vertex flag (edge only)
 * @property {boolean} hasVertex3 - Edge ghost vertex flag (edge only)
 * @property {Vec2} vertex0 - Edge ghost vertex (edge only)
 * @property {Vec2} vertex3 - Edge ghost vertex (edge only)
 * @property {Vec2[]} chainVertices - Chain vertices (chain only)
 * @property {boolean} hasPrevVertex - Chain ghost vertex flag (chain only)
 * @property {boolean} hasNextVertex - Chain ghost vertex flag (chain only)
 * @property {Vec2} prevVertex - Chain ghost vertex (chain only)
 * @property {Vec2} nextVertex - Chain ghost vertex (chain only)
 */

/**
 * A Box2D fixture definition parsed from RUBE JSON.
 * @typedef {Object} RubeFixture
 * @property {string} name
 * @property {RubeShape} shape
 * @property {number} density
 * @property {number} friction
 * @property {number} restitution
 * @property {boolean} sensor
 * @property {CollisionFilter} filter
 * @property {Object<string, *>} customProperties
 */

/**
 * A Box2D body definition parsed from RUBE JSON.
 * @typedef {Object} RubeBody
 * @property {string} name
 * @property {number} index
 * @property {number} bodyType - BodyType enum value (0=static, 1=kinematic, 2=dynamic)
 * @property {Vec2} position
 * @property {number} angle
 * @property {Vec2} linearVelocity
 * @property {number} angularVelocity
 * @property {number} linearDamping
 * @property {number} angularDamping
 * @property {number} gravityScale
 * @property {boolean} bullet
 * @property {boolean} allowSleep
 * @property {boolean} awake
 * @property {boolean} active
 * @property {boolean} fixedRotation
 * @property {number} massDataMass
 * @property {Vec2} massDataCenter
 * @property {number} massDataI
 * @property {RubeFixture[]} fixtures
 * @property {Object<string, *>} customProperties
 */

/**
 * A Box2D joint definition parsed from RUBE JSON.
 * @typedef {Object} RubeJoint
 * @property {string} name
 * @property {string} jointType - One of: "revolute", "distance", "prismatic", "wheel", "motor", "weld", "friction", "pulley", "gear", "mouse"
 * @property {number} bodyAIndex
 * @property {number} bodyBIndex
 * @property {boolean} collideConnected
 * @property {Vec2} anchorA
 * @property {Vec2} anchorB
 * @property {Object<string, *>} params - Type-specific parameters
 * @property {Object<string, *>} customProperties
 */

/**
 * An image definition parsed from RUBE JSON.
 * @typedef {Object} RubeImage
 * @property {number} bodyIndex
 * @property {string} name
 * @property {string} file
 * @property {Vec2} center
 * @property {number} angle
 * @property {number} scale
 * @property {number} aspectScale
 * @property {boolean} flip
 * @property {number} opacity
 * @property {number} filter
 * @property {number} renderOrder
 * @property {number[]} colorTint - [r, g, b, a] each 0-255
 * @property {Vec2[]} corners
 * @property {Object<string, *>} customProperties
 */

/**
 * Complete RUBE scene containing world properties, bodies, joints, and images.
 * @typedef {Object} RubeScene
 * @property {Vec2} gravity
 * @property {boolean} allowSleep
 * @property {boolean} autoClearForces
 * @property {boolean} warmStarting
 * @property {boolean} continuousPhysics
 * @property {boolean} subStepping
 * @property {RubeBody[]} bodies
 * @property {RubeJoint[]} joints
 * @property {RubeImage[]} images
 * @property {Object<string, *>} customProperties
 */

/**
 * Per-frame physics state of a body.
 * @typedef {Object} BodyState
 * @property {number} index
 * @property {string} name
 * @property {number} x - meters
 * @property {number} y - meters
 * @property {number} angle - radians
 * @property {number} linearVelocityX
 * @property {number} linearVelocityY
 * @property {number} angularVelocity
 * @property {number} mass
 * @property {number} inertia
 */

/**
 * Rive ViewModel transform data (pixel coordinates, degrees).
 * @typedef {Object} TransformData
 * @property {number} x - pixels
 * @property {number} y - pixels (Y-flipped)
 * @property {number} r - degrees
 */

/**
 * Maps a RUBE body to a Rive ViewModel property.
 * @typedef {Object} BindingRecord
 * @property {number} bodyIndex
 * @property {string} bodyName
 * @property {string} vmPropertyName - e.g., "b2"
 * @property {boolean} isActor
 * @property {string|null} actorName - e.g., "a1"
 */

// === Factory Functions ===

/**
 * Create a Vec2 with default values.
 * @param {number} [x=0] 
 * @param {number} [y=0] 
 * @returns {Vec2}
 */
export function createVec2(x = 0, y = 0) {
  return { x, y };
}

/**
 * Create a CollisionFilter with default values.
 * @param {number} [categoryBits=0x0001]
 * @param {number} [maskBits=0xFFFF]
 * @param {number} [groupIndex=0]
 * @returns {CollisionFilter}
 */
export function createCollisionFilter(categoryBits = 0x0001, maskBits = 0xFFFF, groupIndex = 0) {
  return { categoryBits, maskBits, groupIndex };
}

/**
 * Create a default RubeBody.
 * @param {Partial<RubeBody>} [overrides={}]
 * @returns {RubeBody}
 */
export function createRubeBody(overrides = {}) {
  return {
    name: "",
    index: 0,
    bodyType: BodyType.STATIC,
    position: createVec2(),
    angle: 0,
    linearVelocity: createVec2(),
    angularVelocity: 0,
    linearDamping: 0,
    angularDamping: 0,
    gravityScale: 1,
    bullet: false,
    allowSleep: true,
    awake: false,
    active: true,
    fixedRotation: false,
    massDataMass: 0,
    massDataCenter: createVec2(),
    massDataI: 0,
    fixtures: [],
    customProperties: {},
    ...overrides,
  };
}

/**
 * Create a default RubeScene.
 * @param {Partial<RubeScene>} [overrides={}]
 * @returns {RubeScene}
 */
export function createRubeScene(overrides = {}) {
  return {
    gravity: createVec2(0, -9.81),
    allowSleep: true,
    autoClearForces: true,
    warmStarting: true,
    continuousPhysics: true,
    subStepping: false,
    bodies: [],
    joints: [],
    images: [],
    customProperties: {},
    ...overrides,
  };
}

/**
 * Create a default BodyState.
 * @param {Partial<BodyState>} [overrides={}]
 * @returns {BodyState}
 */
export function createBodyState(overrides = {}) {
  return {
    index: 0,
    name: "",
    x: 0,
    y: 0,
    angle: 0,
    linearVelocityX: 0,
    linearVelocityY: 0,
    angularVelocity: 0,
    mass: 0,
    inertia: 0,
    ...overrides,
  };
}

/**
 * Create a default TransformData.
 * @param {number} [x=0]
 * @param {number} [y=0]
 * @param {number} [r=0]
 * @returns {TransformData}
 */
export function createTransformData(x = 0, y = 0, r = 0) {
  return { x, y, r };
}

/**
 * Create a default BindingRecord.
 * @param {Partial<BindingRecord>} [overrides={}]
 * @returns {BindingRecord}
 */
export function createBindingRecord(overrides = {}) {
  return {
    bodyIndex: 0,
    bodyName: "",
    vmPropertyName: "",
    isActor: false,
    actorName: null,
    ...overrides,
  };
}
