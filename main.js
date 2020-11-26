/* Clicking Game Demo
 * Copyright (C) 2020 Henry Wilkes

 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.

 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.

 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

'use strict';

/**
 * Get the pixel length of a computed style property of an element. Float values
 * are rounded up.
 *
 * @param {Element} el - The element to get the length from.
 * @param {string} property - The style property to get the length of.
 *
 * @return {number} The pixel length of the property.
 * @throws {Error} Thrown when property does not refer to a pixel length.
 *
 * @private
 */
function getStyleLength (el, property) {
  const length = getComputedStyle(el).getPropertyValue(property);
  if (/^[0-9]+(\.[0-9]+)?px$/.test(length)) {
    return Math.ceil(parseFloat(length));
  } else {
    throw new Error(
      'Unrecognised length of ' + length + ' for the ' + property +
      ' property');
  }
}

/**
 * Get the border width of an element. Float values are rounded up.
 *
 * @param {Element} el - The element to get the border width of.
 * @param {string} side - The side to get the border width of (left, right, top
 * or bottom).
 *
 * @return {number} The pixel width of the border.
 * @throws {Error} Thrown if *side* does not have a border width.
 *
 * @private
 */
function getBorderWidth (el, side) {
  return getStyleLength(el, 'border-' + side + '-width');
}

/**
 * Tracks the user mouse events within a given area to approximate its
 * position and velocity.
 */
class MouseTracker {
  /**
   * Create a new MouseTracker covering the given area.
   *
   * @param {Element} trackingAreaEl - Element whose area will be used for
   * tracking mouse events. If the mouse leaves this element its position and
   * velocity will be unknown.
   * @param {Element} relativeEl - Element to use as the coordinate origin.
   * The left and top of this element, **within** its padding area (minus the
   * border), will be used as the `x` and `y` origins, respectively. These are
   * the coordinates used in {@link MouseTracker#posX} and
   * {@link MouseTracker#posY}. This element must stay fixed relative to the
   * tracking area, and its border width must stay fixed.
   * @posHandler {function()} A handler to call every time the position or
   * velocity has been updated by a mouse event.
   *
   * @return {MouseTracker} A new MouseTracker.
   */
  constructor (trackingAreaEl, relativeEl, posHandler) {
    /* velocity in pixels per second */
    this._velX = 0;
    this._velY = 0;
    /* position, relative to the relative element */
    this._posX = NaN;
    this._posY = NaN;
    /* position, relative to the client */
    this._clientX = NaN;
    this._clientY = NaN;
    /* last scroll position */
    this._scrollX = window.scrollX;
    this._scrollY = window.scrollY;
    /* timestamp of the last event, in milliseconds */
    this._lastTimeStamp = NaN;
    /* Date.now() of the last sample, in milliseconds */
    this._nowAtSample = NaN;

    this._trackingAreaEl = trackingAreaEl;
    {
      /* assume constant relative to each other */
      /* get the border boxes */
      const trackingRect = trackingAreaEl.getBoundingClientRect();
      const relativeRect = relativeEl.getBoundingClientRect();
      /* minus these offset to translate from the border area of the tracking
       * area to the padding area of the relative element */
      this._offsetX = relativeRect.x - trackingRect.x +
        getBorderWidth(relativeEl, 'left');
      this._offsetY = relativeRect.y - trackingRect.y +
        getBorderWidth(relativeEl, 'top');
    }
    this._posHandler = posHandler;
    /* how long until a velocity sample expires, in milliseconds */
    this._sampleExpireTime = 300;

    Object.seal(this);

    trackingAreaEl.addEventListener(
      'mousemove', this._updateFromMouseMove.bind(this));

    trackingAreaEl.addEventListener(
      'mouseleave', this._updateFromMouseLeave.bind(this));

    trackingAreaEl.addEventListener(
      'mouseover', this._updateFromMouseOver.bind(this));

    window.addEventListener(
      'scroll', this._updateFromScroll.bind(this));

    window.addEventListener(
      'resize', this._updateFromResize.bind(this));
  }

  _recentVelSample (now, vel) {
    /* Note: if nowAtSample is NaN comparison would fail */
    if ((now - this._nowAtSample) <= this._sampleExpireTime) {
      return vel;
    } else {
      /* no recent sample, so treat as zero */
      return 0;
    }
  }

