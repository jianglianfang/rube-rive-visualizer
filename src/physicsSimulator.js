/**
 * Physics Simulator for RUBE-Rive Visualizer (Web Mode).
 *
 * Provides Box2D physics simulation via box2d-wasm and body state validation.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.2, 7.6, 10.1, 10.2, 10.3, 10.4, 12.9, 12.10
 *
 * @module physicsSimulator
 */

import { BodyType } from './models.js';

/**
 * Detect NaN/Inf values in body state position (x, y) or angle fields.
 *
 * This is a standalone function that does NOT require box2d-wasm,
 * making it fully testable in any environment.
 *
 * @param {import('./models.js').BodyState[]} bodyStates
 * @returns {string[]} Names of bodies with NaN or Inf values in x, y, or angle.
 */
export function validateBodyStates(bodyStates) {
  return bodyStates
    .filter(s => !isFinite(s.x) || !isFinite(s.y) || !isFinite(s.angle))
    .map(s => s.name);
}

/**
 * Box2D body type mapping from our BodyType enum to box2d-wasm constants.
 * @param {object} box2D - box2d-wasm module
 * @param {number} bodyType - BodyType enum value
 * @returns {number} box2d-wasm body type constant
 */
function getB2BodyType(box2D, bodyType) {
  switch (bodyType) {
    case BodyType.KINEMATIC: return box2D.b2_kinematicBody;
    case BodyType.DYNAMIC: return box2D.b2_dynamicBody;
    default: return box2D.b2_staticBody;
  }
}


/**
 * Physics simulator based on box2d-wasm.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.2, 7.6, 10.1, 10.2, 10.3, 10.4, 12.9, 12.10
 */
export class PhysicsSimulator {
  static TIME_STEP = 1.0 / 60.0;
  static VELOCITY_ITERATIONS = 8;
  static POSITION_ITERATIONS = 3;

  /**
   * @param {object} box2D - box2d-wasm module instance
   */
  constructor(box2D) {
    this._box2D = box2D;
    this._world = null;
    this._bodies = [];
    this._joints = [];
    this._groundBody = null;
    this._mouseJoint = null;
    this._stepCount = 0;
    this._simTime = 0.0;
  }

  get stepCount() { return this._stepCount; }
  get simTime() { return this._simTime; }

  // ------------------------------------------------------------------
  // World construction
  // ------------------------------------------------------------------

  /**
   * Create a b2World from a RubeScene, populating bodies and joints.
   * @param {import('./models.js').RubeScene} scene
   */
  buildWorld(scene) {
    const b2 = this._box2D;

    const gravity = new b2.b2Vec2(scene.gravity.x, scene.gravity.y);
    this._world = new b2.b2World(gravity);
    b2.destroy(gravity);

    this._bodies = [];
    this._joints = [];
    this._mouseJoint = null;
    this._stepCount = 0;
    this._simTime = 0.0;

    // Create ground body for mouse joints
    const groundDef = new b2.b2BodyDef();
    this._groundBody = this._world.CreateBody(groundDef);
    b2.destroy(groundDef);

    // Create bodies
    for (const rubeBody of scene.bodies) {
      const body = this._createBody(rubeBody);
      this._bodies.push(body);
    }

    // Create joints
    for (const rubeJoint of scene.joints) {
      try {
        const joint = this._createJoint(rubeJoint);
        if (joint) this._joints.push(joint);
      } catch (e) {
        console.warn(`Failed to create joint '${rubeJoint.name}':`, e);
      }
    }
  }