  /**
   * Get an estimate for the mouse velocity in the horizontal direction (left to
   * right is a positive velocity).
   *
   * @param {number} now - The current time returned by Date.now().
   * @return {number} The horizontal velocity of the mouse (pixels per second).
   */
  velX (now) {
    return this._recentVelSample(now, this._velX);
  }

  /**
   * Get an estimate for the mouse velocity in the vertical direction (top to
   * bottom is a positive velocity).
   *
   * @param {number} now - The current time returned by Date.now().
   * @return {number} The vertical velocity of the mouse (pixels per second).
   */
  velY (now) {
    return this._recentVelSample(now, this._velY);
  }

  /**
   * Get an estimate for the horizontal mouse position relative to the
   * *relativeEl* given in {@link MouseTracker#constructor}, with the origin at
   * the left of the element's padding area.
   *
   * @return {number|undefined} The horizontal position of the mouse, or
   * *undefined* if it is not known.
   */
  posX () {
    return this._posX;
  }

  /**
   * Get an estimate for the vertical mouse position relative to the
   * *relativeEl* given in {@link MouseTracker#constructor}, with the origin at
   * the top of the element's padding area.
   *
   * @return {number|undefined} The vertical position of the mouse, or
   * *undefined* if it is not known.
   */
  posY () {
    return this._posY;
  }

  _timeAvVel (curr, diffPos, diffTimeMillisec) {
    const vel = (diffPos / diffTimeMillisec) * 1000;
    if (!Number.isFinite(vel)) {
      return 0;
    } else if (diffTimeMillisec > this._sampleExpireTime) {
      /* so much time has passed, so discard the current time */
      return vel;
    } else if (!Number.isFinite(curr)) {
      return vel;
    } else if (curr === 0) {
      /* jump straight to the new vel */
      return vel;
    } else if (vel < 0 && curr > 0) {
      /* changed sign, so jump straight to the new vel */
      return vel;
    } else if (vel > 0 && curr < 0) {
      return vel;
    } else {
      /* take an average */
      return (curr + vel) / 2;
    }
  }

  _updateMouseMotion (diffX, diffY, timeStamp) {
    this._nowAtSample = Date.now();
    const diffTime = timeStamp - this._lastTimeStamp;
    this._velX = this._timeAvVel(this._velX, diffX, diffTime);
    this._velY = this._timeAvVel(this._velY, diffY, diffTime);
    this._lastTimeStamp = timeStamp;

    /* translate from the client to the relative element */
    const rect = this._trackingAreaEl.getBoundingClientRect();
    /* minus the client rect to translate to border area of the tracking area
     * then minus offset to translate to the padding area of the relative
     * element */
    this._posX = this._clientX - rect.x - this._offsetX;
    this._posY = this._clientY - rect.y - this._offsetY;
    this._posHandler();
  }

  _updateToClientPos (ev) {
    const lastX = this._clientX;
    const lastY = this._clientY;
    const clientX = ev.clientX;
    const clientY = ev.clientY;
    if (lastX === clientX && lastY === clientY) {
      /* ignore duplicate position events */
      return;
    }
    const diffX = clientX - lastX;
    const diffY = clientY - lastY;
    /* update prior */
    this._clientX = clientX;
    this._clientY = clientY;
    this._updateMouseMotion(diffX, diffY, ev.timeStamp);
  }

  _updateToUnknown (ev) {
    this._clientX = NaN;
    this._clientY = NaN;
    this._updateMouseMotion(NaN, NaN, ev.timeStamp);
  }

  _updateFromMouseMove (ev) {
    this._updateToClientPos(ev);
  }

  _updateFromMouseOver (ev) {
    /* the mouse has moved over us or one of our children, can be triggered
     * by a zoom.
     * Note, we are assuming this is released after the resize event */
    this._updateToClientPos(ev);
  }

  _updateFromScroll (ev) {
    /* client position is the same, but rect of the tracking area may have
     * moved */
    const newScrollX = window.scrollX;
    const newScrollY = window.scrollY;
    this._updateMouseMotion(
      newScrollX - this._scrollX, newScrollY - this._scrollY, ev.timeStamp);
    this._scrollX = newScrollX;
    this._scrollY = newScrollY;
  }

  _updateFromMouseLeave (ev) {
    /* the mouse has left the tracking area so we don't know its position */
    this._updateToUnknown(ev);
  }

  _updateFromResize (ev) {
    /* hard to predict where the mouse now is after a resize/zoom */
    this._updateToUnknown(ev);
  }
}

/**
 *
 * Check that a number is in the specified numerical range. Otherwise throws
 * an error.
 *
 * @param {string} numName - A name for the number.
 * @param {number} num - The number to check is in range.
 * @param {number} lower - A lower bound that the number must be greater than.
 * @param {boolean} lowerClosed - Whether the lower bound is closed (if *true*,
 * the number may be equal to the lower bound).
 * @param {number} upper - An upper bound that the number must be less than.
 * @param {boolean} upperClosed - Whether the upper bound is closed (if *true*,
 * the number may be equal to the upper bound).
 *
 * @throws {TypeError} The number is not typed as a number.
 * @throws {RangeError} The number is outside the given range.
 *
 * @private
 */
function checkRange (numName, num, lower, lowerClosed, upper, upperClosed) {
  if (typeof num !== 'number') {
    throw new TypeError(numName + ' must be a number');
  }
  if (!(
    (num > lower || (lowerClosed && num === lower)) &&
    (num < upper || (upperClosed && num === upper)))) {
    throw new RangeError(
      numName + ' is ' + String(num) + ' but must be in the interval ' +
      (lowerClosed ? '[' : '(') + String(lower) + ',' + String(upper) +
      (upperClosed ? ']' : ')'));
  }
}

/**
 * Generate the motion for a point particle between two boundaries. If the
 * particle is given a velocity it will constantly accelerate in the opposite
 * direction to the velocity until the velocity reaches zero. If a boundary is
 * hit, the particle will rebound in the opposite direction.
 *
 * ## Motion Theory
 *
 * Whilst a particle is away from a boundary and has non-zero velocity it is
 * subject to a constant deceleration, with magnitude `a`. If the particle
 * starts this trajectory at time `0`, with initial position `x0` and velocity
 * `v0`, then at time `t` its velocity is
 *
 * ```
 *   v(t) = v0 - s0 * a * t ,
 * ```
 *
 * where `s0 = sign(v0)`. Its position from the earlier boundary is
 *
 * ```
 *   x(t) = x0 + v0 * t - (s0 * a * t * t) / 2
 *        = x0 + ((v0 + v(t)) * t) / 2 .
 * ```
 *
 * This quadratic trajectory end at the earliest `t = T` such that:
 *
 * + `x(T) = 0` or
 * + `x(T) = w` or
 * + `v(T) = 0`,
 *
 * where `w` is the width between the boundaries.
 *
 * In the first two cases, the particle will start a new quadratic trajectory
 * with velocity `v'` and position `x'` and time parameter `t'`, starting with:
 *
 * + `t' = 0`,
 * + `x'(0) = x0' = x(T)`,
 * + `v'(0) = v0' = r(v(T))` and
 *
 * where `r` is an antisymmetric rebound velocity function such that a negative
 * velocity `v` becomes a positive rebound velocity `r(v)`.
 *
 * In the latter case where `v(T) = 0` the subsequent velocity will be `0` and
 * the position will remain at `x(T)`.
 *
 * @public
 */
class BoundedMotion {
  /**
   * Create a new BoundedMotion instance. You will want to call
   * {@link BoundedMotion.setPos} and {@link BoundedMotion.setVel} to initialise
   * the motion.
   *
   * @param {number} upperPos - The position of the upper boundary (the lower
   * boundary is at 0). Must be positive (non-zero).
   * @param {number} halfReboundVel - A reference velocity magnitude for the
   * rebound velocity from a boundary. If the incoming velocity is equal to this
   * reference velocity in magnitude, it will rebound with half its velocity.
   * Higher velocities are reduced by more than half. Lower velocities are
   * reduced by less than half. Must be positive (non-zero) and finite.
   * @param {number} accel - The magnitude of the acceleration to apply. Must be
   * positive (non-zero) and finite.
   *
   * @return {BoundedMotion} A new BoundedMotion.
   * @property {number} pos The position of the particle. Call
   * {@link BoundedMotion#update} to update its value.
   * @property {number} vel The velocity of the particle. Call
   * {@link BoundedMotion#update} to update its value.
   *
   * @throws {RangeError} If parameters are out of bounds.
   */
  constructor (upperPos, halfReboundVel, accel) {
    checkRange('upperPos', upperPos, 0, false, Infinity, true);
    checkRange('halfReboundVel', halfReboundVel, 0, false, Infinity, false);
    checkRange('accel', accel, 0, false, Infinity, false);

    this._halfReboundVel = halfReboundVel;
    this._accel = accel;
    this._upperPos = upperPos;

    this._trajStartGlobalTime = undefined;
    this._initPos = NaN;
    this.pos = NaN;
    this._initVel = 0;
    this.vel = 0;
    Object.seal(this);
  }