  /**
   * @param {import('./models.js').RubeBody} rubeBody
   * @returns {object} b2Body
   */
  _createBody(rubeBody) {
    const b2 = this._box2D;

    const bodyDef = new b2.b2BodyDef();
    bodyDef.set_type(getB2BodyType(b2, rubeBody.bodyType));

    const pos = new b2.b2Vec2(rubeBody.position.x, rubeBody.position.y);
    bodyDef.set_position(pos);
    b2.destroy(pos);

    bodyDef.set_angle(rubeBody.angle);

    const linVel = new b2.b2Vec2(rubeBody.linearVelocity.x, rubeBody.linearVelocity.y);
    bodyDef.set_linearVelocity(linVel);
    b2.destroy(linVel);

    bodyDef.set_angularVelocity(rubeBody.angularVelocity);
    bodyDef.set_linearDamping(rubeBody.linearDamping);
    bodyDef.set_angularDamping(rubeBody.angularDamping);
    bodyDef.set_gravityScale(rubeBody.gravityScale);
    bodyDef.set_bullet(rubeBody.bullet);
    bodyDef.set_allowSleep(rubeBody.allowSleep);
    bodyDef.set_awake(rubeBody.awake);
    bodyDef.set_fixedRotation(rubeBody.fixedRotation);
    // Note: set_active removed in Box2D 2.4 — use SetEnabled after creation

    const body = this._world.CreateBody(bodyDef);
    b2.destroy(bodyDef);

    // Box2D 2.4+: use SetEnabled instead of the removed active flag
    if (!rubeBody.active && typeof body.SetEnabled === 'function') {
      body.SetEnabled(false);
    }

    // Store metadata
    body.__userData = {
      index: rubeBody.index,
      name: rubeBody.name,
    };

    // Create fixtures
    for (const rubeFixture of rubeBody.fixtures) {
      this._createFixture(body, rubeFixture);
    }

    return body;
  }

  /**
   * @param {object} body - b2Body
   * @param {import('./models.js').RubeFixture} rubeFixture
   */
  _createFixture(body, rubeFixture) {
    const b2 = this._box2D;
    const shape = rubeFixture.shape;
    if (!shape) return;

    const b2shape = this._createShape(shape);
    if (!b2shape) return;

    const fixtureDef = new b2.b2FixtureDef();
    fixtureDef.set_shape(b2shape);
    fixtureDef.set_density(rubeFixture.density);
    fixtureDef.set_friction(rubeFixture.friction);
    fixtureDef.set_restitution(rubeFixture.restitution);
    fixtureDef.set_isSensor(rubeFixture.sensor);

    const filter = fixtureDef.get_filter();
    filter.set_categoryBits(rubeFixture.filter.categoryBits);
    filter.set_maskBits(rubeFixture.filter.maskBits);
    filter.set_groupIndex(rubeFixture.filter.groupIndex);

    body.CreateFixture(fixtureDef);

    b2.destroy(fixtureDef);
    b2.destroy(b2shape);
  }