  /**
   * Set the initial position of the particle.
   *
   * @param {number} initPos - The new position of the particle. Must be
   * between 0 and the upper boundary (inclusive).
   *
   * @throws {RangeError} If out of range.
   */
  setPos (initPos) {
    checkRange('initPos', initPos, 0, true, this._upperPos, true);
    this._initPos = initPos;
    this.pos = initPos;
  }

  /**
   * Set the initial velocity of the particle.
   *
   * @param {number} globalTime - The time for when the particle gained the
   * velocity. Must be finite.
   * @param {number} initVel - The new velocity of the particle. Must be
   * finite.
   *
   * @throws {RangeError} If not finite numbers.
   */
  setVel (globalTime, initVel) {
    checkRange('globalTime', globalTime, -Infinity, false, Infinity, false);
    checkRange('initVel', initVel, -Infinity, false, Infinity, false);
    this._trajStartGlobalTime = globalTime;
    this._initVel = initVel;
    this.vel = initVel;
  }

  /**
   * Get the velocity of the particle on a quadratic trajectory (no boundaries
   * and constant acceleration).
   *
   * @param {number} trajTime - The trajectory time `t` parameter along this
   * quadratic path.
   *
   * @return {number} The velocity `v(t)`.
   *
   * @private
   */
  _velAtTrajTime (trajTime) {
    /* constant deceleration until zero velocity */
    const initVel = this._initVel;
    if (initVel >= 0) {
      /* zero initVel will become zero or negative */
      return initVel - (this._accel * trajTime);
    } else {
      return initVel + (this._accel * trajTime);
    }
  }

  /**
   * Get the trajectory time at which the velocity would reach zero for the
   * particle on a quadratic trajectory (no boundaries).
   *
   * @return {number} The trajectory time `t` such that `v(t) = 0`.
   *
   * @private
   */
  _trajTimeAtStop () {
    return Math.abs(this._initVel) / this._accel;
  }

  /**
   * Get the rebound velocity after the particle hits a boundary.
   *
   * @param {number} vel - The incoming velocity `v`.
   *
   * @return {number} The outgoing velocity `r(v)`.
   *
   * @private
   */
  reboundVel (vel) {
    /* `r` must be antisymmetric and switch the sign of the incoming velocity,
     * so of the form
     *
     *   r(v) = - sign(v) f(abs(v))
     *
     * where `f` is a positive function with domain [0, inf) and f(0) = 0. We
     * want `f` to be monotonically increasing so larger velocity magnitudes
     * always return larger rebound velocity magnitudes. However, we want larger
     * velocities to drop by a larger proportion (a harder hit into the wall
     * will make the rebound less elastic). I.e. we want an `f` such that
     *
     *   v1 < v2  =>  f(v1) < f(v2)  and  (f(v1) / v1) > (f(v2) / v2) .
     *
     * The function
     *
     *   f(v) = v / (v / vH + 1) ,
     *
     * where `vH` is the velocity at which `f(v) = v / 2`, will satisfy these
     * conditions.
     */
    return -vel / ((Math.abs(vel) / this._halfReboundVel) + 1);
  }

  /**
   * Get the position of the particle on a quadratic trajectory (no boundaries
   * and constant acceleration).
   *
   * @param {number} trajTime - The trajectory time `t` parameter along this
   * quadratic path.
   * @param {number} vel - The velocity `v(t)`.
   *
   * @return {number} The position `x(t)`.
   *
   * @private
   */
  _posAtTrajTime (trajTime, vel) {
    return this._initPos + (((this._initVel + vel) / 2) * trajTime);
  }

  /**
   * Get the earlier trajectory time at which the position of the particle on a
   * quadratic trajectory (no boundaries and constant acceleration) would reach
   * the given displacement from its initial position.
   *
   * @param {number} disp - The displacement `d` from the initial position `x0`
   * in the direction of travel given by `v0`.
   *
   * @return {number} The trajectory time `t` such that
   * `x(t) = x0 + sign(v0) d`.
   *
   * @private
   */
  _trajTimeAtDisp (disp) {
    /* want to solve for `t` such that
     *
     *   x(t) = x0 + s0 D,
     *
     * where `D` is the displacement.
     *
     *   x0 + s0 D = x0 + v0 t - s0 a t^2 / 2
     *           0 = D - abs(v0) t + a t^2 / 2
     * =>
     *   t = (abs(v0) +- sqrt(v0^2 - 2 D a)) / a .
     *
     * Of these two roots, we choose the lower one (the later time refers to
     * the particle turning around). This value should be real provided the
     * particle can reach the given displacement
     */
    const initVel = this._initVel;
    const accel = this._accel;
    return (
      Math.abs(initVel) - Math.sqrt((initVel * initVel) - (2 * accel * disp))
    ) / accel;
  }

  /**
   * Update the {@link BoundedMotion#pos} and {@link BoundedMotion#vel} to
   * correspond to the motion of the particle at the given time.
   *
   * @param {number} globalTime - The new time for the particles motion. This
   * time is relative to the time given in {@link BoundedMotion#setVel}. This
   * must be larger than or equal to the time given in
   * {@link BoundedMotion#setVel} and all previous calls to
   * {@link BoundedMotion#update} since then (motion can only be calculated
   * forwards).
   *
   * @throws {RangeError} May be thrown if the given time is not later than the
   * previous given time.
   */
  update (globalTime) {
    let pos;
    let vel;
    /* time since the current quadratic trajectory began */
    let trajTime = globalTime - this._trajStartGlobalTime;
    if (!(trajTime >= 0.0)) {
      throw new RangeError(
        'globalTime ' + String(globalTime) + ' is not later than the ' +
        'trajStartGlobalTime of ' + String(this._trajStartGlobalTime));
    }
    let newTraj = true;
    while (newTraj === true) {
      newTraj = false;
      const initVel = this._initVel;
      const upperPos = this._upperPos;

      /* get the velocity at the current trajectory time *if* only experience
       * a constant acceleration */
      vel = this._velAtTrajTime(trajTime);
      if ((initVel >= 0 && vel < 0) || (initVel < 0 && vel > 0)) {
        /* velocity has changed sign:
         *   +ve -> -ve
         *   zero -> -ve
         *   -ve -> +ve
         * On a quadratic trajectory, the velocity changes monotonically. By
         * changing sign we know that the velocity will have reached zero. This
         * would have ended the current trajectory.
         *
         * Instead, to get the *current* position we need to actually go to the
         * earlier trajectory time `t` such that `v(t) = 0`. If we do not hit
         * a boundary then `t` gives the final movement time, after which the
         * position is constant, and _posAtTrajTime below would give this final
         * position. Otherwise, we would actually end earlier, but this new time
         * `t` will still ensure that, on the current quadratic trajectory, the
         * change in position is purely monotonic before this time `t`.
         */
        trajTime = this._trajTimeAtStop();
        vel = 0;
      }

      /* get the position we would be at *if* we only experienced a constant
       * acceleration */
      pos = this._posAtTrajTime(trajTime, vel);
      if (pos < 0 || pos > upperPos) {
        /* This check tells us that the particle would have met one of the
         * boundaries between the last update and now if we followed the current
         * quadratic trajectory.
         * Moreover, since the change in position along the quadratic trajectory
         * has been purely monotonic up to this time, if this check has failed,
         * we know that the particle did *not* hit a boundary (there is know
         * room for the particle crossing and coming back on itself). Therefore,
         * this check is both necessary and sufficient to know we have crossed
         * a boundary.
         */
        /* get the distance that would have been travelled until the boundary */
        let disp;
        if (pos < 0) {
          disp = this._initPos;
        } else {
          disp = upperPos - this._initPos;
        }
        /* get the time that the boundary was hit */
        let hitTime = this._trajTimeAtDisp(disp);
        if (!(hitTime >= 0.0 && hitTime <= trajTime)) {
          console.error('Unexpected boundary hit time of ' + String(hitTime) +
            'outside of the range [0,' + String(trajTime) + ']. Using a hit ' +
            'time of ' + String(trajTime) + ' instead');
          hitTime = trajTime;
        }
        /* get the velocity when the boundary was hit
         * since hitTime <= trajTime, hitVel should have the same sign as vel */
        const hitVel = this._velAtTrajTime(hitTime);

        /* start a new quadratic trajectory after rebound. This trajectory
         * starts globally at the hit time, with an initial position at the
         * boundary and an initial velocity given by the rebound */
        this._trajStartGlobalTime += hitTime;
        /* pass over the left over time to the new trajectory */
        trajTime -= hitTime;
        this._initVel = this.reboundVel(hitVel);
        if (pos < 0) {
          this._initPos = 0;
        } else {
          this._initPos = upperPos;
        }
        /* calculate the position using the new trajectory instead */
        newTraj = true;
      }
    }
    this.pos = pos;
    this.vel = vel;
  }
}