  /**
   * @param {import('./models.js').RubeShape} shape
   * @returns {object|null} b2Shape
   */
  _createShape(shape) {
    const b2 = this._box2D;

    if (shape.shapeType === 'circle') {
      const circle = new b2.b2CircleShape();
      circle.set_m_radius(shape.radius);
      const center = new b2.b2Vec2(shape.center.x, shape.center.y);
      circle.set_m_p(center);
      b2.destroy(center);
      return circle;
    }

    if (shape.shapeType === 'polygon') {
      if (!shape.vertices || shape.vertices.length === 0) return null;
      const n = shape.vertices.length;
      const polygon = new b2.b2PolygonShape();
      // Allocate b2Vec2 array in WASM heap (each b2Vec2 = 2 floats = 8 bytes)
      const buf = b2._malloc(n * 8);
      for (let i = 0; i < n; i++) {
        b2.HEAPF32[(buf >> 2) + i * 2] = shape.vertices[i].x;
        b2.HEAPF32[(buf >> 2) + i * 2 + 1] = shape.vertices[i].y;
      }
      polygon.Set(buf, n);
      b2._free(buf);
      return polygon;
    }

    if (shape.shapeType === 'edge') {
      const edge = new b2.b2EdgeShape();
      const v1 = new b2.b2Vec2(shape.vertex1.x, shape.vertex1.y);
      const v2 = new b2.b2Vec2(shape.vertex2.x, shape.vertex2.y);
      edge.Set(v1, v2);
      b2.destroy(v1);
      b2.destroy(v2);
      return edge;
    }

    if (shape.shapeType === 'chain') {
      if (!shape.chainVertices || shape.chainVertices.length === 0) return null;
      const n = shape.chainVertices.length;
      const chain = new b2.b2ChainShape();
      // Allocate b2Vec2 array in WASM heap
      const buf = b2._malloc(n * 8);
      for (let i = 0; i < n; i++) {
        b2.HEAPF32[(buf >> 2) + i * 2] = shape.chainVertices[i].x;
        b2.HEAPF32[(buf >> 2) + i * 2 + 1] = shape.chainVertices[i].y;
      }
      // box2d-wasm v7: CreateLoop for closed chains, CreateChain for open chains
      if (typeof chain.CreateChain === 'function') {
        chain.CreateChain(buf, n);
      } else if (typeof chain.CreateLoop === 'function') {
        chain.CreateLoop(buf, n);
      }
      b2._free(buf);

      // Set ghost vertices if available
      if (shape.hasPrevVertex) {
        const pv = new b2.b2Vec2(shape.prevVertex.x, shape.prevVertex.y);
        if (typeof chain.set_m_prevVertex === 'function') {
          chain.set_m_prevVertex(pv);
          if (typeof chain.set_m_hasPrevVertex === 'function') chain.set_m_hasPrevVertex(true);
        }
        b2.destroy(pv);
      }
      if (shape.hasNextVertex) {
        const nv = new b2.b2Vec2(shape.nextVertex.x, shape.nextVertex.y);
        if (typeof chain.set_m_nextVertex === 'function') {
          chain.set_m_nextVertex(nv);
          if (typeof chain.set_m_hasNextVertex === 'function') chain.set_m_hasNextVertex(true);
        }
        b2.destroy(nv);
      }
      return chain;
    }

    return null;
  }