/**
 * A button that will try to move away from the mouse pointer.
 */
class MovingButton {
  /**
   * Create a new MovingButton.
   *
   * @param {Element} button - The button element that will move. This must be
   * positioned absolutely relative to its container. Its dimensions must
   * remain fixed.
   * @param {Element} container - The element that the button will be contained
   * within. It must be positioned and its dimensions must remain fixed,
   * including its border width.
   * @param {Element} trackingArea - The element that will track the mouse
   * movement of the user. This should cover the *container* area and must
   * remain fixed relative to it.
   *
   * @return {MovingButton} A new MovingButton.
   */
  constructor (button, container, trackingArea) {
    this._button = button;

    /* assume fixed border width of the container and fixed width and height
     * of the button and container */
    const bottomW = getBorderWidth(container, 'bottom');
    const topW = getBorderWidth(container, 'top');
    const leftW = getBorderWidth(container, 'left');
    const rightW = getBorderWidth(container, 'right');
    const rectBtn = button.getBoundingClientRect();
    const rectCont = container.getBoundingClientRect();

    const horzBound = Math.floor(
      rectCont.width - leftW - rightW - rectBtn.width);
    const vertBound = Math.floor(
      rectCont.height - topW - bottomW - rectBtn.height);

    this._setLeftPos(horzBound / 2);
    this._setTopPos(vertBound / 2);

    this._motionX = new BoundedMotion(horzBound, 1000, 25);
    this._motionY = new BoundedMotion(vertBound, 1000, 25);
    this._motionX.setPos(this._leftPos);
    this._motionY.setPos(this._topPos);
    this._motionIntervalID = undefined;

    this._thickner = 2;
    this._hitWidth = rectBtn.width + (2 * this._thickner);
    this._hitHeight = rectBtn.height + (2 * this._thickner);
    this._hit = false;
    this._hitImmune = false;

    this._mouseTracker = new MouseTracker(
      trackingArea, container, this._detectHit.bind(this));

    this._alertTimeoutID = undefined;
    this._button.addEventListener('click', this._clicked.bind(this));

    /* shiny to tempt the user! */
    this._button.classList.add('shiny');

    Object.seal(this);
  }

  _alertEnd () {
    if (this._button.classList.contains('alert')) {
      this._button.classList.remove('alert');
      this._button.classList.add('alert-fade');
    }
    this._alertTimeoutID = undefined;
    this._hitImmune = false;
  }

  _getUnitVecAwayFrom (posX, posY) {
    let mag = Math.sqrt((posX * posX) + (posY * posY));
    if (!(mag > 0)) {
      /* choose a random direction */
      const ang = Math.random() * 2 * Math.PI;
      posX = Math.cos(ang);
      posY = Math.sin(ang);
      mag = 1;
    }
    return { x: -(posX / mag), y: -(posY / mag) };
  }

  _clicked (ev) {
    const rect = this._button.getBoundingClientRect();
    const thickner = this._thickner;
    /* mouse position relative to the centre of the thickened area of the
     * button */
    let posX;
    let posY;
    if (ev.clientX === 0 && ev.clientY === 0) {
      /* assume this means that the event was triggered by a non-pointer click
       * (such as 'Enter' when in focus). This can technically be triggered by a
       * pointer click, but this is rare and the consequences are not that bad
       * (the button will go in a random direction, rather than away from the
       * pointer */
      posX = 0;
      posY = 0;
    } else {
      posX = (ev.clientX - rect.x + thickner) - (this._hitWidth / 2);
      posY = (ev.clientY - rect.y + thickner) - (this._hitHeight / 2);
    }

    const vec = this._getUnitVecAwayFrom(posX, posY);

    /* make immune to being hit so it can escape */
    this._hitImmune = true;
    /* move away from the mouse */
    this._giveVel(4000 * vec.x, 4000 * vec.y, Date.now());

    if (this._alertTimeoutID !== undefined) {
      clearTimeout(this._alertTimeoutID);
    }
    /* on alert */
    this._button.classList.remove('alert-fade');
    this._button.classList.add('alert');
    this._alertTimeoutID = setTimeout(this._alertEnd.bind(this), 1000);
  }

  _entrySides (x, y, vX, vY) {
    if (vX === 0 || vY === 0) {
      return { horizontal: (vY === 0), vertical: (vX === 0) };
    }
    /* compare the ratios
     *
     *   abs(vY / vX)  and  dY / dX
     *
     * where vY and vX are the current mouse velocities in the frame of the
     * button, and
     *
     *   dX = x           if vX > 0 , and
     *        width - x   otherwise.
     *   dY = y           if vY > 0, and
     *        height - y  otherwise.
     *
     * dX and dY are meant to capture the distance travelled into the button
     * from their entry edge. So when vX > 0 this is the distance from the left
     * edge, and this is the distance from the right edge otherwise.
     *
     * We then want to compare the velocity vector to the vector from the
     * mouse position to the corresponding corner of the button.
     *
     *                               *
     *  +-----------------+         *'
     *  |       '       * |        * '                      *
     *  |       '     *   |       *  ' vY               *   '
     *  |    dY '   *     |      *   '              *       ' vY
     *  |       ' *       |     *    '          *           '
     *  y       o - - - - |    o - - +      o - - - - - - - +
     *  |           dX    |       vx                vX
     *  |                 |
     *  +-------x---------+      vel1              vel2
     *        buttton
     *
     * If
     *
     *        dY / dX  <  abs(vY / vX)
     * <=>
     *   abs(vX) * dY  <  abs(vY) * dX
     *
     * then the inbound velocity was steeper than the line between the mouse and
     * the corner. Therefore, we can guess that the mouse entered through the
     * top side (vel1). Otherwise, if the ratios are equal, we know it went
     * through the top right corner. Otherwise, if the left hand side is
     * greater than the right hand side, then the inbound velocity was shallower
     * so we can guess that the mouse entered through the right side (vel2).
     *
     * More generally, with
     *
     *   lhs = abs(vX) * dY , and
     *   rhs = abs(vY) * dX ,
     *
     *   lhs < rhs  =>  vertical edge
     *   lhs > rhs  =>  horizontal edge
     *   lhs = rhs  =>  corner
     */
    const lhs = Math.abs(vX) * ((vY > 0) ? y : (this._hitHeight - y));
    const rhs = Math.abs(vY) * ((vX > 0) ? x : (this._hitWidth - x));
    return { horizontal: (lhs >= rhs), vertical: (lhs <= rhs) };
  }

  _minVel (vel) {
    const min = 20;
    if (Math.abs(vel) < min) {
      if (vel === 0) {
        return 0;
      } else if (vel > 0) {
        return min;
      } else {
        return -min;
      }
    }
    return vel;
  }