  /**
   * @param {import('./models.js').RubeJoint} rubeJoint
   * @returns {object|null} b2Joint
   */
  _createJoint(rubeJoint) {
    const b2 = this._box2D;
    const bodyA = this._bodies[rubeJoint.bodyAIndex];
    const bodyB = this._bodies[rubeJoint.bodyBIndex];
    if (!bodyA || !bodyB) return null;

    const jtype = rubeJoint.jointType;
    const params = rubeJoint.params;
    const anchorA = rubeJoint.anchorA;
    const anchorB = rubeJoint.anchorB;

    if (jtype === 'revolute') {
      const jd = new b2.b2RevoluteJointDef();
      jd.set_bodyA(bodyA);
      jd.set_bodyB(bodyB);
      const la = new b2.b2Vec2(anchorA.x, anchorA.y);
      const lb = new b2.b2Vec2(anchorB.x, anchorB.y);
      jd.set_localAnchorA(la);
      jd.set_localAnchorB(lb);
      b2.destroy(la); b2.destroy(lb);
      jd.set_collideConnected(rubeJoint.collideConnected);
      jd.set_referenceAngle(params.refAngle ?? 0);
      jd.set_enableLimit(params.enableLimit ?? false);
      jd.set_lowerAngle(params.lowerLimit ?? 0);
      jd.set_upperAngle(params.upperLimit ?? 0);
      jd.set_enableMotor(params.enableMotor ?? false);
      jd.set_motorSpeed(params.motorSpeed ?? 0);
      jd.set_maxMotorTorque(params.maxMotorTorque ?? 0);
      const joint = b2.castObject(this._world.CreateJoint(jd), b2.b2RevoluteJoint);
      b2.destroy(jd);
      return joint;
    }

    if (jtype === 'distance') {
      const jd = new b2.b2DistanceJointDef();
      jd.set_bodyA(bodyA);
      jd.set_bodyB(bodyB);
      const la = new b2.b2Vec2(anchorA.x, anchorA.y);
      const lb = new b2.b2Vec2(anchorB.x, anchorB.y);
      jd.set_localAnchorA(la);
      jd.set_localAnchorB(lb);
      b2.destroy(la); b2.destroy(lb);
      jd.set_collideConnected(rubeJoint.collideConnected);
      jd.set_length(params.length ?? 1.0);
      jd.set_frequencyHz(params.frequency ?? 0);
      jd.set_dampingRatio(params.dampingRatio ?? 0);
      const joint = b2.castObject(this._world.CreateJoint(jd), b2.b2DistanceJoint);
      b2.destroy(jd);
      return joint;
    }

    if (jtype === 'prismatic') {
      const jd = new b2.b2PrismaticJointDef();
      jd.set_bodyA(bodyA);
      jd.set_bodyB(bodyB);
      const la = new b2.b2Vec2(anchorA.x, anchorA.y);
      const lb = new b2.b2Vec2(anchorB.x, anchorB.y);
      jd.set_localAnchorA(la);
      jd.set_localAnchorB(lb);
      b2.destroy(la); b2.destroy(lb);
      const axisData = params.localAxisA ?? {};
      const ax = new b2.b2Vec2(axisData.x ?? 1, axisData.y ?? 0);
      jd.set_localAxisA(ax);
      b2.destroy(ax);
      jd.set_collideConnected(rubeJoint.collideConnected);
      jd.set_referenceAngle(params.refAngle ?? 0);
      jd.set_enableLimit(params.enableLimit ?? false);
      jd.set_lowerTranslation(params.lowerLimit ?? 0);
      jd.set_upperTranslation(params.upperLimit ?? 0);
      jd.set_enableMotor(params.enableMotor ?? false);
      jd.set_motorSpeed(params.motorSpeed ?? 0);
      jd.set_maxMotorForce(params.maxMotorForce ?? 0);
      const joint = b2.castObject(this._world.CreateJoint(jd), b2.b2PrismaticJoint);
      b2.destroy(jd);
      return joint;
    }

    if (jtype === 'weld') {
      const jd = new b2.b2WeldJointDef();
      jd.set_bodyA(bodyA);
      jd.set_bodyB(bodyB);
      const la = new b2.b2Vec2(anchorA.x, anchorA.y);
      const lb = new b2.b2Vec2(anchorB.x, anchorB.y);
      jd.set_localAnchorA(la);
      jd.set_localAnchorB(lb);
      b2.destroy(la); b2.destroy(lb);
      jd.set_collideConnected(rubeJoint.collideConnected);
      jd.set_referenceAngle(params.refAngle ?? 0);
      jd.set_frequencyHz(params.frequency ?? 0);
      jd.set_dampingRatio(params.dampingRatio ?? 0);
      const joint = b2.castObject(this._world.CreateJoint(jd), b2.b2WeldJoint);
      b2.destroy(jd);
      return joint;
    }

    if (jtype === 'friction') {
      const jd = new b2.b2FrictionJointDef();
      jd.set_bodyA(bodyA);
      jd.set_bodyB(bodyB);
      const la = new b2.b2Vec2(anchorA.x, anchorA.y);
      const lb = new b2.b2Vec2(anchorB.x, anchorB.y);
      jd.set_localAnchorA(la);
      jd.set_localAnchorB(lb);
      b2.destroy(la); b2.destroy(lb);
      jd.set_collideConnected(rubeJoint.collideConnected);
      jd.set_maxForce(params.maxForce ?? 0);
      jd.set_maxTorque(params.maxTorque ?? 0);
      const joint = b2.castObject(this._world.CreateJoint(jd), b2.b2FrictionJoint);
      b2.destroy(jd);
      return joint;
    }

    if (jtype === 'wheel') {
      const jd = new b2.b2WheelJointDef();
      jd.set_bodyA(bodyA);
      jd.set_bodyB(bodyB);
      const la = new b2.b2Vec2(anchorA.x, anchorA.y);
      const lb = new b2.b2Vec2(anchorB.x, anchorB.y);
      jd.set_localAnchorA(la);
      jd.set_localAnchorB(lb);
      b2.destroy(la); b2.destroy(lb);
      const axisData = params.localAxisA ?? {};
      const ax = new b2.b2Vec2(axisData.x ?? 0, axisData.y ?? 1);
      jd.set_localAxisA(ax);
      b2.destroy(ax);
      jd.set_collideConnected(rubeJoint.collideConnected);
      jd.set_enableMotor(params.enableMotor ?? false);
      jd.set_motorSpeed(params.motorSpeed ?? 0);
      jd.set_maxMotorTorque(params.maxMotorTorque ?? 0);
      jd.set_frequencyHz(params.springFrequency ?? 2.0);
      jd.set_dampingRatio(params.springDampingRatio ?? 0.7);
      const joint = b2.castObject(this._world.CreateJoint(jd), b2.b2WheelJoint);
      b2.destroy(jd);
      return joint;
    }

    if (jtype === 'motor') {
      const jd = new b2.b2MotorJointDef();
      jd.set_bodyA(bodyA);
      jd.set_bodyB(bodyB);
      jd.set_collideConnected(rubeJoint.collideConnected);
      jd.set_maxForce(params.maxForce ?? 1.0);
      jd.set_maxTorque(params.maxTorque ?? 1.0);
      jd.set_correctionFactor(params.correctionFactor ?? 0.3);
      const joint = b2.castObject(this._world.CreateJoint(jd), b2.b2MotorJoint);
      b2.destroy(jd);
      return joint;
    }

    console.warn(`Unsupported joint type: ${jtype}`);
    return null;
  }