  _detectHit () {
    const mouseTracker = this._mouseTracker;
    const thickner = this._thickner;
    /* convert the mouse coordinates from the coordinates of the container to
     * the coordinates of the button's hit area
     * note, posY or posX may be undefined, giving NaN */
    const mouseY = mouseTracker.posY() - this._topPos + thickner;
    const mouseX = mouseTracker.posX() - this._leftPos + thickner;

    const hit = (this._hitImmune === false && mouseY >= 0 && mouseX >= 0 &&
      mouseY <= this._hitHeight && mouseX <= this._hitWidth);

    if (!this._hit && hit) {
      const now = Date.now();
      const motionX = this._motionX;
      const motionY = this._motionY;

      const mouseVelX = this._mouseTracker.velX(now);
      const mouseVelY = this._mouseTracker.velY(now);

      /* mouse velocity in the frame of the button */
      const relVelX = mouseVelX - motionX.vel;
      const relVelY = mouseVelY - motionY.vel;

      const entry = this._entrySides(mouseX, mouseY, relVelX, relVelY);

      let velX;
      let velY;
      if (entry.horizontal === true) {
        /* convert the button's velocity to the frame of the mouse (this is
         * minus the mouse velocity in the frame of the button), do the rebound,
         * then convert to the frame of the container (+ mouseVelX) */
        velX = motionX.reboundVel(-relVelX) + mouseVelX;
      } else {
        /* pick up half the mouse's velocity through friction */
        velX = motionX.vel + (mouseVelX / 2);
      }
      if (entry.vertical === true) {
        velY = motionY.reboundVel(-relVelY) + mouseVelY;
      } else {
        velY = motionY.vel + (mouseVelY / 2);
      }

      velX = this._minVel(velX);
      velY = this._minVel(velY);
      const min = 30;
      const mag = Math.sqrt((velX * velX) + (velY * velY));
      if (!(mag >= min)) {
        if (!(mag > 0)) {
          /* move away from the mouse, relative to the center */
          const halfWidth = (this._hitWidth / 2);
          const halfHeight = (this._hitHeight / 2);
          const posX = mouseX - halfWidth;
          const posY = mouseY - halfHeight;
          const vec = this._getUnitVecAwayFrom(posX, posY);
          /* depth from center to corner that we are moving away from */
          const depthX = halfWidth - Math.abs(posX);
          const depthY = halfHeight - Math.abs(posY);
          const depth = Math.sqrt((depthX * depthX) + (depthY * depthY));
          /* velocity magnitude, either the min or leave the area in 0.1
           * seconds */
          const vel = Math.max(min, depth * 10);
          velX = vel * vec.x;
          velY = vel * vec.y;
        } else {
          /* boost to min */
          velX *= (min / mag);
          velY *= (min / mag);
        }
      }

      this._giveVel(velX, velY, now);
    }
    this._hit = hit;
  }

  _setLeftPos (leftPos) {
    leftPos = Math.round(leftPos);
    this._leftPos = leftPos;
    this._button.style.left = String(leftPos) + 'px';
  }

  _setTopPos (topPos) {
    topPos = Math.round(topPos);
    this._topPos = topPos;
    this._button.style.top = String(topPos) + 'px';
  }

  _updateMotion () {
    const globalTime = Date.now() / 1000;
    const motionX = this._motionX;
    const motionY = this._motionY;

    if (motionX.vel !== 0) {
      motionX.update(globalTime);
      this._setLeftPos(motionX.pos);
    }
    if (motionY.vel !== 0) {
      motionY.update(globalTime);
      this._setTopPos(motionY.pos);
    }

    if (motionX.vel === 0 && motionY.vel === 0) {
      clearInterval(this._motionIntervalID);
      this._motionIntervalID = undefined;
      /* when the button stops moving, go shiny again */
      this._button.classList.remove('alert-fade');
      this._button.classList.add('shiny');
    }

    this._detectHit();
  }

  _giveVel (velX, velY, now) {
    const globalTime = now / 1000;
    const motionX = this._motionX;
    const motionY = this._motionY;
    /* use the pixel positions, rather than the calculated position of the
     * motion */
    motionX.setPos(this._leftPos);
    motionY.setPos(this._topPos);
    motionX.setVel(globalTime, velX);
    motionY.setVel(globalTime, velY);

    if (this._motionIntervalID !== undefined) {
      clearInterval(this._motionIntervalID);
    }

    /* stop being shiny when we move */
    this._button.classList.remove('shiny');
    this._motionIntervalID = setInterval(this._updateMotion.bind(this), 10);
  }
}

{
  function getEl (id) {
    const el = document.getElementById(id);
    if (el === null) {
      throw new Error('Missing element with id "' + id + '"');
    }
    return el;
  }

  const button = getEl('button');
  const container = getEl('play-area');
  const mouseArea = getEl('mouse-area');

  /* remove the invisibility styling */
  mouseArea.removeAttribute('style');

  const buttonRect = button.getBoundingClientRect();
  /* use the body width rather than the window width */
  const displayWidth = getStyleLength(document.body, 'width');
  const margins = getStyleLength(container, 'margin-left') +
    getStyleLength(container, 'margin-right');
  let len = Math.max(
    Math.max(buttonRect.width, buttonRect.height) * 3,
    Math.min(window.innerHeight * 0.7, (displayWidth * 0.7) - margins));

  len = String(len) + 'px';
  container.style.height = len;
  container.style.width = len;

  const movingButton = new MovingButton(button, container, mouseArea);
}