  // ------------------------------------------------------------------
  // Simulation step
  // ------------------------------------------------------------------

  /**
   * Execute one physics step and return all body states.
   * @param {number} [speedMultiplier=1.0]
   * @returns {import('./models.js').BodyState[]}
   */
  step(speedMultiplier = 1.0) {
    if (!this._world) {
      throw new Error('World not built. Call buildWorld() first.');
    }

    if (speedMultiplier > 0.0) {
      const dt = PhysicsSimulator.TIME_STEP * speedMultiplier;
      this._world.Step(dt, PhysicsSimulator.VELOCITY_ITERATIONS, PhysicsSimulator.POSITION_ITERATIONS);
      this._world.ClearForces();
      this._stepCount += 1;
      this._simTime += dt;
    }

    return this._getBodyStates();
  }

  /**
   * @returns {import('./models.js').BodyState[]}
   */
  _getBodyStates() {
    const states = [];
    for (const body of this._bodies) {
      const ud = body.__userData || {};
      const pos = body.GetPosition();
      const vel = body.GetLinearVelocity();
      states.push({
        index: ud.index ?? 0,
        name: ud.name ?? '',
        x: pos.get_x(),
        y: pos.get_y(),
        angle: body.GetAngle(),
        linearVelocityX: vel.get_x(),
        linearVelocityY: vel.get_y(),
        angularVelocity: body.GetAngularVelocity(),
        mass: body.GetMass(),
        inertia: body.GetInertia(),
      });
    }
    return states;
  }

  // ------------------------------------------------------------------
  // Body query
  // ------------------------------------------------------------------

  /**
   * Find a body at the given world coordinates using AABB query.
   * @param {number} worldX
   * @param {number} worldY
   * @returns {object|null} b2Body or null
   */
  getBodyAt(worldX, worldY) {
    if (!this._world) return null;

    const b2 = this._box2D;
    const half = 0.001;

    const lower = new b2.b2Vec2(worldX - half, worldY - half);
    const upper = new b2.b2Vec2(worldX + half, worldY + half);
    const aabb = new b2.b2AABB();
    aabb.set_lowerBound(lower);
    aabb.set_upperBound(upper);

    let foundBody = null;

    const callback = new b2.JSQueryCallback();
    callback.ReportFixture = (fixturePtr) => {
      const fixture = b2.wrapPointer(fixturePtr, b2.b2Fixture);
      foundBody = fixture.GetBody();
      return false; // stop after first hit
    };

    this._world.QueryAABB(callback, aabb);

    b2.destroy(lower);
    b2.destroy(upper);
    b2.destroy(aabb);

    return foundBody;
  }

  // ------------------------------------------------------------------
  // Mouse joint
  // ------------------------------------------------------------------

  /**
   * Create a mouse joint to drag a body.
   * @param {object} body - b2Body
   * @param {number} targetX
   * @param {number} targetY
   */
  createMouseJoint(body, targetX, targetY) {
    if (!this._world || !this._groundBody) {
      console.warn('[mouse joint] no world or ground body');
      return;
    }

    this.destroyMouseJoint();

    const b2 = this._box2D;
    try {
      const jd = new b2.b2MouseJointDef();
      jd.set_bodyA(this._groundBody);
      jd.set_bodyB(body);

      const target = new b2.b2Vec2(targetX, targetY);
      jd.set_target(target);
      b2.destroy(target);

      const maxForce = 10000.0 * Math.max(body.GetMass(), 1.0);
      jd.set_maxForce(maxForce);

      // box2d-wasm v7 (Box2D 2.4): use stiffness/damping instead of frequencyHz
      // These are required for the joint to actually exert force
      if (typeof jd.set_stiffness === 'function') {
        // Box2D 2.4+ API
        jd.set_stiffness(maxForce * 0.9);
        jd.set_damping(maxForce * 0.1);
      } else if (typeof jd.set_frequencyHz === 'function') {
        // Older Box2D API
        jd.set_frequencyHz(5.0);
        jd.set_dampingRatio(0.7);
      }

      const joint = this._world.CreateJoint(jd);
      this._mouseJoint = b2.castObject(joint, b2.b2MouseJoint);
      b2.destroy(jd);

      body.SetAwake(true);
      console.info(`[mouse joint] created successfully, maxForce=${maxForce.toFixed(0)}`);
    } catch (err) {
      console.error('[mouse joint] creation failed:', err);
      this._mouseJoint = null;
    }
  }

  /**
   * Update the mouse joint target position.
   * @param {number} targetX
   * @param {number} targetY
   */
  updateMouseJoint(targetX, targetY) {
    if (!this._mouseJoint) return;
    try {
      const b2 = this._box2D;
      const target = new b2.b2Vec2(targetX, targetY);
      this._mouseJoint.SetTarget(target);
      b2.destroy(target);
    } catch (err) {
      console.error('[mouse joint] update failed:', err);
    }
  }

  /**
   * Destroy the current mouse joint if one exists.
   */
  destroyMouseJoint() {
    if (this._mouseJoint) {
      this._world.DestroyJoint(this._mouseJoint);
      this._mouseJoint = null;
    }
  }

  // ------------------------------------------------------------------
  // Reset
  // ------------------------------------------------------------------

  /**
   * Destroy the current world and rebuild from the scene.
   * @param {import('./models.js').RubeScene} scene
   */
  reset(scene) {
    this._mouseJoint = null;
    this._world = null;
    this._bodies = [];
    this._joints = [];
    this._groundBody = null;
    this.buildWorld(scene);
  }

  // ------------------------------------------------------------------
  // Validation (instance method)
  // ------------------------------------------------------------------

  /**
   * Detect NaN/Inf in position/angle of current body states.
   * Delegates to the standalone validateBodyStates function.
   * @returns {string[]} Names of bodies with invalid values.
   */
  validateBodyStates() {
    const states = this._getBodyStates();
    return validateBodyStates(states);
  }
}
