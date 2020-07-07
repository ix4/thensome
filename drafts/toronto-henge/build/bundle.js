var app = (function () {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.22.3' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    // Adds floating point numbers with twice the normal precision.
    // Reference: J. R. Shewchuk, Adaptive Precision Floating-Point Arithmetic and
    // Fast Robust Geometric Predicates, Discrete & Computational Geometry 18(3)
    // 305–363 (1997).
    // Code adapted from GeographicLib by Charles F. F. Karney,
    // http://geographiclib.sourceforge.net/

    function adder() {
      return new Adder;
    }

    function Adder() {
      this.reset();
    }

    Adder.prototype = {
      constructor: Adder,
      reset: function() {
        this.s = // rounded value
        this.t = 0; // exact error
      },
      add: function(y) {
        add(temp, y, this.t);
        add(this, temp.s, this.s);
        if (this.s) this.t += temp.t;
        else this.s = temp.t;
      },
      valueOf: function() {
        return this.s;
      }
    };

    var temp = new Adder;

    function add(adder, a, b) {
      var x = adder.s = a + b,
          bv = x - a,
          av = x - bv;
      adder.t = (a - av) + (b - bv);
    }

    var epsilon = 1e-6;
    var epsilon2 = 1e-12;
    var pi = Math.PI;
    var halfPi = pi / 2;
    var quarterPi = pi / 4;
    var tau = pi * 2;

    var degrees = 180 / pi;
    var radians = pi / 180;

    var abs = Math.abs;
    var atan = Math.atan;
    var atan2 = Math.atan2;
    var cos = Math.cos;
    var ceil = Math.ceil;
    var exp = Math.exp;
    var log = Math.log;
    var pow = Math.pow;
    var sin = Math.sin;
    var sign = Math.sign || function(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; };
    var sqrt = Math.sqrt;
    var tan = Math.tan;

    function acos(x) {
      return x > 1 ? 0 : x < -1 ? pi : Math.acos(x);
    }

    function asin(x) {
      return x > 1 ? halfPi : x < -1 ? -halfPi : Math.asin(x);
    }

    function haversin(x) {
      return (x = sin(x / 2)) * x;
    }

    function noop$1() {}

    function streamGeometry(geometry, stream) {
      if (geometry && streamGeometryType.hasOwnProperty(geometry.type)) {
        streamGeometryType[geometry.type](geometry, stream);
      }
    }

    var streamObjectType = {
      Feature: function(object, stream) {
        streamGeometry(object.geometry, stream);
      },
      FeatureCollection: function(object, stream) {
        var features = object.features, i = -1, n = features.length;
        while (++i < n) streamGeometry(features[i].geometry, stream);
      }
    };

    var streamGeometryType = {
      Sphere: function(object, stream) {
        stream.sphere();
      },
      Point: function(object, stream) {
        object = object.coordinates;
        stream.point(object[0], object[1], object[2]);
      },
      MultiPoint: function(object, stream) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) object = coordinates[i], stream.point(object[0], object[1], object[2]);
      },
      LineString: function(object, stream) {
        streamLine(object.coordinates, stream, 0);
      },
      MultiLineString: function(object, stream) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) streamLine(coordinates[i], stream, 0);
      },
      Polygon: function(object, stream) {
        streamPolygon(object.coordinates, stream);
      },
      MultiPolygon: function(object, stream) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) streamPolygon(coordinates[i], stream);
      },
      GeometryCollection: function(object, stream) {
        var geometries = object.geometries, i = -1, n = geometries.length;
        while (++i < n) streamGeometry(geometries[i], stream);
      }
    };

    function streamLine(coordinates, stream, closed) {
      var i = -1, n = coordinates.length - closed, coordinate;
      stream.lineStart();
      while (++i < n) coordinate = coordinates[i], stream.point(coordinate[0], coordinate[1], coordinate[2]);
      stream.lineEnd();
    }

    function streamPolygon(coordinates, stream) {
      var i = -1, n = coordinates.length;
      stream.polygonStart();
      while (++i < n) streamLine(coordinates[i], stream, 1);
      stream.polygonEnd();
    }

    function geoStream(object, stream) {
      if (object && streamObjectType.hasOwnProperty(object.type)) {
        streamObjectType[object.type](object, stream);
      } else {
        streamGeometry(object, stream);
      }
    }

    var areaRingSum = adder();

    var areaSum = adder(),
        lambda00,
        phi00,
        lambda0,
        cosPhi0,
        sinPhi0;

    var areaStream = {
      point: noop$1,
      lineStart: noop$1,
      lineEnd: noop$1,
      polygonStart: function() {
        areaRingSum.reset();
        areaStream.lineStart = areaRingStart;
        areaStream.lineEnd = areaRingEnd;
      },
      polygonEnd: function() {
        var areaRing = +areaRingSum;
        areaSum.add(areaRing < 0 ? tau + areaRing : areaRing);
        this.lineStart = this.lineEnd = this.point = noop$1;
      },
      sphere: function() {
        areaSum.add(tau);
      }
    };

    function areaRingStart() {
      areaStream.point = areaPointFirst;
    }

    function areaRingEnd() {
      areaPoint(lambda00, phi00);
    }

    function areaPointFirst(lambda, phi) {
      areaStream.point = areaPoint;
      lambda00 = lambda, phi00 = phi;
      lambda *= radians, phi *= radians;
      lambda0 = lambda, cosPhi0 = cos(phi = phi / 2 + quarterPi), sinPhi0 = sin(phi);
    }

    function areaPoint(lambda, phi) {
      lambda *= radians, phi *= radians;
      phi = phi / 2 + quarterPi; // half the angular distance from south pole

      // Spherical excess E for a spherical triangle with vertices: south pole,
      // previous point, current point.  Uses a formula derived from Cagnoli’s
      // theorem.  See Todhunter, Spherical Trig. (1871), Sec. 103, Eq. (2).
      var dLambda = lambda - lambda0,
          sdLambda = dLambda >= 0 ? 1 : -1,
          adLambda = sdLambda * dLambda,
          cosPhi = cos(phi),
          sinPhi = sin(phi),
          k = sinPhi0 * sinPhi,
          u = cosPhi0 * cosPhi + k * cos(adLambda),
          v = k * sdLambda * sin(adLambda);
      areaRingSum.add(atan2(v, u));

      // Advance the previous points.
      lambda0 = lambda, cosPhi0 = cosPhi, sinPhi0 = sinPhi;
    }

    function area(object) {
      areaSum.reset();
      geoStream(object, areaStream);
      return areaSum * 2;
    }

    function spherical(cartesian) {
      return [atan2(cartesian[1], cartesian[0]), asin(cartesian[2])];
    }

    function cartesian(spherical) {
      var lambda = spherical[0], phi = spherical[1], cosPhi = cos(phi);
      return [cosPhi * cos(lambda), cosPhi * sin(lambda), sin(phi)];
    }

    function cartesianDot(a, b) {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }

    function cartesianCross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    // TODO return a
    function cartesianAddInPlace(a, b) {
      a[0] += b[0], a[1] += b[1], a[2] += b[2];
    }

    function cartesianScale(vector, k) {
      return [vector[0] * k, vector[1] * k, vector[2] * k];
    }

    // TODO return d
    function cartesianNormalizeInPlace(d) {
      var l = sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      d[0] /= l, d[1] /= l, d[2] /= l;
    }

    var lambda0$1, phi0, lambda1, phi1, // bounds
        lambda2, // previous lambda-coordinate
        lambda00$1, phi00$1, // first point
        p0, // previous 3D point
        deltaSum = adder(),
        ranges,
        range;

    var boundsStream = {
      point: boundsPoint,
      lineStart: boundsLineStart,
      lineEnd: boundsLineEnd,
      polygonStart: function() {
        boundsStream.point = boundsRingPoint;
        boundsStream.lineStart = boundsRingStart;
        boundsStream.lineEnd = boundsRingEnd;
        deltaSum.reset();
        areaStream.polygonStart();
      },
      polygonEnd: function() {
        areaStream.polygonEnd();
        boundsStream.point = boundsPoint;
        boundsStream.lineStart = boundsLineStart;
        boundsStream.lineEnd = boundsLineEnd;
        if (areaRingSum < 0) lambda0$1 = -(lambda1 = 180), phi0 = -(phi1 = 90);
        else if (deltaSum > epsilon) phi1 = 90;
        else if (deltaSum < -epsilon) phi0 = -90;
        range[0] = lambda0$1, range[1] = lambda1;
      },
      sphere: function() {
        lambda0$1 = -(lambda1 = 180), phi0 = -(phi1 = 90);
      }
    };

    function boundsPoint(lambda, phi) {
      ranges.push(range = [lambda0$1 = lambda, lambda1 = lambda]);
      if (phi < phi0) phi0 = phi;
      if (phi > phi1) phi1 = phi;
    }

    function linePoint(lambda, phi) {
      var p = cartesian([lambda * radians, phi * radians]);
      if (p0) {
        var normal = cartesianCross(p0, p),
            equatorial = [normal[1], -normal[0], 0],
            inflection = cartesianCross(equatorial, normal);
        cartesianNormalizeInPlace(inflection);
        inflection = spherical(inflection);
        var delta = lambda - lambda2,
            sign = delta > 0 ? 1 : -1,
            lambdai = inflection[0] * degrees * sign,
            phii,
            antimeridian = abs(delta) > 180;
        if (antimeridian ^ (sign * lambda2 < lambdai && lambdai < sign * lambda)) {
          phii = inflection[1] * degrees;
          if (phii > phi1) phi1 = phii;
        } else if (lambdai = (lambdai + 360) % 360 - 180, antimeridian ^ (sign * lambda2 < lambdai && lambdai < sign * lambda)) {
          phii = -inflection[1] * degrees;
          if (phii < phi0) phi0 = phii;
        } else {
          if (phi < phi0) phi0 = phi;
          if (phi > phi1) phi1 = phi;
        }
        if (antimeridian) {
          if (lambda < lambda2) {
            if (angle(lambda0$1, lambda) > angle(lambda0$1, lambda1)) lambda1 = lambda;
          } else {
            if (angle(lambda, lambda1) > angle(lambda0$1, lambda1)) lambda0$1 = lambda;
          }
        } else {
          if (lambda1 >= lambda0$1) {
            if (lambda < lambda0$1) lambda0$1 = lambda;
            if (lambda > lambda1) lambda1 = lambda;
          } else {
            if (lambda > lambda2) {
              if (angle(lambda0$1, lambda) > angle(lambda0$1, lambda1)) lambda1 = lambda;
            } else {
              if (angle(lambda, lambda1) > angle(lambda0$1, lambda1)) lambda0$1 = lambda;
            }
          }
        }
      } else {
        ranges.push(range = [lambda0$1 = lambda, lambda1 = lambda]);
      }
      if (phi < phi0) phi0 = phi;
      if (phi > phi1) phi1 = phi;
      p0 = p, lambda2 = lambda;
    }

    function boundsLineStart() {
      boundsStream.point = linePoint;
    }

    function boundsLineEnd() {
      range[0] = lambda0$1, range[1] = lambda1;
      boundsStream.point = boundsPoint;
      p0 = null;
    }

    function boundsRingPoint(lambda, phi) {
      if (p0) {
        var delta = lambda - lambda2;
        deltaSum.add(abs(delta) > 180 ? delta + (delta > 0 ? 360 : -360) : delta);
      } else {
        lambda00$1 = lambda, phi00$1 = phi;
      }
      areaStream.point(lambda, phi);
      linePoint(lambda, phi);
    }

    function boundsRingStart() {
      areaStream.lineStart();
    }

    function boundsRingEnd() {
      boundsRingPoint(lambda00$1, phi00$1);
      areaStream.lineEnd();
      if (abs(deltaSum) > epsilon) lambda0$1 = -(lambda1 = 180);
      range[0] = lambda0$1, range[1] = lambda1;
      p0 = null;
    }

    // Finds the left-right distance between two longitudes.
    // This is almost the same as (lambda1 - lambda0 + 360°) % 360°, except that we want
    // the distance between ±180° to be 360°.
    function angle(lambda0, lambda1) {
      return (lambda1 -= lambda0) < 0 ? lambda1 + 360 : lambda1;
    }

    function rangeCompare(a, b) {
      return a[0] - b[0];
    }

    function rangeContains(range, x) {
      return range[0] <= range[1] ? range[0] <= x && x <= range[1] : x < range[0] || range[1] < x;
    }

    function bounds(feature) {
      var i, n, a, b, merged, deltaMax, delta;

      phi1 = lambda1 = -(lambda0$1 = phi0 = Infinity);
      ranges = [];
      geoStream(feature, boundsStream);

      // First, sort ranges by their minimum longitudes.
      if (n = ranges.length) {
        ranges.sort(rangeCompare);

        // Then, merge any ranges that overlap.
        for (i = 1, a = ranges[0], merged = [a]; i < n; ++i) {
          b = ranges[i];
          if (rangeContains(a, b[0]) || rangeContains(a, b[1])) {
            if (angle(a[0], b[1]) > angle(a[0], a[1])) a[1] = b[1];
            if (angle(b[0], a[1]) > angle(a[0], a[1])) a[0] = b[0];
          } else {
            merged.push(a = b);
          }
        }

        // Finally, find the largest gap between the merged ranges.
        // The final bounding box will be the inverse of this gap.
        for (deltaMax = -Infinity, n = merged.length - 1, i = 0, a = merged[n]; i <= n; a = b, ++i) {
          b = merged[i];
          if ((delta = angle(a[1], b[0])) > deltaMax) deltaMax = delta, lambda0$1 = b[0], lambda1 = a[1];
        }
      }

      ranges = range = null;

      return lambda0$1 === Infinity || phi0 === Infinity
          ? [[NaN, NaN], [NaN, NaN]]
          : [[lambda0$1, phi0], [lambda1, phi1]];
    }

    var W0, W1,
        X0, Y0, Z0,
        X1, Y1, Z1,
        X2, Y2, Z2,
        lambda00$2, phi00$2, // first point
        x0, y0, z0; // previous point

    var centroidStream = {
      sphere: noop$1,
      point: centroidPoint,
      lineStart: centroidLineStart,
      lineEnd: centroidLineEnd,
      polygonStart: function() {
        centroidStream.lineStart = centroidRingStart;
        centroidStream.lineEnd = centroidRingEnd;
      },
      polygonEnd: function() {
        centroidStream.lineStart = centroidLineStart;
        centroidStream.lineEnd = centroidLineEnd;
      }
    };

    // Arithmetic mean of Cartesian vectors.
    function centroidPoint(lambda, phi) {
      lambda *= radians, phi *= radians;
      var cosPhi = cos(phi);
      centroidPointCartesian(cosPhi * cos(lambda), cosPhi * sin(lambda), sin(phi));
    }

    function centroidPointCartesian(x, y, z) {
      ++W0;
      X0 += (x - X0) / W0;
      Y0 += (y - Y0) / W0;
      Z0 += (z - Z0) / W0;
    }

    function centroidLineStart() {
      centroidStream.point = centroidLinePointFirst;
    }

    function centroidLinePointFirst(lambda, phi) {
      lambda *= radians, phi *= radians;
      var cosPhi = cos(phi);
      x0 = cosPhi * cos(lambda);
      y0 = cosPhi * sin(lambda);
      z0 = sin(phi);
      centroidStream.point = centroidLinePoint;
      centroidPointCartesian(x0, y0, z0);
    }

    function centroidLinePoint(lambda, phi) {
      lambda *= radians, phi *= radians;
      var cosPhi = cos(phi),
          x = cosPhi * cos(lambda),
          y = cosPhi * sin(lambda),
          z = sin(phi),
          w = atan2(sqrt((w = y0 * z - z0 * y) * w + (w = z0 * x - x0 * z) * w + (w = x0 * y - y0 * x) * w), x0 * x + y0 * y + z0 * z);
      W1 += w;
      X1 += w * (x0 + (x0 = x));
      Y1 += w * (y0 + (y0 = y));
      Z1 += w * (z0 + (z0 = z));
      centroidPointCartesian(x0, y0, z0);
    }

    function centroidLineEnd() {
      centroidStream.point = centroidPoint;
    }

    // See J. E. Brock, The Inertia Tensor for a Spherical Triangle,
    // J. Applied Mechanics 42, 239 (1975).
    function centroidRingStart() {
      centroidStream.point = centroidRingPointFirst;
    }

    function centroidRingEnd() {
      centroidRingPoint(lambda00$2, phi00$2);
      centroidStream.point = centroidPoint;
    }

    function centroidRingPointFirst(lambda, phi) {
      lambda00$2 = lambda, phi00$2 = phi;
      lambda *= radians, phi *= radians;
      centroidStream.point = centroidRingPoint;
      var cosPhi = cos(phi);
      x0 = cosPhi * cos(lambda);
      y0 = cosPhi * sin(lambda);
      z0 = sin(phi);
      centroidPointCartesian(x0, y0, z0);
    }

    function centroidRingPoint(lambda, phi) {
      lambda *= radians, phi *= radians;
      var cosPhi = cos(phi),
          x = cosPhi * cos(lambda),
          y = cosPhi * sin(lambda),
          z = sin(phi),
          cx = y0 * z - z0 * y,
          cy = z0 * x - x0 * z,
          cz = x0 * y - y0 * x,
          m = sqrt(cx * cx + cy * cy + cz * cz),
          w = asin(m), // line weight = angle
          v = m && -w / m; // area weight multiplier
      X2 += v * cx;
      Y2 += v * cy;
      Z2 += v * cz;
      W1 += w;
      X1 += w * (x0 + (x0 = x));
      Y1 += w * (y0 + (y0 = y));
      Z1 += w * (z0 + (z0 = z));
      centroidPointCartesian(x0, y0, z0);
    }

    function centroid(object) {
      W0 = W1 =
      X0 = Y0 = Z0 =
      X1 = Y1 = Z1 =
      X2 = Y2 = Z2 = 0;
      geoStream(object, centroidStream);

      var x = X2,
          y = Y2,
          z = Z2,
          m = x * x + y * y + z * z;

      // If the area-weighted ccentroid is undefined, fall back to length-weighted ccentroid.
      if (m < epsilon2) {
        x = X1, y = Y1, z = Z1;
        // If the feature has zero length, fall back to arithmetic mean of point vectors.
        if (W1 < epsilon) x = X0, y = Y0, z = Z0;
        m = x * x + y * y + z * z;
        // If the feature still has an undefined ccentroid, then return.
        if (m < epsilon2) return [NaN, NaN];
      }

      return [atan2(y, x) * degrees, asin(z / sqrt(m)) * degrees];
    }

    function constant(x) {
      return function() {
        return x;
      };
    }

    function compose(a, b) {

      function compose(x, y) {
        return x = a(x, y), b(x[0], x[1]);
      }

      if (a.invert && b.invert) compose.invert = function(x, y) {
        return x = b.invert(x, y), x && a.invert(x[0], x[1]);
      };

      return compose;
    }

    function rotationIdentity(lambda, phi) {
      return [abs(lambda) > pi ? lambda + Math.round(-lambda / tau) * tau : lambda, phi];
    }

    rotationIdentity.invert = rotationIdentity;

    function rotateRadians(deltaLambda, deltaPhi, deltaGamma) {
      return (deltaLambda %= tau) ? (deltaPhi || deltaGamma ? compose(rotationLambda(deltaLambda), rotationPhiGamma(deltaPhi, deltaGamma))
        : rotationLambda(deltaLambda))
        : (deltaPhi || deltaGamma ? rotationPhiGamma(deltaPhi, deltaGamma)
        : rotationIdentity);
    }

    function forwardRotationLambda(deltaLambda) {
      return function(lambda, phi) {
        return lambda += deltaLambda, [lambda > pi ? lambda - tau : lambda < -pi ? lambda + tau : lambda, phi];
      };
    }

    function rotationLambda(deltaLambda) {
      var rotation = forwardRotationLambda(deltaLambda);
      rotation.invert = forwardRotationLambda(-deltaLambda);
      return rotation;
    }

    function rotationPhiGamma(deltaPhi, deltaGamma) {
      var cosDeltaPhi = cos(deltaPhi),
          sinDeltaPhi = sin(deltaPhi),
          cosDeltaGamma = cos(deltaGamma),
          sinDeltaGamma = sin(deltaGamma);

      function rotation(lambda, phi) {
        var cosPhi = cos(phi),
            x = cos(lambda) * cosPhi,
            y = sin(lambda) * cosPhi,
            z = sin(phi),
            k = z * cosDeltaPhi + x * sinDeltaPhi;
        return [
          atan2(y * cosDeltaGamma - k * sinDeltaGamma, x * cosDeltaPhi - z * sinDeltaPhi),
          asin(k * cosDeltaGamma + y * sinDeltaGamma)
        ];
      }

      rotation.invert = function(lambda, phi) {
        var cosPhi = cos(phi),
            x = cos(lambda) * cosPhi,
            y = sin(lambda) * cosPhi,
            z = sin(phi),
            k = z * cosDeltaGamma - y * sinDeltaGamma;
        return [
          atan2(y * cosDeltaGamma + z * sinDeltaGamma, x * cosDeltaPhi + k * sinDeltaPhi),
          asin(k * cosDeltaPhi - x * sinDeltaPhi)
        ];
      };

      return rotation;
    }

    function rotation(rotate) {
      rotate = rotateRadians(rotate[0] * radians, rotate[1] * radians, rotate.length > 2 ? rotate[2] * radians : 0);

      function forward(coordinates) {
        coordinates = rotate(coordinates[0] * radians, coordinates[1] * radians);
        return coordinates[0] *= degrees, coordinates[1] *= degrees, coordinates;
      }

      forward.invert = function(coordinates) {
        coordinates = rotate.invert(coordinates[0] * radians, coordinates[1] * radians);
        return coordinates[0] *= degrees, coordinates[1] *= degrees, coordinates;
      };

      return forward;
    }

    // Generates a circle centered at [0°, 0°], with a given radius and precision.
    function circleStream(stream, radius, delta, direction, t0, t1) {
      if (!delta) return;
      var cosRadius = cos(radius),
          sinRadius = sin(radius),
          step = direction * delta;
      if (t0 == null) {
        t0 = radius + direction * tau;
        t1 = radius - step / 2;
      } else {
        t0 = circleRadius(cosRadius, t0);
        t1 = circleRadius(cosRadius, t1);
        if (direction > 0 ? t0 < t1 : t0 > t1) t0 += direction * tau;
      }
      for (var point, t = t0; direction > 0 ? t > t1 : t < t1; t -= step) {
        point = spherical([cosRadius, -sinRadius * cos(t), -sinRadius * sin(t)]);
        stream.point(point[0], point[1]);
      }
    }

    // Returns the signed angle of a cartesian point relative to [cosRadius, 0, 0].
    function circleRadius(cosRadius, point) {
      point = cartesian(point), point[0] -= cosRadius;
      cartesianNormalizeInPlace(point);
      var radius = acos(-point[1]);
      return ((-point[2] < 0 ? -radius : radius) + tau - epsilon) % tau;
    }

    function circle() {
      var center = constant([0, 0]),
          radius = constant(90),
          precision = constant(6),
          ring,
          rotate,
          stream = {point: point};

      function point(x, y) {
        ring.push(x = rotate(x, y));
        x[0] *= degrees, x[1] *= degrees;
      }

      function circle() {
        var c = center.apply(this, arguments),
            r = radius.apply(this, arguments) * radians,
            p = precision.apply(this, arguments) * radians;
        ring = [];
        rotate = rotateRadians(-c[0] * radians, -c[1] * radians, 0).invert;
        circleStream(stream, r, p, 1);
        c = {type: "Polygon", coordinates: [ring]};
        ring = rotate = null;
        return c;
      }

      circle.center = function(_) {
        return arguments.length ? (center = typeof _ === "function" ? _ : constant([+_[0], +_[1]]), circle) : center;
      };

      circle.radius = function(_) {
        return arguments.length ? (radius = typeof _ === "function" ? _ : constant(+_), circle) : radius;
      };

      circle.precision = function(_) {
        return arguments.length ? (precision = typeof _ === "function" ? _ : constant(+_), circle) : precision;
      };

      return circle;
    }

    function clipBuffer() {
      var lines = [],
          line;
      return {
        point: function(x, y) {
          line.push([x, y]);
        },
        lineStart: function() {
          lines.push(line = []);
        },
        lineEnd: noop$1,
        rejoin: function() {
          if (lines.length > 1) lines.push(lines.pop().concat(lines.shift()));
        },
        result: function() {
          var result = lines;
          lines = [];
          line = null;
          return result;
        }
      };
    }

    function pointEqual(a, b) {
      return abs(a[0] - b[0]) < epsilon && abs(a[1] - b[1]) < epsilon;
    }

    function Intersection(point, points, other, entry) {
      this.x = point;
      this.z = points;
      this.o = other; // another intersection
      this.e = entry; // is an entry?
      this.v = false; // visited
      this.n = this.p = null; // next & previous
    }

    // A generalized polygon clipping algorithm: given a polygon that has been cut
    // into its visible line segments, and rejoins the segments by interpolating
    // along the clip edge.
    function clipRejoin(segments, compareIntersection, startInside, interpolate, stream) {
      var subject = [],
          clip = [],
          i,
          n;

      segments.forEach(function(segment) {
        if ((n = segment.length - 1) <= 0) return;
        var n, p0 = segment[0], p1 = segment[n], x;

        // If the first and last points of a segment are coincident, then treat as a
        // closed ring. TODO if all rings are closed, then the winding order of the
        // exterior ring should be checked.
        if (pointEqual(p0, p1)) {
          stream.lineStart();
          for (i = 0; i < n; ++i) stream.point((p0 = segment[i])[0], p0[1]);
          stream.lineEnd();
          return;
        }

        subject.push(x = new Intersection(p0, segment, null, true));
        clip.push(x.o = new Intersection(p0, null, x, false));
        subject.push(x = new Intersection(p1, segment, null, false));
        clip.push(x.o = new Intersection(p1, null, x, true));
      });

      if (!subject.length) return;

      clip.sort(compareIntersection);
      link(subject);
      link(clip);

      for (i = 0, n = clip.length; i < n; ++i) {
        clip[i].e = startInside = !startInside;
      }

      var start = subject[0],
          points,
          point;

      while (1) {
        // Find first unvisited intersection.
        var current = start,
            isSubject = true;
        while (current.v) if ((current = current.n) === start) return;
        points = current.z;
        stream.lineStart();
        do {
          current.v = current.o.v = true;
          if (current.e) {
            if (isSubject) {
              for (i = 0, n = points.length; i < n; ++i) stream.point((point = points[i])[0], point[1]);
            } else {
              interpolate(current.x, current.n.x, 1, stream);
            }
            current = current.n;
          } else {
            if (isSubject) {
              points = current.p.z;
              for (i = points.length - 1; i >= 0; --i) stream.point((point = points[i])[0], point[1]);
            } else {
              interpolate(current.x, current.p.x, -1, stream);
            }
            current = current.p;
          }
          current = current.o;
          points = current.z;
          isSubject = !isSubject;
        } while (!current.v);
        stream.lineEnd();
      }
    }

    function link(array) {
      if (!(n = array.length)) return;
      var n,
          i = 0,
          a = array[0],
          b;
      while (++i < n) {
        a.n = b = array[i];
        b.p = a;
        a = b;
      }
      a.n = b = array[0];
      b.p = a;
    }

    var sum = adder();

    function longitude(point) {
      if (abs(point[0]) <= pi)
        return point[0];
      else
        return sign(point[0]) * ((abs(point[0]) + pi) % tau - pi);
    }

    function polygonContains(polygon, point) {
      var lambda = longitude(point),
          phi = point[1],
          sinPhi = sin(phi),
          normal = [sin(lambda), -cos(lambda), 0],
          angle = 0,
          winding = 0;

      sum.reset();

      if (sinPhi === 1) phi = halfPi + epsilon;
      else if (sinPhi === -1) phi = -halfPi - epsilon;

      for (var i = 0, n = polygon.length; i < n; ++i) {
        if (!(m = (ring = polygon[i]).length)) continue;
        var ring,
            m,
            point0 = ring[m - 1],
            lambda0 = longitude(point0),
            phi0 = point0[1] / 2 + quarterPi,
            sinPhi0 = sin(phi0),
            cosPhi0 = cos(phi0);

        for (var j = 0; j < m; ++j, lambda0 = lambda1, sinPhi0 = sinPhi1, cosPhi0 = cosPhi1, point0 = point1) {
          var point1 = ring[j],
              lambda1 = longitude(point1),
              phi1 = point1[1] / 2 + quarterPi,
              sinPhi1 = sin(phi1),
              cosPhi1 = cos(phi1),
              delta = lambda1 - lambda0,
              sign = delta >= 0 ? 1 : -1,
              absDelta = sign * delta,
              antimeridian = absDelta > pi,
              k = sinPhi0 * sinPhi1;

          sum.add(atan2(k * sign * sin(absDelta), cosPhi0 * cosPhi1 + k * cos(absDelta)));
          angle += antimeridian ? delta + sign * tau : delta;

          // Are the longitudes either side of the point’s meridian (lambda),
          // and are the latitudes smaller than the parallel (phi)?
          if (antimeridian ^ lambda0 >= lambda ^ lambda1 >= lambda) {
            var arc = cartesianCross(cartesian(point0), cartesian(point1));
            cartesianNormalizeInPlace(arc);
            var intersection = cartesianCross(normal, arc);
            cartesianNormalizeInPlace(intersection);
            var phiArc = (antimeridian ^ delta >= 0 ? -1 : 1) * asin(intersection[2]);
            if (phi > phiArc || phi === phiArc && (arc[0] || arc[1])) {
              winding += antimeridian ^ delta >= 0 ? 1 : -1;
            }
          }
        }
      }

      // First, determine whether the South pole is inside or outside:
      //
      // It is inside if:
      // * the polygon winds around it in a clockwise direction.
      // * the polygon does not (cumulatively) wind around it, but has a negative
      //   (counter-clockwise) area.
      //
      // Second, count the (signed) number of times a segment crosses a lambda
      // from the point to the South pole.  If it is zero, then the point is the
      // same side as the South pole.

      return (angle < -epsilon || angle < epsilon && sum < -epsilon) ^ (winding & 1);
    }

    function ascending(a, b) {
      return a < b ? -1 : a > b ? 1 : a >= b ? 0 : NaN;
    }

    function bisector(compare) {
      if (compare.length === 1) compare = ascendingComparator(compare);
      return {
        left: function(a, x, lo, hi) {
          if (lo == null) lo = 0;
          if (hi == null) hi = a.length;
          while (lo < hi) {
            var mid = lo + hi >>> 1;
            if (compare(a[mid], x) < 0) lo = mid + 1;
            else hi = mid;
          }
          return lo;
        },
        right: function(a, x, lo, hi) {
          if (lo == null) lo = 0;
          if (hi == null) hi = a.length;
          while (lo < hi) {
            var mid = lo + hi >>> 1;
            if (compare(a[mid], x) > 0) hi = mid;
            else lo = mid + 1;
          }
          return lo;
        }
      };
    }

    function ascendingComparator(f) {
      return function(d, x) {
        return ascending(f(d), x);
      };
    }

    var ascendingBisect = bisector(ascending);

    function range$1(start, stop, step) {
      start = +start, stop = +stop, step = (n = arguments.length) < 2 ? (stop = start, start = 0, 1) : n < 3 ? 1 : +step;

      var i = -1,
          n = Math.max(0, Math.ceil((stop - start) / step)) | 0,
          range = new Array(n);

      while (++i < n) {
        range[i] = start + i * step;
      }

      return range;
    }

    function merge(arrays) {
      var n = arrays.length,
          m,
          i = -1,
          j = 0,
          merged,
          array;

      while (++i < n) j += arrays[i].length;
      merged = new Array(j);

      while (--n >= 0) {
        array = arrays[n];
        m = array.length;
        while (--m >= 0) {
          merged[--j] = array[m];
        }
      }

      return merged;
    }

    function clip(pointVisible, clipLine, interpolate, start) {
      return function(sink) {
        var line = clipLine(sink),
            ringBuffer = clipBuffer(),
            ringSink = clipLine(ringBuffer),
            polygonStarted = false,
            polygon,
            segments,
            ring;

        var clip = {
          point: point,
          lineStart: lineStart,
          lineEnd: lineEnd,
          polygonStart: function() {
            clip.point = pointRing;
            clip.lineStart = ringStart;
            clip.lineEnd = ringEnd;
            segments = [];
            polygon = [];
          },
          polygonEnd: function() {
            clip.point = point;
            clip.lineStart = lineStart;
            clip.lineEnd = lineEnd;
            segments = merge(segments);
            var startInside = polygonContains(polygon, start);
            if (segments.length) {
              if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
              clipRejoin(segments, compareIntersection, startInside, interpolate, sink);
            } else if (startInside) {
              if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
              sink.lineStart();
              interpolate(null, null, 1, sink);
              sink.lineEnd();
            }
            if (polygonStarted) sink.polygonEnd(), polygonStarted = false;
            segments = polygon = null;
          },
          sphere: function() {
            sink.polygonStart();
            sink.lineStart();
            interpolate(null, null, 1, sink);
            sink.lineEnd();
            sink.polygonEnd();
          }
        };

        function point(lambda, phi) {
          if (pointVisible(lambda, phi)) sink.point(lambda, phi);
        }

        function pointLine(lambda, phi) {
          line.point(lambda, phi);
        }

        function lineStart() {
          clip.point = pointLine;
          line.lineStart();
        }

        function lineEnd() {
          clip.point = point;
          line.lineEnd();
        }

        function pointRing(lambda, phi) {
          ring.push([lambda, phi]);
          ringSink.point(lambda, phi);
        }

        function ringStart() {
          ringSink.lineStart();
          ring = [];
        }

        function ringEnd() {
          pointRing(ring[0][0], ring[0][1]);
          ringSink.lineEnd();

          var clean = ringSink.clean(),
              ringSegments = ringBuffer.result(),
              i, n = ringSegments.length, m,
              segment,
              point;

          ring.pop();
          polygon.push(ring);
          ring = null;

          if (!n) return;

          // No intersections.
          if (clean & 1) {
            segment = ringSegments[0];
            if ((m = segment.length - 1) > 0) {
              if (!polygonStarted) sink.polygonStart(), polygonStarted = true;
              sink.lineStart();
              for (i = 0; i < m; ++i) sink.point((point = segment[i])[0], point[1]);
              sink.lineEnd();
            }
            return;
          }

          // Rejoin connected segments.
          // TODO reuse ringBuffer.rejoin()?
          if (n > 1 && clean & 2) ringSegments.push(ringSegments.pop().concat(ringSegments.shift()));

          segments.push(ringSegments.filter(validSegment));
        }

        return clip;
      };
    }

    function validSegment(segment) {
      return segment.length > 1;
    }

    // Intersections are sorted along the clip edge. For both antimeridian cutting
    // and circle clipping, the same comparison is used.
    function compareIntersection(a, b) {
      return ((a = a.x)[0] < 0 ? a[1] - halfPi - epsilon : halfPi - a[1])
           - ((b = b.x)[0] < 0 ? b[1] - halfPi - epsilon : halfPi - b[1]);
    }

    var clipAntimeridian = clip(
      function() { return true; },
      clipAntimeridianLine,
      clipAntimeridianInterpolate,
      [-pi, -halfPi]
    );

    // Takes a line and cuts into visible segments. Return values: 0 - there were
    // intersections or the line was empty; 1 - no intersections; 2 - there were
    // intersections, and the first and last segments should be rejoined.
    function clipAntimeridianLine(stream) {
      var lambda0 = NaN,
          phi0 = NaN,
          sign0 = NaN,
          clean; // no intersections

      return {
        lineStart: function() {
          stream.lineStart();
          clean = 1;
        },
        point: function(lambda1, phi1) {
          var sign1 = lambda1 > 0 ? pi : -pi,
              delta = abs(lambda1 - lambda0);
          if (abs(delta - pi) < epsilon) { // line crosses a pole
            stream.point(lambda0, phi0 = (phi0 + phi1) / 2 > 0 ? halfPi : -halfPi);
            stream.point(sign0, phi0);
            stream.lineEnd();
            stream.lineStart();
            stream.point(sign1, phi0);
            stream.point(lambda1, phi0);
            clean = 0;
          } else if (sign0 !== sign1 && delta >= pi) { // line crosses antimeridian
            if (abs(lambda0 - sign0) < epsilon) lambda0 -= sign0 * epsilon; // handle degeneracies
            if (abs(lambda1 - sign1) < epsilon) lambda1 -= sign1 * epsilon;
            phi0 = clipAntimeridianIntersect(lambda0, phi0, lambda1, phi1);
            stream.point(sign0, phi0);
            stream.lineEnd();
            stream.lineStart();
            stream.point(sign1, phi0);
            clean = 0;
          }
          stream.point(lambda0 = lambda1, phi0 = phi1);
          sign0 = sign1;
        },
        lineEnd: function() {
          stream.lineEnd();
          lambda0 = phi0 = NaN;
        },
        clean: function() {
          return 2 - clean; // if intersections, rejoin first and last segments
        }
      };
    }

    function clipAntimeridianIntersect(lambda0, phi0, lambda1, phi1) {
      var cosPhi0,
          cosPhi1,
          sinLambda0Lambda1 = sin(lambda0 - lambda1);
      return abs(sinLambda0Lambda1) > epsilon
          ? atan((sin(phi0) * (cosPhi1 = cos(phi1)) * sin(lambda1)
              - sin(phi1) * (cosPhi0 = cos(phi0)) * sin(lambda0))
              / (cosPhi0 * cosPhi1 * sinLambda0Lambda1))
          : (phi0 + phi1) / 2;
    }

    function clipAntimeridianInterpolate(from, to, direction, stream) {
      var phi;
      if (from == null) {
        phi = direction * halfPi;
        stream.point(-pi, phi);
        stream.point(0, phi);
        stream.point(pi, phi);
        stream.point(pi, 0);
        stream.point(pi, -phi);
        stream.point(0, -phi);
        stream.point(-pi, -phi);
        stream.point(-pi, 0);
        stream.point(-pi, phi);
      } else if (abs(from[0] - to[0]) > epsilon) {
        var lambda = from[0] < to[0] ? pi : -pi;
        phi = direction * lambda / 2;
        stream.point(-lambda, phi);
        stream.point(0, phi);
        stream.point(lambda, phi);
      } else {
        stream.point(to[0], to[1]);
      }
    }

    function clipCircle(radius) {
      var cr = cos(radius),
          delta = 6 * radians,
          smallRadius = cr > 0,
          notHemisphere = abs(cr) > epsilon; // TODO optimise for this common case

      function interpolate(from, to, direction, stream) {
        circleStream(stream, radius, delta, direction, from, to);
      }

      function visible(lambda, phi) {
        return cos(lambda) * cos(phi) > cr;
      }

      // Takes a line and cuts into visible segments. Return values used for polygon
      // clipping: 0 - there were intersections or the line was empty; 1 - no
      // intersections 2 - there were intersections, and the first and last segments
      // should be rejoined.
      function clipLine(stream) {
        var point0, // previous point
            c0, // code for previous point
            v0, // visibility of previous point
            v00, // visibility of first point
            clean; // no intersections
        return {
          lineStart: function() {
            v00 = v0 = false;
            clean = 1;
          },
          point: function(lambda, phi) {
            var point1 = [lambda, phi],
                point2,
                v = visible(lambda, phi),
                c = smallRadius
                  ? v ? 0 : code(lambda, phi)
                  : v ? code(lambda + (lambda < 0 ? pi : -pi), phi) : 0;
            if (!point0 && (v00 = v0 = v)) stream.lineStart();
            // Handle degeneracies.
            // TODO ignore if not clipping polygons.
            if (v !== v0) {
              point2 = intersect(point0, point1);
              if (!point2 || pointEqual(point0, point2) || pointEqual(point1, point2)) {
                point1[0] += epsilon;
                point1[1] += epsilon;
                v = visible(point1[0], point1[1]);
              }
            }
            if (v !== v0) {
              clean = 0;
              if (v) {
                // outside going in
                stream.lineStart();
                point2 = intersect(point1, point0);
                stream.point(point2[0], point2[1]);
              } else {
                // inside going out
                point2 = intersect(point0, point1);
                stream.point(point2[0], point2[1]);
                stream.lineEnd();
              }
              point0 = point2;
            } else if (notHemisphere && point0 && smallRadius ^ v) {
              var t;
              // If the codes for two points are different, or are both zero,
              // and there this segment intersects with the small circle.
              if (!(c & c0) && (t = intersect(point1, point0, true))) {
                clean = 0;
                if (smallRadius) {
                  stream.lineStart();
                  stream.point(t[0][0], t[0][1]);
                  stream.point(t[1][0], t[1][1]);
                  stream.lineEnd();
                } else {
                  stream.point(t[1][0], t[1][1]);
                  stream.lineEnd();
                  stream.lineStart();
                  stream.point(t[0][0], t[0][1]);
                }
              }
            }
            if (v && (!point0 || !pointEqual(point0, point1))) {
              stream.point(point1[0], point1[1]);
            }
            point0 = point1, v0 = v, c0 = c;
          },
          lineEnd: function() {
            if (v0) stream.lineEnd();
            point0 = null;
          },
          // Rejoin first and last segments if there were intersections and the first
          // and last points were visible.
          clean: function() {
            return clean | ((v00 && v0) << 1);
          }
        };
      }

      // Intersects the great circle between a and b with the clip circle.
      function intersect(a, b, two) {
        var pa = cartesian(a),
            pb = cartesian(b);

        // We have two planes, n1.p = d1 and n2.p = d2.
        // Find intersection line p(t) = c1 n1 + c2 n2 + t (n1 ⨯ n2).
        var n1 = [1, 0, 0], // normal
            n2 = cartesianCross(pa, pb),
            n2n2 = cartesianDot(n2, n2),
            n1n2 = n2[0], // cartesianDot(n1, n2),
            determinant = n2n2 - n1n2 * n1n2;

        // Two polar points.
        if (!determinant) return !two && a;

        var c1 =  cr * n2n2 / determinant,
            c2 = -cr * n1n2 / determinant,
            n1xn2 = cartesianCross(n1, n2),
            A = cartesianScale(n1, c1),
            B = cartesianScale(n2, c2);
        cartesianAddInPlace(A, B);

        // Solve |p(t)|^2 = 1.
        var u = n1xn2,
            w = cartesianDot(A, u),
            uu = cartesianDot(u, u),
            t2 = w * w - uu * (cartesianDot(A, A) - 1);

        if (t2 < 0) return;

        var t = sqrt(t2),
            q = cartesianScale(u, (-w - t) / uu);
        cartesianAddInPlace(q, A);
        q = spherical(q);

        if (!two) return q;

        // Two intersection points.
        var lambda0 = a[0],
            lambda1 = b[0],
            phi0 = a[1],
            phi1 = b[1],
            z;

        if (lambda1 < lambda0) z = lambda0, lambda0 = lambda1, lambda1 = z;

        var delta = lambda1 - lambda0,
            polar = abs(delta - pi) < epsilon,
            meridian = polar || delta < epsilon;

        if (!polar && phi1 < phi0) z = phi0, phi0 = phi1, phi1 = z;

        // Check that the first point is between a and b.
        if (meridian
            ? polar
              ? phi0 + phi1 > 0 ^ q[1] < (abs(q[0] - lambda0) < epsilon ? phi0 : phi1)
              : phi0 <= q[1] && q[1] <= phi1
            : delta > pi ^ (lambda0 <= q[0] && q[0] <= lambda1)) {
          var q1 = cartesianScale(u, (-w + t) / uu);
          cartesianAddInPlace(q1, A);
          return [q, spherical(q1)];
        }
      }

      // Generates a 4-bit vector representing the location of a point relative to
      // the small circle's bounding box.
      function code(lambda, phi) {
        var r = smallRadius ? radius : pi - radius,
            code = 0;
        if (lambda < -r) code |= 1; // left
        else if (lambda > r) code |= 2; // right
        if (phi < -r) code |= 4; // below
        else if (phi > r) code |= 8; // above
        return code;
      }

      return clip(visible, clipLine, interpolate, smallRadius ? [0, -radius] : [-pi, radius - pi]);
    }

    function clipLine(a, b, x0, y0, x1, y1) {
      var ax = a[0],
          ay = a[1],
          bx = b[0],
          by = b[1],
          t0 = 0,
          t1 = 1,
          dx = bx - ax,
          dy = by - ay,
          r;

      r = x0 - ax;
      if (!dx && r > 0) return;
      r /= dx;
      if (dx < 0) {
        if (r < t0) return;
        if (r < t1) t1 = r;
      } else if (dx > 0) {
        if (r > t1) return;
        if (r > t0) t0 = r;
      }

      r = x1 - ax;
      if (!dx && r < 0) return;
      r /= dx;
      if (dx < 0) {
        if (r > t1) return;
        if (r > t0) t0 = r;
      } else if (dx > 0) {
        if (r < t0) return;
        if (r < t1) t1 = r;
      }

      r = y0 - ay;
      if (!dy && r > 0) return;
      r /= dy;
      if (dy < 0) {
        if (r < t0) return;
        if (r < t1) t1 = r;
      } else if (dy > 0) {
        if (r > t1) return;
        if (r > t0) t0 = r;
      }

      r = y1 - ay;
      if (!dy && r < 0) return;
      r /= dy;
      if (dy < 0) {
        if (r > t1) return;
        if (r > t0) t0 = r;
      } else if (dy > 0) {
        if (r < t0) return;
        if (r < t1) t1 = r;
      }

      if (t0 > 0) a[0] = ax + t0 * dx, a[1] = ay + t0 * dy;
      if (t1 < 1) b[0] = ax + t1 * dx, b[1] = ay + t1 * dy;
      return true;
    }

    var clipMax = 1e9, clipMin = -clipMax;

    // TODO Use d3-polygon’s polygonContains here for the ring check?
    // TODO Eliminate duplicate buffering in clipBuffer and polygon.push?

    function clipRectangle(x0, y0, x1, y1) {

      function visible(x, y) {
        return x0 <= x && x <= x1 && y0 <= y && y <= y1;
      }

      function interpolate(from, to, direction, stream) {
        var a = 0, a1 = 0;
        if (from == null
            || (a = corner(from, direction)) !== (a1 = corner(to, direction))
            || comparePoint(from, to) < 0 ^ direction > 0) {
          do stream.point(a === 0 || a === 3 ? x0 : x1, a > 1 ? y1 : y0);
          while ((a = (a + direction + 4) % 4) !== a1);
        } else {
          stream.point(to[0], to[1]);
        }
      }

      function corner(p, direction) {
        return abs(p[0] - x0) < epsilon ? direction > 0 ? 0 : 3
            : abs(p[0] - x1) < epsilon ? direction > 0 ? 2 : 1
            : abs(p[1] - y0) < epsilon ? direction > 0 ? 1 : 0
            : direction > 0 ? 3 : 2; // abs(p[1] - y1) < epsilon
      }

      function compareIntersection(a, b) {
        return comparePoint(a.x, b.x);
      }

      function comparePoint(a, b) {
        var ca = corner(a, 1),
            cb = corner(b, 1);
        return ca !== cb ? ca - cb
            : ca === 0 ? b[1] - a[1]
            : ca === 1 ? a[0] - b[0]
            : ca === 2 ? a[1] - b[1]
            : b[0] - a[0];
      }

      return function(stream) {
        var activeStream = stream,
            bufferStream = clipBuffer(),
            segments,
            polygon,
            ring,
            x__, y__, v__, // first point
            x_, y_, v_, // previous point
            first,
            clean;

        var clipStream = {
          point: point,
          lineStart: lineStart,
          lineEnd: lineEnd,
          polygonStart: polygonStart,
          polygonEnd: polygonEnd
        };

        function point(x, y) {
          if (visible(x, y)) activeStream.point(x, y);
        }

        function polygonInside() {
          var winding = 0;

          for (var i = 0, n = polygon.length; i < n; ++i) {
            for (var ring = polygon[i], j = 1, m = ring.length, point = ring[0], a0, a1, b0 = point[0], b1 = point[1]; j < m; ++j) {
              a0 = b0, a1 = b1, point = ring[j], b0 = point[0], b1 = point[1];
              if (a1 <= y1) { if (b1 > y1 && (b0 - a0) * (y1 - a1) > (b1 - a1) * (x0 - a0)) ++winding; }
              else { if (b1 <= y1 && (b0 - a0) * (y1 - a1) < (b1 - a1) * (x0 - a0)) --winding; }
            }
          }

          return winding;
        }

        // Buffer geometry within a polygon and then clip it en masse.
        function polygonStart() {
          activeStream = bufferStream, segments = [], polygon = [], clean = true;
        }

        function polygonEnd() {
          var startInside = polygonInside(),
              cleanInside = clean && startInside,
              visible = (segments = merge(segments)).length;
          if (cleanInside || visible) {
            stream.polygonStart();
            if (cleanInside) {
              stream.lineStart();
              interpolate(null, null, 1, stream);
              stream.lineEnd();
            }
            if (visible) {
              clipRejoin(segments, compareIntersection, startInside, interpolate, stream);
            }
            stream.polygonEnd();
          }
          activeStream = stream, segments = polygon = ring = null;
        }

        function lineStart() {
          clipStream.point = linePoint;
          if (polygon) polygon.push(ring = []);
          first = true;
          v_ = false;
          x_ = y_ = NaN;
        }

        // TODO rather than special-case polygons, simply handle them separately.
        // Ideally, coincident intersection points should be jittered to avoid
        // clipping issues.
        function lineEnd() {
          if (segments) {
            linePoint(x__, y__);
            if (v__ && v_) bufferStream.rejoin();
            segments.push(bufferStream.result());
          }
          clipStream.point = point;
          if (v_) activeStream.lineEnd();
        }

        function linePoint(x, y) {
          var v = visible(x, y);
          if (polygon) ring.push([x, y]);
          if (first) {
            x__ = x, y__ = y, v__ = v;
            first = false;
            if (v) {
              activeStream.lineStart();
              activeStream.point(x, y);
            }
          } else {
            if (v && v_) activeStream.point(x, y);
            else {
              var a = [x_ = Math.max(clipMin, Math.min(clipMax, x_)), y_ = Math.max(clipMin, Math.min(clipMax, y_))],
                  b = [x = Math.max(clipMin, Math.min(clipMax, x)), y = Math.max(clipMin, Math.min(clipMax, y))];
              if (clipLine(a, b, x0, y0, x1, y1)) {
                if (!v_) {
                  activeStream.lineStart();
                  activeStream.point(a[0], a[1]);
                }
                activeStream.point(b[0], b[1]);
                if (!v) activeStream.lineEnd();
                clean = false;
              } else if (v) {
                activeStream.lineStart();
                activeStream.point(x, y);
                clean = false;
              }
            }
          }
          x_ = x, y_ = y, v_ = v;
        }

        return clipStream;
      };
    }

    function extent() {
      var x0 = 0,
          y0 = 0,
          x1 = 960,
          y1 = 500,
          cache,
          cacheStream,
          clip;

      return clip = {
        stream: function(stream) {
          return cache && cacheStream === stream ? cache : cache = clipRectangle(x0, y0, x1, y1)(cacheStream = stream);
        },
        extent: function(_) {
          return arguments.length ? (x0 = +_[0][0], y0 = +_[0][1], x1 = +_[1][0], y1 = +_[1][1], cache = cacheStream = null, clip) : [[x0, y0], [x1, y1]];
        }
      };
    }

    var lengthSum = adder(),
        lambda0$2,
        sinPhi0$1,
        cosPhi0$1;

    var lengthStream = {
      sphere: noop$1,
      point: noop$1,
      lineStart: lengthLineStart,
      lineEnd: noop$1,
      polygonStart: noop$1,
      polygonEnd: noop$1
    };

    function lengthLineStart() {
      lengthStream.point = lengthPointFirst;
      lengthStream.lineEnd = lengthLineEnd;
    }

    function lengthLineEnd() {
      lengthStream.point = lengthStream.lineEnd = noop$1;
    }

    function lengthPointFirst(lambda, phi) {
      lambda *= radians, phi *= radians;
      lambda0$2 = lambda, sinPhi0$1 = sin(phi), cosPhi0$1 = cos(phi);
      lengthStream.point = lengthPoint;
    }

    function lengthPoint(lambda, phi) {
      lambda *= radians, phi *= radians;
      var sinPhi = sin(phi),
          cosPhi = cos(phi),
          delta = abs(lambda - lambda0$2),
          cosDelta = cos(delta),
          sinDelta = sin(delta),
          x = cosPhi * sinDelta,
          y = cosPhi0$1 * sinPhi - sinPhi0$1 * cosPhi * cosDelta,
          z = sinPhi0$1 * sinPhi + cosPhi0$1 * cosPhi * cosDelta;
      lengthSum.add(atan2(sqrt(x * x + y * y), z));
      lambda0$2 = lambda, sinPhi0$1 = sinPhi, cosPhi0$1 = cosPhi;
    }

    function length(object) {
      lengthSum.reset();
      geoStream(object, lengthStream);
      return +lengthSum;
    }

    var coordinates = [null, null],
        object = {type: "LineString", coordinates: coordinates};

    function distance(a, b) {
      coordinates[0] = a;
      coordinates[1] = b;
      return length(object);
    }

    var containsObjectType = {
      Feature: function(object, point) {
        return containsGeometry(object.geometry, point);
      },
      FeatureCollection: function(object, point) {
        var features = object.features, i = -1, n = features.length;
        while (++i < n) if (containsGeometry(features[i].geometry, point)) return true;
        return false;
      }
    };

    var containsGeometryType = {
      Sphere: function() {
        return true;
      },
      Point: function(object, point) {
        return containsPoint(object.coordinates, point);
      },
      MultiPoint: function(object, point) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) if (containsPoint(coordinates[i], point)) return true;
        return false;
      },
      LineString: function(object, point) {
        return containsLine(object.coordinates, point);
      },
      MultiLineString: function(object, point) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) if (containsLine(coordinates[i], point)) return true;
        return false;
      },
      Polygon: function(object, point) {
        return containsPolygon(object.coordinates, point);
      },
      MultiPolygon: function(object, point) {
        var coordinates = object.coordinates, i = -1, n = coordinates.length;
        while (++i < n) if (containsPolygon(coordinates[i], point)) return true;
        return false;
      },
      GeometryCollection: function(object, point) {
        var geometries = object.geometries, i = -1, n = geometries.length;
        while (++i < n) if (containsGeometry(geometries[i], point)) return true;
        return false;
      }
    };

    function containsGeometry(geometry, point) {
      return geometry && containsGeometryType.hasOwnProperty(geometry.type)
          ? containsGeometryType[geometry.type](geometry, point)
          : false;
    }

    function containsPoint(coordinates, point) {
      return distance(coordinates, point) === 0;
    }

    function containsLine(coordinates, point) {
      var ao, bo, ab;
      for (var i = 0, n = coordinates.length; i < n; i++) {
        bo = distance(coordinates[i], point);
        if (bo === 0) return true;
        if (i > 0) {
          ab = distance(coordinates[i], coordinates[i - 1]);
          if (
            ab > 0 &&
            ao <= ab &&
            bo <= ab &&
            (ao + bo - ab) * (1 - Math.pow((ao - bo) / ab, 2)) < epsilon2 * ab
          )
            return true;
        }
        ao = bo;
      }
      return false;
    }

    function containsPolygon(coordinates, point) {
      return !!polygonContains(coordinates.map(ringRadians), pointRadians(point));
    }

    function ringRadians(ring) {
      return ring = ring.map(pointRadians), ring.pop(), ring;
    }

    function pointRadians(point) {
      return [point[0] * radians, point[1] * radians];
    }

    function contains(object, point) {
      return (object && containsObjectType.hasOwnProperty(object.type)
          ? containsObjectType[object.type]
          : containsGeometry)(object, point);
    }

    function graticuleX(y0, y1, dy) {
      var y = range$1(y0, y1 - epsilon, dy).concat(y1);
      return function(x) { return y.map(function(y) { return [x, y]; }); };
    }

    function graticuleY(x0, x1, dx) {
      var x = range$1(x0, x1 - epsilon, dx).concat(x1);
      return function(y) { return x.map(function(x) { return [x, y]; }); };
    }

    function graticule() {
      var x1, x0, X1, X0,
          y1, y0, Y1, Y0,
          dx = 10, dy = dx, DX = 90, DY = 360,
          x, y, X, Y,
          precision = 2.5;

      function graticule() {
        return {type: "MultiLineString", coordinates: lines()};
      }

      function lines() {
        return range$1(ceil(X0 / DX) * DX, X1, DX).map(X)
            .concat(range$1(ceil(Y0 / DY) * DY, Y1, DY).map(Y))
            .concat(range$1(ceil(x0 / dx) * dx, x1, dx).filter(function(x) { return abs(x % DX) > epsilon; }).map(x))
            .concat(range$1(ceil(y0 / dy) * dy, y1, dy).filter(function(y) { return abs(y % DY) > epsilon; }).map(y));
      }

      graticule.lines = function() {
        return lines().map(function(coordinates) { return {type: "LineString", coordinates: coordinates}; });
      };

      graticule.outline = function() {
        return {
          type: "Polygon",
          coordinates: [
            X(X0).concat(
            Y(Y1).slice(1),
            X(X1).reverse().slice(1),
            Y(Y0).reverse().slice(1))
          ]
        };
      };

      graticule.extent = function(_) {
        if (!arguments.length) return graticule.extentMinor();
        return graticule.extentMajor(_).extentMinor(_);
      };

      graticule.extentMajor = function(_) {
        if (!arguments.length) return [[X0, Y0], [X1, Y1]];
        X0 = +_[0][0], X1 = +_[1][0];
        Y0 = +_[0][1], Y1 = +_[1][1];
        if (X0 > X1) _ = X0, X0 = X1, X1 = _;
        if (Y0 > Y1) _ = Y0, Y0 = Y1, Y1 = _;
        return graticule.precision(precision);
      };

      graticule.extentMinor = function(_) {
        if (!arguments.length) return [[x0, y0], [x1, y1]];
        x0 = +_[0][0], x1 = +_[1][0];
        y0 = +_[0][1], y1 = +_[1][1];
        if (x0 > x1) _ = x0, x0 = x1, x1 = _;
        if (y0 > y1) _ = y0, y0 = y1, y1 = _;
        return graticule.precision(precision);
      };

      graticule.step = function(_) {
        if (!arguments.length) return graticule.stepMinor();
        return graticule.stepMajor(_).stepMinor(_);
      };

      graticule.stepMajor = function(_) {
        if (!arguments.length) return [DX, DY];
        DX = +_[0], DY = +_[1];
        return graticule;
      };

      graticule.stepMinor = function(_) {
        if (!arguments.length) return [dx, dy];
        dx = +_[0], dy = +_[1];
        return graticule;
      };

      graticule.precision = function(_) {
        if (!arguments.length) return precision;
        precision = +_;
        x = graticuleX(y0, y1, 90);
        y = graticuleY(x0, x1, precision);
        X = graticuleX(Y0, Y1, 90);
        Y = graticuleY(X0, X1, precision);
        return graticule;
      };

      return graticule
          .extentMajor([[-180, -90 + epsilon], [180, 90 - epsilon]])
          .extentMinor([[-180, -80 - epsilon], [180, 80 + epsilon]]);
    }

    function graticule10() {
      return graticule()();
    }

    function interpolate(a, b) {
      var x0 = a[0] * radians,
          y0 = a[1] * radians,
          x1 = b[0] * radians,
          y1 = b[1] * radians,
          cy0 = cos(y0),
          sy0 = sin(y0),
          cy1 = cos(y1),
          sy1 = sin(y1),
          kx0 = cy0 * cos(x0),
          ky0 = cy0 * sin(x0),
          kx1 = cy1 * cos(x1),
          ky1 = cy1 * sin(x1),
          d = 2 * asin(sqrt(haversin(y1 - y0) + cy0 * cy1 * haversin(x1 - x0))),
          k = sin(d);

      var interpolate = d ? function(t) {
        var B = sin(t *= d) / k,
            A = sin(d - t) / k,
            x = A * kx0 + B * kx1,
            y = A * ky0 + B * ky1,
            z = A * sy0 + B * sy1;
        return [
          atan2(y, x) * degrees,
          atan2(z, sqrt(x * x + y * y)) * degrees
        ];
      } : function() {
        return [x0 * degrees, y0 * degrees];
      };

      interpolate.distance = d;

      return interpolate;
    }

    function identity(x) {
      return x;
    }

    var areaSum$1 = adder(),
        areaRingSum$1 = adder(),
        x00,
        y00,
        x0$1,
        y0$1;

    var areaStream$1 = {
      point: noop$1,
      lineStart: noop$1,
      lineEnd: noop$1,
      polygonStart: function() {
        areaStream$1.lineStart = areaRingStart$1;
        areaStream$1.lineEnd = areaRingEnd$1;
      },
      polygonEnd: function() {
        areaStream$1.lineStart = areaStream$1.lineEnd = areaStream$1.point = noop$1;
        areaSum$1.add(abs(areaRingSum$1));
        areaRingSum$1.reset();
      },
      result: function() {
        var area = areaSum$1 / 2;
        areaSum$1.reset();
        return area;
      }
    };

    function areaRingStart$1() {
      areaStream$1.point = areaPointFirst$1;
    }

    function areaPointFirst$1(x, y) {
      areaStream$1.point = areaPoint$1;
      x00 = x0$1 = x, y00 = y0$1 = y;
    }

    function areaPoint$1(x, y) {
      areaRingSum$1.add(y0$1 * x - x0$1 * y);
      x0$1 = x, y0$1 = y;
    }

    function areaRingEnd$1() {
      areaPoint$1(x00, y00);
    }

    var x0$2 = Infinity,
        y0$2 = x0$2,
        x1 = -x0$2,
        y1 = x1;

    var boundsStream$1 = {
      point: boundsPoint$1,
      lineStart: noop$1,
      lineEnd: noop$1,
      polygonStart: noop$1,
      polygonEnd: noop$1,
      result: function() {
        var bounds = [[x0$2, y0$2], [x1, y1]];
        x1 = y1 = -(y0$2 = x0$2 = Infinity);
        return bounds;
      }
    };

    function boundsPoint$1(x, y) {
      if (x < x0$2) x0$2 = x;
      if (x > x1) x1 = x;
      if (y < y0$2) y0$2 = y;
      if (y > y1) y1 = y;
    }

    // TODO Enforce positive area for exterior, negative area for interior?

    var X0$1 = 0,
        Y0$1 = 0,
        Z0$1 = 0,
        X1$1 = 0,
        Y1$1 = 0,
        Z1$1 = 0,
        X2$1 = 0,
        Y2$1 = 0,
        Z2$1 = 0,
        x00$1,
        y00$1,
        x0$3,
        y0$3;

    var centroidStream$1 = {
      point: centroidPoint$1,
      lineStart: centroidLineStart$1,
      lineEnd: centroidLineEnd$1,
      polygonStart: function() {
        centroidStream$1.lineStart = centroidRingStart$1;
        centroidStream$1.lineEnd = centroidRingEnd$1;
      },
      polygonEnd: function() {
        centroidStream$1.point = centroidPoint$1;
        centroidStream$1.lineStart = centroidLineStart$1;
        centroidStream$1.lineEnd = centroidLineEnd$1;
      },
      result: function() {
        var centroid = Z2$1 ? [X2$1 / Z2$1, Y2$1 / Z2$1]
            : Z1$1 ? [X1$1 / Z1$1, Y1$1 / Z1$1]
            : Z0$1 ? [X0$1 / Z0$1, Y0$1 / Z0$1]
            : [NaN, NaN];
        X0$1 = Y0$1 = Z0$1 =
        X1$1 = Y1$1 = Z1$1 =
        X2$1 = Y2$1 = Z2$1 = 0;
        return centroid;
      }
    };

    function centroidPoint$1(x, y) {
      X0$1 += x;
      Y0$1 += y;
      ++Z0$1;
    }

    function centroidLineStart$1() {
      centroidStream$1.point = centroidPointFirstLine;
    }

    function centroidPointFirstLine(x, y) {
      centroidStream$1.point = centroidPointLine;
      centroidPoint$1(x0$3 = x, y0$3 = y);
    }

    function centroidPointLine(x, y) {
      var dx = x - x0$3, dy = y - y0$3, z = sqrt(dx * dx + dy * dy);
      X1$1 += z * (x0$3 + x) / 2;
      Y1$1 += z * (y0$3 + y) / 2;
      Z1$1 += z;
      centroidPoint$1(x0$3 = x, y0$3 = y);
    }

    function centroidLineEnd$1() {
      centroidStream$1.point = centroidPoint$1;
    }

    function centroidRingStart$1() {
      centroidStream$1.point = centroidPointFirstRing;
    }

    function centroidRingEnd$1() {
      centroidPointRing(x00$1, y00$1);
    }

    function centroidPointFirstRing(x, y) {
      centroidStream$1.point = centroidPointRing;
      centroidPoint$1(x00$1 = x0$3 = x, y00$1 = y0$3 = y);
    }

    function centroidPointRing(x, y) {
      var dx = x - x0$3,
          dy = y - y0$3,
          z = sqrt(dx * dx + dy * dy);

      X1$1 += z * (x0$3 + x) / 2;
      Y1$1 += z * (y0$3 + y) / 2;
      Z1$1 += z;

      z = y0$3 * x - x0$3 * y;
      X2$1 += z * (x0$3 + x);
      Y2$1 += z * (y0$3 + y);
      Z2$1 += z * 3;
      centroidPoint$1(x0$3 = x, y0$3 = y);
    }

    function PathContext(context) {
      this._context = context;
    }

    PathContext.prototype = {
      _radius: 4.5,
      pointRadius: function(_) {
        return this._radius = _, this;
      },
      polygonStart: function() {
        this._line = 0;
      },
      polygonEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._point = 0;
      },
      lineEnd: function() {
        if (this._line === 0) this._context.closePath();
        this._point = NaN;
      },
      point: function(x, y) {
        switch (this._point) {
          case 0: {
            this._context.moveTo(x, y);
            this._point = 1;
            break;
          }
          case 1: {
            this._context.lineTo(x, y);
            break;
          }
          default: {
            this._context.moveTo(x + this._radius, y);
            this._context.arc(x, y, this._radius, 0, tau);
            break;
          }
        }
      },
      result: noop$1
    };

    var lengthSum$1 = adder(),
        lengthRing,
        x00$2,
        y00$2,
        x0$4,
        y0$4;

    var lengthStream$1 = {
      point: noop$1,
      lineStart: function() {
        lengthStream$1.point = lengthPointFirst$1;
      },
      lineEnd: function() {
        if (lengthRing) lengthPoint$1(x00$2, y00$2);
        lengthStream$1.point = noop$1;
      },
      polygonStart: function() {
        lengthRing = true;
      },
      polygonEnd: function() {
        lengthRing = null;
      },
      result: function() {
        var length = +lengthSum$1;
        lengthSum$1.reset();
        return length;
      }
    };

    function lengthPointFirst$1(x, y) {
      lengthStream$1.point = lengthPoint$1;
      x00$2 = x0$4 = x, y00$2 = y0$4 = y;
    }

    function lengthPoint$1(x, y) {
      x0$4 -= x, y0$4 -= y;
      lengthSum$1.add(sqrt(x0$4 * x0$4 + y0$4 * y0$4));
      x0$4 = x, y0$4 = y;
    }

    function PathString() {
      this._string = [];
    }

    PathString.prototype = {
      _radius: 4.5,
      _circle: circle$1(4.5),
      pointRadius: function(_) {
        if ((_ = +_) !== this._radius) this._radius = _, this._circle = null;
        return this;
      },
      polygonStart: function() {
        this._line = 0;
      },
      polygonEnd: function() {
        this._line = NaN;
      },
      lineStart: function() {
        this._point = 0;
      },
      lineEnd: function() {
        if (this._line === 0) this._string.push("Z");
        this._point = NaN;
      },
      point: function(x, y) {
        switch (this._point) {
          case 0: {
            this._string.push("M", x, ",", y);
            this._point = 1;
            break;
          }
          case 1: {
            this._string.push("L", x, ",", y);
            break;
          }
          default: {
            if (this._circle == null) this._circle = circle$1(this._radius);
            this._string.push("M", x, ",", y, this._circle);
            break;
          }
        }
      },
      result: function() {
        if (this._string.length) {
          var result = this._string.join("");
          this._string = [];
          return result;
        } else {
          return null;
        }
      }
    };

    function circle$1(radius) {
      return "m0," + radius
          + "a" + radius + "," + radius + " 0 1,1 0," + -2 * radius
          + "a" + radius + "," + radius + " 0 1,1 0," + 2 * radius
          + "z";
    }

    function index(projection, context) {
      var pointRadius = 4.5,
          projectionStream,
          contextStream;

      function path(object) {
        if (object) {
          if (typeof pointRadius === "function") contextStream.pointRadius(+pointRadius.apply(this, arguments));
          geoStream(object, projectionStream(contextStream));
        }
        return contextStream.result();
      }

      path.area = function(object) {
        geoStream(object, projectionStream(areaStream$1));
        return areaStream$1.result();
      };

      path.measure = function(object) {
        geoStream(object, projectionStream(lengthStream$1));
        return lengthStream$1.result();
      };

      path.bounds = function(object) {
        geoStream(object, projectionStream(boundsStream$1));
        return boundsStream$1.result();
      };

      path.centroid = function(object) {
        geoStream(object, projectionStream(centroidStream$1));
        return centroidStream$1.result();
      };

      path.projection = function(_) {
        return arguments.length ? (projectionStream = _ == null ? (projection = null, identity) : (projection = _).stream, path) : projection;
      };

      path.context = function(_) {
        if (!arguments.length) return context;
        contextStream = _ == null ? (context = null, new PathString) : new PathContext(context = _);
        if (typeof pointRadius !== "function") contextStream.pointRadius(pointRadius);
        return path;
      };

      path.pointRadius = function(_) {
        if (!arguments.length) return pointRadius;
        pointRadius = typeof _ === "function" ? _ : (contextStream.pointRadius(+_), +_);
        return path;
      };

      return path.projection(projection).context(context);
    }

    function transform(methods) {
      return {
        stream: transformer(methods)
      };
    }

    function transformer(methods) {
      return function(stream) {
        var s = new TransformStream;
        for (var key in methods) s[key] = methods[key];
        s.stream = stream;
        return s;
      };
    }

    function TransformStream() {}

    TransformStream.prototype = {
      constructor: TransformStream,
      point: function(x, y) { this.stream.point(x, y); },
      sphere: function() { this.stream.sphere(); },
      lineStart: function() { this.stream.lineStart(); },
      lineEnd: function() { this.stream.lineEnd(); },
      polygonStart: function() { this.stream.polygonStart(); },
      polygonEnd: function() { this.stream.polygonEnd(); }
    };

    function fit(projection, fitBounds, object) {
      var clip = projection.clipExtent && projection.clipExtent();
      projection.scale(150).translate([0, 0]);
      if (clip != null) projection.clipExtent(null);
      geoStream(object, projection.stream(boundsStream$1));
      fitBounds(boundsStream$1.result());
      if (clip != null) projection.clipExtent(clip);
      return projection;
    }

    function fitExtent(projection, extent, object) {
      return fit(projection, function(b) {
        var w = extent[1][0] - extent[0][0],
            h = extent[1][1] - extent[0][1],
            k = Math.min(w / (b[1][0] - b[0][0]), h / (b[1][1] - b[0][1])),
            x = +extent[0][0] + (w - k * (b[1][0] + b[0][0])) / 2,
            y = +extent[0][1] + (h - k * (b[1][1] + b[0][1])) / 2;
        projection.scale(150 * k).translate([x, y]);
      }, object);
    }

    function fitSize(projection, size, object) {
      return fitExtent(projection, [[0, 0], size], object);
    }

    function fitWidth(projection, width, object) {
      return fit(projection, function(b) {
        var w = +width,
            k = w / (b[1][0] - b[0][0]),
            x = (w - k * (b[1][0] + b[0][0])) / 2,
            y = -k * b[0][1];
        projection.scale(150 * k).translate([x, y]);
      }, object);
    }

    function fitHeight(projection, height, object) {
      return fit(projection, function(b) {
        var h = +height,
            k = h / (b[1][1] - b[0][1]),
            x = -k * b[0][0],
            y = (h - k * (b[1][1] + b[0][1])) / 2;
        projection.scale(150 * k).translate([x, y]);
      }, object);
    }

    var maxDepth = 16, // maximum depth of subdivision
        cosMinDistance = cos(30 * radians); // cos(minimum angular distance)

    function resample(project, delta2) {
      return +delta2 ? resample$1(project, delta2) : resampleNone(project);
    }

    function resampleNone(project) {
      return transformer({
        point: function(x, y) {
          x = project(x, y);
          this.stream.point(x[0], x[1]);
        }
      });
    }

    function resample$1(project, delta2) {

      function resampleLineTo(x0, y0, lambda0, a0, b0, c0, x1, y1, lambda1, a1, b1, c1, depth, stream) {
        var dx = x1 - x0,
            dy = y1 - y0,
            d2 = dx * dx + dy * dy;
        if (d2 > 4 * delta2 && depth--) {
          var a = a0 + a1,
              b = b0 + b1,
              c = c0 + c1,
              m = sqrt(a * a + b * b + c * c),
              phi2 = asin(c /= m),
              lambda2 = abs(abs(c) - 1) < epsilon || abs(lambda0 - lambda1) < epsilon ? (lambda0 + lambda1) / 2 : atan2(b, a),
              p = project(lambda2, phi2),
              x2 = p[0],
              y2 = p[1],
              dx2 = x2 - x0,
              dy2 = y2 - y0,
              dz = dy * dx2 - dx * dy2;
          if (dz * dz / d2 > delta2 // perpendicular projected distance
              || abs((dx * dx2 + dy * dy2) / d2 - 0.5) > 0.3 // midpoint close to an end
              || a0 * a1 + b0 * b1 + c0 * c1 < cosMinDistance) { // angular distance
            resampleLineTo(x0, y0, lambda0, a0, b0, c0, x2, y2, lambda2, a /= m, b /= m, c, depth, stream);
            stream.point(x2, y2);
            resampleLineTo(x2, y2, lambda2, a, b, c, x1, y1, lambda1, a1, b1, c1, depth, stream);
          }
        }
      }
      return function(stream) {
        var lambda00, x00, y00, a00, b00, c00, // first point
            lambda0, x0, y0, a0, b0, c0; // previous point

        var resampleStream = {
          point: point,
          lineStart: lineStart,
          lineEnd: lineEnd,
          polygonStart: function() { stream.polygonStart(); resampleStream.lineStart = ringStart; },
          polygonEnd: function() { stream.polygonEnd(); resampleStream.lineStart = lineStart; }
        };

        function point(x, y) {
          x = project(x, y);
          stream.point(x[0], x[1]);
        }

        function lineStart() {
          x0 = NaN;
          resampleStream.point = linePoint;
          stream.lineStart();
        }

        function linePoint(lambda, phi) {
          var c = cartesian([lambda, phi]), p = project(lambda, phi);
          resampleLineTo(x0, y0, lambda0, a0, b0, c0, x0 = p[0], y0 = p[1], lambda0 = lambda, a0 = c[0], b0 = c[1], c0 = c[2], maxDepth, stream);
          stream.point(x0, y0);
        }

        function lineEnd() {
          resampleStream.point = point;
          stream.lineEnd();
        }

        function ringStart() {
          lineStart();
          resampleStream.point = ringPoint;
          resampleStream.lineEnd = ringEnd;
        }

        function ringPoint(lambda, phi) {
          linePoint(lambda00 = lambda, phi), x00 = x0, y00 = y0, a00 = a0, b00 = b0, c00 = c0;
          resampleStream.point = linePoint;
        }

        function ringEnd() {
          resampleLineTo(x0, y0, lambda0, a0, b0, c0, x00, y00, lambda00, a00, b00, c00, maxDepth, stream);
          resampleStream.lineEnd = lineEnd;
          lineEnd();
        }

        return resampleStream;
      };
    }

    var transformRadians = transformer({
      point: function(x, y) {
        this.stream.point(x * radians, y * radians);
      }
    });

    function transformRotate(rotate) {
      return transformer({
        point: function(x, y) {
          var r = rotate(x, y);
          return this.stream.point(r[0], r[1]);
        }
      });
    }

    function scaleTranslate(k, dx, dy) {
      function transform(x, y) {
        return [dx + k * x, dy - k * y];
      }
      transform.invert = function(x, y) {
        return [(x - dx) / k, (dy - y) / k];
      };
      return transform;
    }

    function scaleTranslateRotate(k, dx, dy, alpha) {
      var cosAlpha = cos(alpha),
          sinAlpha = sin(alpha),
          a = cosAlpha * k,
          b = sinAlpha * k,
          ai = cosAlpha / k,
          bi = sinAlpha / k,
          ci = (sinAlpha * dy - cosAlpha * dx) / k,
          fi = (sinAlpha * dx + cosAlpha * dy) / k;
      function transform(x, y) {
        return [a * x - b * y + dx, dy - b * x - a * y];
      }
      transform.invert = function(x, y) {
        return [ai * x - bi * y + ci, fi - bi * x - ai * y];
      };
      return transform;
    }

    function projection(project) {
      return projectionMutator(function() { return project; })();
    }

    function projectionMutator(projectAt) {
      var project,
          k = 150, // scale
          x = 480, y = 250, // translate
          lambda = 0, phi = 0, // center
          deltaLambda = 0, deltaPhi = 0, deltaGamma = 0, rotate, // pre-rotate
          alpha = 0, // post-rotate
          theta = null, preclip = clipAntimeridian, // pre-clip angle
          x0 = null, y0, x1, y1, postclip = identity, // post-clip extent
          delta2 = 0.5, // precision
          projectResample,
          projectTransform,
          projectRotateTransform,
          cache,
          cacheStream;

      function projection(point) {
        return projectRotateTransform(point[0] * radians, point[1] * radians);
      }

      function invert(point) {
        point = projectRotateTransform.invert(point[0], point[1]);
        return point && [point[0] * degrees, point[1] * degrees];
      }

      projection.stream = function(stream) {
        return cache && cacheStream === stream ? cache : cache = transformRadians(transformRotate(rotate)(preclip(projectResample(postclip(cacheStream = stream)))));
      };

      projection.preclip = function(_) {
        return arguments.length ? (preclip = _, theta = undefined, reset()) : preclip;
      };

      projection.postclip = function(_) {
        return arguments.length ? (postclip = _, x0 = y0 = x1 = y1 = null, reset()) : postclip;
      };

      projection.clipAngle = function(_) {
        return arguments.length ? (preclip = +_ ? clipCircle(theta = _ * radians) : (theta = null, clipAntimeridian), reset()) : theta * degrees;
      };

      projection.clipExtent = function(_) {
        return arguments.length ? (postclip = _ == null ? (x0 = y0 = x1 = y1 = null, identity) : clipRectangle(x0 = +_[0][0], y0 = +_[0][1], x1 = +_[1][0], y1 = +_[1][1]), reset()) : x0 == null ? null : [[x0, y0], [x1, y1]];
      };

      projection.scale = function(_) {
        return arguments.length ? (k = +_, recenter()) : k;
      };

      projection.translate = function(_) {
        return arguments.length ? (x = +_[0], y = +_[1], recenter()) : [x, y];
      };

      projection.center = function(_) {
        return arguments.length ? (lambda = _[0] % 360 * radians, phi = _[1] % 360 * radians, recenter()) : [lambda * degrees, phi * degrees];
      };

      projection.rotate = function(_) {
        return arguments.length ? (deltaLambda = _[0] % 360 * radians, deltaPhi = _[1] % 360 * radians, deltaGamma = _.length > 2 ? _[2] % 360 * radians : 0, recenter()) : [deltaLambda * degrees, deltaPhi * degrees, deltaGamma * degrees];
      };

      projection.angle = function(_) {
        return arguments.length ? (alpha = _ % 360 * radians, recenter()) : alpha * degrees;
      };

      projection.precision = function(_) {
        return arguments.length ? (projectResample = resample(projectTransform, delta2 = _ * _), reset()) : sqrt(delta2);
      };

      projection.fitExtent = function(extent, object) {
        return fitExtent(projection, extent, object);
      };

      projection.fitSize = function(size, object) {
        return fitSize(projection, size, object);
      };

      projection.fitWidth = function(width, object) {
        return fitWidth(projection, width, object);
      };

      projection.fitHeight = function(height, object) {
        return fitHeight(projection, height, object);
      };

      function recenter() {
        var center = scaleTranslateRotate(k, 0, 0, alpha).apply(null, project(lambda, phi)),
            transform = (alpha ? scaleTranslateRotate : scaleTranslate)(k, x - center[0], y - center[1], alpha);
        rotate = rotateRadians(deltaLambda, deltaPhi, deltaGamma);
        projectTransform = compose(project, transform);
        projectRotateTransform = compose(rotate, projectTransform);
        projectResample = resample(projectTransform, delta2);
        return reset();
      }

      function reset() {
        cache = cacheStream = null;
        return projection;
      }

      return function() {
        project = projectAt.apply(this, arguments);
        projection.invert = project.invert && invert;
        return recenter();
      };
    }

    function conicProjection(projectAt) {
      var phi0 = 0,
          phi1 = pi / 3,
          m = projectionMutator(projectAt),
          p = m(phi0, phi1);

      p.parallels = function(_) {
        return arguments.length ? m(phi0 = _[0] * radians, phi1 = _[1] * radians) : [phi0 * degrees, phi1 * degrees];
      };

      return p;
    }

    function cylindricalEqualAreaRaw(phi0) {
      var cosPhi0 = cos(phi0);

      function forward(lambda, phi) {
        return [lambda * cosPhi0, sin(phi) / cosPhi0];
      }

      forward.invert = function(x, y) {
        return [x / cosPhi0, asin(y * cosPhi0)];
      };

      return forward;
    }

    function conicEqualAreaRaw(y0, y1) {
      var sy0 = sin(y0), n = (sy0 + sin(y1)) / 2;

      // Are the parallels symmetrical around the Equator?
      if (abs(n) < epsilon) return cylindricalEqualAreaRaw(y0);

      var c = 1 + sy0 * (2 * n - sy0), r0 = sqrt(c) / n;

      function project(x, y) {
        var r = sqrt(c - 2 * n * sin(y)) / n;
        return [r * sin(x *= n), r0 - r * cos(x)];
      }

      project.invert = function(x, y) {
        var r0y = r0 - y;
        return [atan2(x, abs(r0y)) / n * sign(r0y), asin((c - (x * x + r0y * r0y) * n * n) / (2 * n))];
      };

      return project;
    }

    function conicEqualArea() {
      return conicProjection(conicEqualAreaRaw)
          .scale(155.424)
          .center([0, 33.6442]);
    }

    function albers() {
      return conicEqualArea()
          .parallels([29.5, 45.5])
          .scale(1070)
          .translate([480, 250])
          .rotate([96, 0])
          .center([-0.6, 38.7]);
    }

    // The projections must have mutually exclusive clip regions on the sphere,
    // as this will avoid emitting interleaving lines and polygons.
    function multiplex(streams) {
      var n = streams.length;
      return {
        point: function(x, y) { var i = -1; while (++i < n) streams[i].point(x, y); },
        sphere: function() { var i = -1; while (++i < n) streams[i].sphere(); },
        lineStart: function() { var i = -1; while (++i < n) streams[i].lineStart(); },
        lineEnd: function() { var i = -1; while (++i < n) streams[i].lineEnd(); },
        polygonStart: function() { var i = -1; while (++i < n) streams[i].polygonStart(); },
        polygonEnd: function() { var i = -1; while (++i < n) streams[i].polygonEnd(); }
      };
    }

    // A composite projection for the United States, configured by default for
    // 960×500. The projection also works quite well at 960×600 if you change the
    // scale to 1285 and adjust the translate accordingly. The set of standard
    // parallels for each region comes from USGS, which is published here:
    // http://egsc.usgs.gov/isb/pubs/MapProjections/projections.html#albers
    function albersUsa() {
      var cache,
          cacheStream,
          lower48 = albers(), lower48Point,
          alaska = conicEqualArea().rotate([154, 0]).center([-2, 58.5]).parallels([55, 65]), alaskaPoint, // EPSG:3338
          hawaii = conicEqualArea().rotate([157, 0]).center([-3, 19.9]).parallels([8, 18]), hawaiiPoint, // ESRI:102007
          point, pointStream = {point: function(x, y) { point = [x, y]; }};

      function albersUsa(coordinates) {
        var x = coordinates[0], y = coordinates[1];
        return point = null,
            (lower48Point.point(x, y), point)
            || (alaskaPoint.point(x, y), point)
            || (hawaiiPoint.point(x, y), point);
      }

      albersUsa.invert = function(coordinates) {
        var k = lower48.scale(),
            t = lower48.translate(),
            x = (coordinates[0] - t[0]) / k,
            y = (coordinates[1] - t[1]) / k;
        return (y >= 0.120 && y < 0.234 && x >= -0.425 && x < -0.214 ? alaska
            : y >= 0.166 && y < 0.234 && x >= -0.214 && x < -0.115 ? hawaii
            : lower48).invert(coordinates);
      };

      albersUsa.stream = function(stream) {
        return cache && cacheStream === stream ? cache : cache = multiplex([lower48.stream(cacheStream = stream), alaska.stream(stream), hawaii.stream(stream)]);
      };

      albersUsa.precision = function(_) {
        if (!arguments.length) return lower48.precision();
        lower48.precision(_), alaska.precision(_), hawaii.precision(_);
        return reset();
      };

      albersUsa.scale = function(_) {
        if (!arguments.length) return lower48.scale();
        lower48.scale(_), alaska.scale(_ * 0.35), hawaii.scale(_);
        return albersUsa.translate(lower48.translate());
      };

      albersUsa.translate = function(_) {
        if (!arguments.length) return lower48.translate();
        var k = lower48.scale(), x = +_[0], y = +_[1];

        lower48Point = lower48
            .translate(_)
            .clipExtent([[x - 0.455 * k, y - 0.238 * k], [x + 0.455 * k, y + 0.238 * k]])
            .stream(pointStream);

        alaskaPoint = alaska
            .translate([x - 0.307 * k, y + 0.201 * k])
            .clipExtent([[x - 0.425 * k + epsilon, y + 0.120 * k + epsilon], [x - 0.214 * k - epsilon, y + 0.234 * k - epsilon]])
            .stream(pointStream);

        hawaiiPoint = hawaii
            .translate([x - 0.205 * k, y + 0.212 * k])
            .clipExtent([[x - 0.214 * k + epsilon, y + 0.166 * k + epsilon], [x - 0.115 * k - epsilon, y + 0.234 * k - epsilon]])
            .stream(pointStream);

        return reset();
      };

      albersUsa.fitExtent = function(extent, object) {
        return fitExtent(albersUsa, extent, object);
      };

      albersUsa.fitSize = function(size, object) {
        return fitSize(albersUsa, size, object);
      };

      albersUsa.fitWidth = function(width, object) {
        return fitWidth(albersUsa, width, object);
      };

      albersUsa.fitHeight = function(height, object) {
        return fitHeight(albersUsa, height, object);
      };

      function reset() {
        cache = cacheStream = null;
        return albersUsa;
      }

      return albersUsa.scale(1070);
    }

    function azimuthalRaw(scale) {
      return function(x, y) {
        var cx = cos(x),
            cy = cos(y),
            k = scale(cx * cy);
        return [
          k * cy * sin(x),
          k * sin(y)
        ];
      }
    }

    function azimuthalInvert(angle) {
      return function(x, y) {
        var z = sqrt(x * x + y * y),
            c = angle(z),
            sc = sin(c),
            cc = cos(c);
        return [
          atan2(x * sc, z * cc),
          asin(z && y * sc / z)
        ];
      }
    }

    var azimuthalEqualAreaRaw = azimuthalRaw(function(cxcy) {
      return sqrt(2 / (1 + cxcy));
    });

    azimuthalEqualAreaRaw.invert = azimuthalInvert(function(z) {
      return 2 * asin(z / 2);
    });

    function azimuthalEqualArea() {
      return projection(azimuthalEqualAreaRaw)
          .scale(124.75)
          .clipAngle(180 - 1e-3);
    }

    var azimuthalEquidistantRaw = azimuthalRaw(function(c) {
      return (c = acos(c)) && c / sin(c);
    });

    azimuthalEquidistantRaw.invert = azimuthalInvert(function(z) {
      return z;
    });

    function azimuthalEquidistant() {
      return projection(azimuthalEquidistantRaw)
          .scale(79.4188)
          .clipAngle(180 - 1e-3);
    }

    function mercatorRaw(lambda, phi) {
      return [lambda, log(tan((halfPi + phi) / 2))];
    }

    mercatorRaw.invert = function(x, y) {
      return [x, 2 * atan(exp(y)) - halfPi];
    };

    function mercator() {
      return mercatorProjection(mercatorRaw)
          .scale(961 / tau);
    }

    function mercatorProjection(project) {
      var m = projection(project),
          center = m.center,
          scale = m.scale,
          translate = m.translate,
          clipExtent = m.clipExtent,
          x0 = null, y0, x1, y1; // clip extent

      m.scale = function(_) {
        return arguments.length ? (scale(_), reclip()) : scale();
      };

      m.translate = function(_) {
        return arguments.length ? (translate(_), reclip()) : translate();
      };

      m.center = function(_) {
        return arguments.length ? (center(_), reclip()) : center();
      };

      m.clipExtent = function(_) {
        return arguments.length ? ((_ == null ? x0 = y0 = x1 = y1 = null : (x0 = +_[0][0], y0 = +_[0][1], x1 = +_[1][0], y1 = +_[1][1])), reclip()) : x0 == null ? null : [[x0, y0], [x1, y1]];
      };

      function reclip() {
        var k = pi * scale(),
            t = m(rotation(m.rotate()).invert([0, 0]));
        return clipExtent(x0 == null
            ? [[t[0] - k, t[1] - k], [t[0] + k, t[1] + k]] : project === mercatorRaw
            ? [[Math.max(t[0] - k, x0), y0], [Math.min(t[0] + k, x1), y1]]
            : [[x0, Math.max(t[1] - k, y0)], [x1, Math.min(t[1] + k, y1)]]);
      }

      return reclip();
    }

    function tany(y) {
      return tan((halfPi + y) / 2);
    }

    function conicConformalRaw(y0, y1) {
      var cy0 = cos(y0),
          n = y0 === y1 ? sin(y0) : log(cy0 / cos(y1)) / log(tany(y1) / tany(y0)),
          f = cy0 * pow(tany(y0), n) / n;

      if (!n) return mercatorRaw;

      function project(x, y) {
        if (f > 0) { if (y < -halfPi + epsilon) y = -halfPi + epsilon; }
        else { if (y > halfPi - epsilon) y = halfPi - epsilon; }
        var r = f / pow(tany(y), n);
        return [r * sin(n * x), f - r * cos(n * x)];
      }

      project.invert = function(x, y) {
        var fy = f - y, r = sign(n) * sqrt(x * x + fy * fy);
        return [atan2(x, abs(fy)) / n * sign(fy), 2 * atan(pow(f / r, 1 / n)) - halfPi];
      };

      return project;
    }

    function conicConformal() {
      return conicProjection(conicConformalRaw)
          .scale(109.5)
          .parallels([30, 30]);
    }

    function equirectangularRaw(lambda, phi) {
      return [lambda, phi];
    }

    equirectangularRaw.invert = equirectangularRaw;

    function equirectangular() {
      return projection(equirectangularRaw)
          .scale(152.63);
    }

    function conicEquidistantRaw(y0, y1) {
      var cy0 = cos(y0),
          n = y0 === y1 ? sin(y0) : (cy0 - cos(y1)) / (y1 - y0),
          g = cy0 / n + y0;

      if (abs(n) < epsilon) return equirectangularRaw;

      function project(x, y) {
        var gy = g - y, nx = n * x;
        return [gy * sin(nx), g - gy * cos(nx)];
      }

      project.invert = function(x, y) {
        var gy = g - y;
        return [atan2(x, abs(gy)) / n * sign(gy), g - sign(n) * sqrt(x * x + gy * gy)];
      };

      return project;
    }

    function conicEquidistant() {
      return conicProjection(conicEquidistantRaw)
          .scale(131.154)
          .center([0, 13.9389]);
    }

    var A1 = 1.340264,
        A2 = -0.081106,
        A3 = 0.000893,
        A4 = 0.003796,
        M = sqrt(3) / 2,
        iterations = 12;

    function equalEarthRaw(lambda, phi) {
      var l = asin(M * sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
      return [
        lambda * cos(l) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2))),
        l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2))
      ];
    }

    equalEarthRaw.invert = function(x, y) {
      var l = y, l2 = l * l, l6 = l2 * l2 * l2;
      for (var i = 0, delta, fy, fpy; i < iterations; ++i) {
        fy = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2)) - y;
        fpy = A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2);
        l -= delta = fy / fpy, l2 = l * l, l6 = l2 * l2 * l2;
        if (abs(delta) < epsilon2) break;
      }
      return [
        M * x * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)) / cos(l),
        asin(sin(l) / M)
      ];
    };

    function equalEarth() {
      return projection(equalEarthRaw)
          .scale(177.158);
    }

    function gnomonicRaw(x, y) {
      var cy = cos(y), k = cos(x) * cy;
      return [cy * sin(x) / k, sin(y) / k];
    }

    gnomonicRaw.invert = azimuthalInvert(atan);

    function gnomonic() {
      return projection(gnomonicRaw)
          .scale(144.049)
          .clipAngle(60);
    }

    function scaleTranslate$1(kx, ky, tx, ty) {
      return kx === 1 && ky === 1 && tx === 0 && ty === 0 ? identity : transformer({
        point: function(x, y) {
          this.stream.point(x * kx + tx, y * ky + ty);
        }
      });
    }

    function identity$1() {
      var k = 1, tx = 0, ty = 0, sx = 1, sy = 1, transform = identity, // scale, translate and reflect
          x0 = null, y0, x1, y1, // clip extent
          postclip = identity,
          cache,
          cacheStream,
          projection;

      function reset() {
        cache = cacheStream = null;
        return projection;
      }

      return projection = {
        stream: function(stream) {
          return cache && cacheStream === stream ? cache : cache = transform(postclip(cacheStream = stream));
        },
        postclip: function(_) {
          return arguments.length ? (postclip = _, x0 = y0 = x1 = y1 = null, reset()) : postclip;
        },
        clipExtent: function(_) {
          return arguments.length ? (postclip = _ == null ? (x0 = y0 = x1 = y1 = null, identity) : clipRectangle(x0 = +_[0][0], y0 = +_[0][1], x1 = +_[1][0], y1 = +_[1][1]), reset()) : x0 == null ? null : [[x0, y0], [x1, y1]];
        },
        scale: function(_) {
          return arguments.length ? (transform = scaleTranslate$1((k = +_) * sx, k * sy, tx, ty), reset()) : k;
        },
        translate: function(_) {
          return arguments.length ? (transform = scaleTranslate$1(k * sx, k * sy, tx = +_[0], ty = +_[1]), reset()) : [tx, ty];
        },
        reflectX: function(_) {
          return arguments.length ? (transform = scaleTranslate$1(k * (sx = _ ? -1 : 1), k * sy, tx, ty), reset()) : sx < 0;
        },
        reflectY: function(_) {
          return arguments.length ? (transform = scaleTranslate$1(k * sx, k * (sy = _ ? -1 : 1), tx, ty), reset()) : sy < 0;
        },
        fitExtent: function(extent, object) {
          return fitExtent(projection, extent, object);
        },
        fitSize: function(size, object) {
          return fitSize(projection, size, object);
        },
        fitWidth: function(width, object) {
          return fitWidth(projection, width, object);
        },
        fitHeight: function(height, object) {
          return fitHeight(projection, height, object);
        }
      };
    }

    function naturalEarth1Raw(lambda, phi) {
      var phi2 = phi * phi, phi4 = phi2 * phi2;
      return [
        lambda * (0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4))),
        phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)))
      ];
    }

    naturalEarth1Raw.invert = function(x, y) {
      var phi = y, i = 25, delta;
      do {
        var phi2 = phi * phi, phi4 = phi2 * phi2;
        phi -= delta = (phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4))) - y) /
            (1.007226 + phi2 * (0.015085 * 3 + phi4 * (-0.044475 * 7 + 0.028874 * 9 * phi2 - 0.005916 * 11 * phi4)));
      } while (abs(delta) > epsilon && --i > 0);
      return [
        x / (0.8707 + (phi2 = phi * phi) * (-0.131979 + phi2 * (-0.013791 + phi2 * phi2 * phi2 * (0.003971 - 0.001529 * phi2)))),
        phi
      ];
    };

    function naturalEarth1() {
      return projection(naturalEarth1Raw)
          .scale(175.295);
    }

    function orthographicRaw(x, y) {
      return [cos(y) * sin(x), sin(y)];
    }

    orthographicRaw.invert = azimuthalInvert(asin);

    function orthographic() {
      return projection(orthographicRaw)
          .scale(249.5)
          .clipAngle(90 + epsilon);
    }

    function stereographicRaw(x, y) {
      var cy = cos(y), k = 1 + cos(x) * cy;
      return [cy * sin(x) / k, sin(y) / k];
    }

    stereographicRaw.invert = azimuthalInvert(function(z) {
      return 2 * atan(z);
    });

    function stereographic() {
      return projection(stereographicRaw)
          .scale(250)
          .clipAngle(142);
    }

    function transverseMercatorRaw(lambda, phi) {
      return [log(tan((halfPi + phi) / 2)), -lambda];
    }

    transverseMercatorRaw.invert = function(x, y) {
      return [-y, 2 * atan(exp(x)) - halfPi];
    };

    function transverseMercator() {
      var m = mercatorProjection(transverseMercatorRaw),
          center = m.center,
          rotate = m.rotate;

      m.center = function(_) {
        return arguments.length ? center([-_[1], _[0]]) : (_ = center(), [_[1], -_[0]]);
      };

      m.rotate = function(_) {
        return arguments.length ? rotate([_[0], _[1], _.length > 2 ? _[2] + 90 : 90]) : (_ = rotate(), [_[0], _[1], _[2] - 90]);
      };

      return rotate([0, 0, 90])
          .scale(159.155);
    }

    var d3Geo = /*#__PURE__*/Object.freeze({
        __proto__: null,
        geoArea: area,
        geoBounds: bounds,
        geoCentroid: centroid,
        geoCircle: circle,
        geoClipAntimeridian: clipAntimeridian,
        geoClipCircle: clipCircle,
        geoClipExtent: extent,
        geoClipRectangle: clipRectangle,
        geoContains: contains,
        geoDistance: distance,
        geoGraticule: graticule,
        geoGraticule10: graticule10,
        geoInterpolate: interpolate,
        geoLength: length,
        geoPath: index,
        geoAlbers: albers,
        geoAlbersUsa: albersUsa,
        geoAzimuthalEqualArea: azimuthalEqualArea,
        geoAzimuthalEqualAreaRaw: azimuthalEqualAreaRaw,
        geoAzimuthalEquidistant: azimuthalEquidistant,
        geoAzimuthalEquidistantRaw: azimuthalEquidistantRaw,
        geoConicConformal: conicConformal,
        geoConicConformalRaw: conicConformalRaw,
        geoConicEqualArea: conicEqualArea,
        geoConicEqualAreaRaw: conicEqualAreaRaw,
        geoConicEquidistant: conicEquidistant,
        geoConicEquidistantRaw: conicEquidistantRaw,
        geoEqualEarth: equalEarth,
        geoEqualEarthRaw: equalEarthRaw,
        geoEquirectangular: equirectangular,
        geoEquirectangularRaw: equirectangularRaw,
        geoGnomonic: gnomonic,
        geoGnomonicRaw: gnomonicRaw,
        geoIdentity: identity$1,
        geoProjection: projection,
        geoProjectionMutator: projectionMutator,
        geoMercator: mercator,
        geoMercatorRaw: mercatorRaw,
        geoNaturalEarth1: naturalEarth1,
        geoNaturalEarth1Raw: naturalEarth1Raw,
        geoOrthographic: orthographic,
        geoOrthographicRaw: orthographicRaw,
        geoStereographic: stereographic,
        geoStereographicRaw: stereographicRaw,
        geoTransverseMercator: transverseMercator,
        geoTransverseMercatorRaw: transverseMercatorRaw,
        geoRotation: rotation,
        geoStream: geoStream,
        geoTransform: transform
    });

    function identity$2(x) {
      return x;
    }

    function transform$1(transform) {
      if (transform == null) return identity$2;
      var x0,
          y0,
          kx = transform.scale[0],
          ky = transform.scale[1],
          dx = transform.translate[0],
          dy = transform.translate[1];
      return function(input, i) {
        if (!i) x0 = y0 = 0;
        var j = 2, n = input.length, output = new Array(n);
        output[0] = (x0 += input[0]) * kx + dx;
        output[1] = (y0 += input[1]) * ky + dy;
        while (j < n) output[j] = input[j], ++j;
        return output;
      };
    }

    function bbox(topology) {
      var t = transform$1(topology.transform), key,
          x0 = Infinity, y0 = x0, x1 = -x0, y1 = -x0;

      function bboxPoint(p) {
        p = t(p);
        if (p[0] < x0) x0 = p[0];
        if (p[0] > x1) x1 = p[0];
        if (p[1] < y0) y0 = p[1];
        if (p[1] > y1) y1 = p[1];
      }

      function bboxGeometry(o) {
        switch (o.type) {
          case "GeometryCollection": o.geometries.forEach(bboxGeometry); break;
          case "Point": bboxPoint(o.coordinates); break;
          case "MultiPoint": o.coordinates.forEach(bboxPoint); break;
        }
      }

      topology.arcs.forEach(function(arc) {
        var i = -1, n = arc.length, p;
        while (++i < n) {
          p = t(arc[i], i);
          if (p[0] < x0) x0 = p[0];
          if (p[0] > x1) x1 = p[0];
          if (p[1] < y0) y0 = p[1];
          if (p[1] > y1) y1 = p[1];
        }
      });

      for (key in topology.objects) {
        bboxGeometry(topology.objects[key]);
      }

      return [x0, y0, x1, y1];
    }

    function reverse(array, n) {
      var t, j = array.length, i = j - n;
      while (i < --j) t = array[i], array[i++] = array[j], array[j] = t;
    }

    function feature(topology, o) {
      if (typeof o === "string") o = topology.objects[o];
      return o.type === "GeometryCollection"
          ? {type: "FeatureCollection", features: o.geometries.map(function(o) { return feature$1(topology, o); })}
          : feature$1(topology, o);
    }

    function feature$1(topology, o) {
      var id = o.id,
          bbox = o.bbox,
          properties = o.properties == null ? {} : o.properties,
          geometry = object$1(topology, o);
      return id == null && bbox == null ? {type: "Feature", properties: properties, geometry: geometry}
          : bbox == null ? {type: "Feature", id: id, properties: properties, geometry: geometry}
          : {type: "Feature", id: id, bbox: bbox, properties: properties, geometry: geometry};
    }

    function object$1(topology, o) {
      var transformPoint = transform$1(topology.transform),
          arcs = topology.arcs;

      function arc(i, points) {
        if (points.length) points.pop();
        for (var a = arcs[i < 0 ? ~i : i], k = 0, n = a.length; k < n; ++k) {
          points.push(transformPoint(a[k], k));
        }
        if (i < 0) reverse(points, n);
      }

      function point(p) {
        return transformPoint(p);
      }

      function line(arcs) {
        var points = [];
        for (var i = 0, n = arcs.length; i < n; ++i) arc(arcs[i], points);
        if (points.length < 2) points.push(points[0]); // This should never happen per the specification.
        return points;
      }

      function ring(arcs) {
        var points = line(arcs);
        while (points.length < 4) points.push(points[0]); // This may happen if an arc has only two points.
        return points;
      }

      function polygon(arcs) {
        return arcs.map(ring);
      }

      function geometry(o) {
        var type = o.type, coordinates;
        switch (type) {
          case "GeometryCollection": return {type: type, geometries: o.geometries.map(geometry)};
          case "Point": coordinates = point(o.coordinates); break;
          case "MultiPoint": coordinates = o.coordinates.map(point); break;
          case "LineString": coordinates = line(o.arcs); break;
          case "MultiLineString": coordinates = o.arcs.map(line); break;
          case "Polygon": coordinates = polygon(o.arcs); break;
          case "MultiPolygon": coordinates = o.arcs.map(polygon); break;
          default: return null;
        }
        return {type: type, coordinates: coordinates};
      }

      return geometry(o);
    }

    function stitch(topology, arcs) {
      var stitchedArcs = {},
          fragmentByStart = {},
          fragmentByEnd = {},
          fragments = [],
          emptyIndex = -1;

      // Stitch empty arcs first, since they may be subsumed by other arcs.
      arcs.forEach(function(i, j) {
        var arc = topology.arcs[i < 0 ? ~i : i], t;
        if (arc.length < 3 && !arc[1][0] && !arc[1][1]) {
          t = arcs[++emptyIndex], arcs[emptyIndex] = i, arcs[j] = t;
        }
      });

      arcs.forEach(function(i) {
        var e = ends(i),
            start = e[0],
            end = e[1],
            f, g;

        if (f = fragmentByEnd[start]) {
          delete fragmentByEnd[f.end];
          f.push(i);
          f.end = end;
          if (g = fragmentByStart[end]) {
            delete fragmentByStart[g.start];
            var fg = g === f ? f : f.concat(g);
            fragmentByStart[fg.start = f.start] = fragmentByEnd[fg.end = g.end] = fg;
          } else {
            fragmentByStart[f.start] = fragmentByEnd[f.end] = f;
          }
        } else if (f = fragmentByStart[end]) {
          delete fragmentByStart[f.start];
          f.unshift(i);
          f.start = start;
          if (g = fragmentByEnd[start]) {
            delete fragmentByEnd[g.end];
            var gf = g === f ? f : g.concat(f);
            fragmentByStart[gf.start = g.start] = fragmentByEnd[gf.end = f.end] = gf;
          } else {
            fragmentByStart[f.start] = fragmentByEnd[f.end] = f;
          }
        } else {
          f = [i];
          fragmentByStart[f.start = start] = fragmentByEnd[f.end = end] = f;
        }
      });

      function ends(i) {
        var arc = topology.arcs[i < 0 ? ~i : i], p0 = arc[0], p1;
        if (topology.transform) p1 = [0, 0], arc.forEach(function(dp) { p1[0] += dp[0], p1[1] += dp[1]; });
        else p1 = arc[arc.length - 1];
        return i < 0 ? [p1, p0] : [p0, p1];
      }

      function flush(fragmentByEnd, fragmentByStart) {
        for (var k in fragmentByEnd) {
          var f = fragmentByEnd[k];
          delete fragmentByStart[f.start];
          delete f.start;
          delete f.end;
          f.forEach(function(i) { stitchedArcs[i < 0 ? ~i : i] = 1; });
          fragments.push(f);
        }
      }

      flush(fragmentByEnd, fragmentByStart);
      flush(fragmentByStart, fragmentByEnd);
      arcs.forEach(function(i) { if (!stitchedArcs[i < 0 ? ~i : i]) fragments.push([i]); });

      return fragments;
    }

    function mesh(topology) {
      return object$1(topology, meshArcs.apply(this, arguments));
    }

    function meshArcs(topology, object, filter) {
      var arcs, i, n;
      if (arguments.length > 1) arcs = extractArcs(topology, object, filter);
      else for (i = 0, arcs = new Array(n = topology.arcs.length); i < n; ++i) arcs[i] = i;
      return {type: "MultiLineString", arcs: stitch(topology, arcs)};
    }

    function extractArcs(topology, object, filter) {
      var arcs = [],
          geomsByArc = [],
          geom;

      function extract0(i) {
        var j = i < 0 ? ~i : i;
        (geomsByArc[j] || (geomsByArc[j] = [])).push({i: i, g: geom});
      }

      function extract1(arcs) {
        arcs.forEach(extract0);
      }

      function extract2(arcs) {
        arcs.forEach(extract1);
      }

      function extract3(arcs) {
        arcs.forEach(extract2);
      }

      function geometry(o) {
        switch (geom = o, o.type) {
          case "GeometryCollection": o.geometries.forEach(geometry); break;
          case "LineString": extract1(o.arcs); break;
          case "MultiLineString": case "Polygon": extract2(o.arcs); break;
          case "MultiPolygon": extract3(o.arcs); break;
        }
      }

      geometry(object);

      geomsByArc.forEach(filter == null
          ? function(geoms) { arcs.push(geoms[0].i); }
          : function(geoms) { if (filter(geoms[0].g, geoms[geoms.length - 1].g)) arcs.push(geoms[0].i); });

      return arcs;
    }

    function planarRingArea(ring) {
      var i = -1, n = ring.length, a, b = ring[n - 1], area = 0;
      while (++i < n) a = b, b = ring[i], area += a[0] * b[1] - a[1] * b[0];
      return Math.abs(area); // Note: doubled area!
    }

    function merge$1(topology) {
      return object$1(topology, mergeArcs.apply(this, arguments));
    }

    function mergeArcs(topology, objects) {
      var polygonsByArc = {},
          polygons = [],
          groups = [];

      objects.forEach(geometry);

      function geometry(o) {
        switch (o.type) {
          case "GeometryCollection": o.geometries.forEach(geometry); break;
          case "Polygon": extract(o.arcs); break;
          case "MultiPolygon": o.arcs.forEach(extract); break;
        }
      }

      function extract(polygon) {
        polygon.forEach(function(ring) {
          ring.forEach(function(arc) {
            (polygonsByArc[arc = arc < 0 ? ~arc : arc] || (polygonsByArc[arc] = [])).push(polygon);
          });
        });
        polygons.push(polygon);
      }

      function area(ring) {
        return planarRingArea(object$1(topology, {type: "Polygon", arcs: [ring]}).coordinates[0]);
      }

      polygons.forEach(function(polygon) {
        if (!polygon._) {
          var group = [],
              neighbors = [polygon];
          polygon._ = 1;
          groups.push(group);
          while (polygon = neighbors.pop()) {
            group.push(polygon);
            polygon.forEach(function(ring) {
              ring.forEach(function(arc) {
                polygonsByArc[arc < 0 ? ~arc : arc].forEach(function(polygon) {
                  if (!polygon._) {
                    polygon._ = 1;
                    neighbors.push(polygon);
                  }
                });
              });
            });
          }
        }
      });

      polygons.forEach(function(polygon) {
        delete polygon._;
      });

      return {
        type: "MultiPolygon",
        arcs: groups.map(function(polygons) {
          var arcs = [], n;

          // Extract the exterior (unique) arcs.
          polygons.forEach(function(polygon) {
            polygon.forEach(function(ring) {
              ring.forEach(function(arc) {
                if (polygonsByArc[arc < 0 ? ~arc : arc].length < 2) {
                  arcs.push(arc);
                }
              });
            });
          });

          // Stitch the arcs into one or more rings.
          arcs = stitch(topology, arcs);

          // If more than one ring is returned,
          // at most one of these rings can be the exterior;
          // choose the one with the greatest absolute area.
          if ((n = arcs.length) > 1) {
            for (var i = 1, k = area(arcs[0]), ki, t; i < n; ++i) {
              if ((ki = area(arcs[i])) > k) {
                t = arcs[0], arcs[0] = arcs[i], arcs[i] = t, k = ki;
              }
            }
          }

          return arcs;
        }).filter(function(arcs) {
          return arcs.length > 0;
        })
      };
    }

    function bisect(a, x) {
      var lo = 0, hi = a.length;
      while (lo < hi) {
        var mid = lo + hi >>> 1;
        if (a[mid] < x) lo = mid + 1;
        else hi = mid;
      }
      return lo;
    }

    function neighbors(objects) {
      var indexesByArc = {}, // arc index -> array of object indexes
          neighbors = objects.map(function() { return []; });

      function line(arcs, i) {
        arcs.forEach(function(a) {
          if (a < 0) a = ~a;
          var o = indexesByArc[a];
          if (o) o.push(i);
          else indexesByArc[a] = [i];
        });
      }

      function polygon(arcs, i) {
        arcs.forEach(function(arc) { line(arc, i); });
      }

      function geometry(o, i) {
        if (o.type === "GeometryCollection") o.geometries.forEach(function(o) { geometry(o, i); });
        else if (o.type in geometryType) geometryType[o.type](o.arcs, i);
      }

      var geometryType = {
        LineString: line,
        MultiLineString: polygon,
        Polygon: polygon,
        MultiPolygon: function(arcs, i) { arcs.forEach(function(arc) { polygon(arc, i); }); }
      };

      objects.forEach(geometry);

      for (var i in indexesByArc) {
        for (var indexes = indexesByArc[i], m = indexes.length, j = 0; j < m; ++j) {
          for (var k = j + 1; k < m; ++k) {
            var ij = indexes[j], ik = indexes[k], n;
            if ((n = neighbors[ij])[i = bisect(n, ik)] !== ik) n.splice(i, 0, ik);
            if ((n = neighbors[ik])[i = bisect(n, ij)] !== ij) n.splice(i, 0, ij);
          }
        }
      }

      return neighbors;
    }

    function untransform(transform) {
      if (transform == null) return identity$2;
      var x0,
          y0,
          kx = transform.scale[0],
          ky = transform.scale[1],
          dx = transform.translate[0],
          dy = transform.translate[1];
      return function(input, i) {
        if (!i) x0 = y0 = 0;
        var j = 2,
            n = input.length,
            output = new Array(n),
            x1 = Math.round((input[0] - dx) / kx),
            y1 = Math.round((input[1] - dy) / ky);
        output[0] = x1 - x0, x0 = x1;
        output[1] = y1 - y0, y0 = y1;
        while (j < n) output[j] = input[j], ++j;
        return output;
      };
    }

    function quantize(topology, transform) {
      if (topology.transform) throw new Error("already quantized");

      if (!transform || !transform.scale) {
        if (!((n = Math.floor(transform)) >= 2)) throw new Error("n must be ≥2");
        box = topology.bbox || bbox(topology);
        var x0 = box[0], y0 = box[1], x1 = box[2], y1 = box[3], n;
        transform = {scale: [x1 - x0 ? (x1 - x0) / (n - 1) : 1, y1 - y0 ? (y1 - y0) / (n - 1) : 1], translate: [x0, y0]};
      } else {
        box = topology.bbox;
      }

      var t = untransform(transform), box, key, inputs = topology.objects, outputs = {};

      function quantizePoint(point) {
        return t(point);
      }

      function quantizeGeometry(input) {
        var output;
        switch (input.type) {
          case "GeometryCollection": output = {type: "GeometryCollection", geometries: input.geometries.map(quantizeGeometry)}; break;
          case "Point": output = {type: "Point", coordinates: quantizePoint(input.coordinates)}; break;
          case "MultiPoint": output = {type: "MultiPoint", coordinates: input.coordinates.map(quantizePoint)}; break;
          default: return input;
        }
        if (input.id != null) output.id = input.id;
        if (input.bbox != null) output.bbox = input.bbox;
        if (input.properties != null) output.properties = input.properties;
        return output;
      }

      function quantizeArc(input) {
        var i = 0, j = 1, n = input.length, p, output = new Array(n); // pessimistic
        output[0] = t(input[0], 0);
        while (++i < n) if ((p = t(input[i], i))[0] || p[1]) output[j++] = p; // non-coincident points
        if (j === 1) output[j++] = [0, 0]; // an arc must have at least two points
        output.length = j;
        return output;
      }

      for (key in inputs) outputs[key] = quantizeGeometry(inputs[key]);

      return {
        type: "Topology",
        bbox: box,
        transform: transform,
        objects: outputs,
        arcs: topology.arcs.map(quantizeArc)
      };
    }

    var topojson = /*#__PURE__*/Object.freeze({
        __proto__: null,
        bbox: bbox,
        feature: feature,
        mesh: mesh,
        meshArcs: meshArcs,
        merge: merge$1,
        mergeArcs: mergeArcs,
        neighbors: neighbors,
        quantize: quantize,
        transform: transform$1,
        untransform: untransform
    });

    function createCommonjsModule(fn, module) {
    	return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    function commonjsRequire () {
    	throw new Error('Dynamic requires are not currently supported by @rollup/plugin-commonjs');
    }

    var spencerColor = createCommonjsModule(function (module, exports) {
    !function(e){module.exports=e();}(function(){return function u(i,a,c){function f(r,e){if(!a[r]){if(!i[r]){var o="function"==typeof commonjsRequire&&commonjsRequire;if(!e&&o)return o(r,!0);if(d)return d(r,!0);var n=new Error("Cannot find module '"+r+"'");throw n.code="MODULE_NOT_FOUND",n}var t=a[r]={exports:{}};i[r][0].call(t.exports,function(e){return f(i[r][1][e]||e)},t,t.exports,u,i,a,c);}return a[r].exports}for(var d="function"==typeof commonjsRequire&&commonjsRequire,e=0;e<c.length;e++)f(c[e]);return f}({1:[function(e,r,o){r.exports={blue:"#6699cc",green:"#6accb2",yellow:"#e1e6b3",red:"#cc7066",pink:"#F2C0BB",brown:"#705E5C",orange:"#cc8a66",purple:"#d8b3e6",navy:"#335799",olive:"#7f9c6c",fuscia:"#735873",beige:"#e6d7b3",slate:"#8C8C88",suede:"#9c896c",burnt:"#603a39",sea:"#50617A",sky:"#2D85A8",night:"#303b50",rouge:"#914045",grey:"#838B91",mud:"#C4ABAB",royal:"#275291",cherry:"#cc6966",tulip:"#e6b3bc",rose:"#D68881",fire:"#AB5850",greyblue:"#72697D",greygreen:"#8BA3A2",greypurple:"#978BA3",burn:"#6D5685",slategrey:"#bfb0b3",light:"#a3a5a5",lighter:"#d7d5d2",fudge:"#4d4d4d",lightgrey:"#949a9e",white:"#fbfbfb",dimgrey:"#606c74",softblack:"#463D4F",dark:"#443d3d",black:"#333333"};},{}],2:[function(e,r,o){var n=e("./colors"),t={juno:["blue","mud","navy","slate","pink","burn"],barrow:["rouge","red","orange","burnt","brown","greygreen"],roma:["#8a849a","#b5b0bf","rose","lighter","greygreen","mud"],palmer:["red","navy","olive","pink","suede","sky"],mark:["#848f9a","#9aa4ac","slate","#b0b8bf","mud","grey"],salmon:["sky","sea","fuscia","slate","mud","fudge"],dupont:["green","brown","orange","red","olive","blue"],bloor:["night","navy","beige","rouge","mud","grey"],yukon:["mud","slate","brown","sky","beige","red"],david:["blue","green","yellow","red","pink","light"],neste:["mud","cherry","royal","rouge","greygreen","greypurple"],ken:["red","sky","#c67a53","greygreen","#dfb59f","mud"]};Object.keys(t).forEach(function(e){t[e]=t[e].map(function(e){return n[e]||e});}),r.exports=t;},{"./colors":1}],3:[function(e,r,o){var n=e("./colors"),t=e("./combos"),u={colors:n,list:Object.keys(n).map(function(e){return n[e]}),combos:t};r.exports=u;},{"./colors":1,"./combos":2}]},{},[3])(3)});
    });

    /* node_modules/somehow-maps/src/shapes/Shape.svelte generated by Svelte v3.22.3 */
    const file = "node_modules/somehow-maps/src/shapes/Shape.svelte";

    function create_fragment(ctx) {
    	let path;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", /*d*/ ctx[2]);
    			attr_dev(path, "fill", /*fill*/ ctx[1]);
    			attr_dev(path, "stroke", /*stroke*/ ctx[0]);
    			attr_dev(path, "shape-rendering", "geometricPrecision");
    			add_location(path, file, 22, 0, 630);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, path, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*fill*/ 2) {
    				attr_dev(path, "fill", /*fill*/ ctx[1]);
    			}

    			if (dirty & /*stroke*/ 1) {
    				attr_dev(path, "stroke", /*stroke*/ ctx[0]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { shape = "" } = $$props;
    	let { stroke = "lightgrey" } = $$props;
    	let { fill = "white" } = $$props;
    	fill = spencerColor.colors[fill] || fill;
    	stroke = spencerColor.colors[stroke] || stroke;
    	let projection = getContext("projection");
    	const toPath = index().projection(projection);

    	// console.log(shape)
    	// let key = Object.keys(shape.objects)[0]
    	// let geoJSON = topojson.feature(shape, shape.objects[key])
    	// console.log(geoJSON)
    	let d = toPath(shape);

    	const writable_props = ["shape", "stroke", "fill"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Shape> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Shape", $$slots, []);

    	$$self.$set = $$props => {
    		if ("shape" in $$props) $$invalidate(3, shape = $$props.shape);
    		if ("stroke" in $$props) $$invalidate(0, stroke = $$props.stroke);
    		if ("fill" in $$props) $$invalidate(1, fill = $$props.fill);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		d3Geo,
    		topojson,
    		c: spencerColor,
    		shape,
    		stroke,
    		fill,
    		projection,
    		toPath,
    		d
    	});

    	$$self.$inject_state = $$props => {
    		if ("shape" in $$props) $$invalidate(3, shape = $$props.shape);
    		if ("stroke" in $$props) $$invalidate(0, stroke = $$props.stroke);
    		if ("fill" in $$props) $$invalidate(1, fill = $$props.fill);
    		if ("projection" in $$props) projection = $$props.projection;
    		if ("d" in $$props) $$invalidate(2, d = $$props.d);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [stroke, fill, d, shape];
    }

    class Shape extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { shape: 3, stroke: 0, fill: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Shape",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get shape() {
    		throw new Error("<Shape>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set shape(value) {
    		throw new Error("<Shape>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stroke() {
    		throw new Error("<Shape>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stroke(value) {
    		throw new Error("<Shape>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fill() {
    		throw new Error("<Shape>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fill(value) {
    		throw new Error("<Shape>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    //  latitude / longitude
    //  (-90|90) /  (-180|180)
    //
    // places with more than 5m people
    var cities = {
      tokyo: [35.68972, 139.69222],
      delhi: [28.61, 77.23],
      shanghai: [31.22861, 121.47472],
      'sao paulo': [-23.55, -46.63333],
      'mexico city': [19.43333, -99.13333],
      cairo: [30.03333, 31.23333],
      mumbai: [18.975, 72.82583],
      beijing: [39.9069, 116.3976],
      dhaka: [23.76389, 90.38889],
      osaka: [34.69389, 135.50222],
      'new york city': [40.661, -73.944],
      karachi: [24.86, 67.01],
      'buenos aires': [-34.60333, -58.38167],
      chongqing: [29.5637, 106.5504],
      istanbul: [41.01361, 28.955],
      kolkata: [22.5726, 88.3639],
      manila: [14.58, 121],
      lagos: [6.45503, 3.38408],
      'rio de janeiro': [-22.90833, -43.19639],
      tianjin: [39.1336, 117.2054],
      kinshasa: [-4.325, 15.32222],
      guangzhou: [23.132, 113.266],
      'los angeles': [34.05, -118.25],
      moscow: [55.75583, 37.61722],
      shenzhen: [22.5415, 114.0596],
      lahore: [31.54972, 74.34361],
      bangalore: [12.98333, 77.58333],
      paris: [48.85661, 2.35222],
      bogotá: [4.71111, -74.07222],
      jakarta: [-6.2, 106.81667],
      chennai: [13.08333, 80.26667],
      lima: [-12.05, -77.03333],
      bangkok: [13.7525, 100.49417],
      seoul: [37.56667, 126.96667],
      nagoya: [35.18333, 136.9],
      hyderabad: [17.37, 78.48],
      london: [51.50722, -0.1275],
      tehran: [35.68917, 51.38889],
      chicago: [41.82192, -87.70304],
      chengdu: [30.657, 104.066],
      nanjing: [32.0614, 118.7636],
      wuhan: [30.5934, 114.3046],
      'ho chi minh city': [10.8, 106.65],
      luanda: [-8.83833, 13.23444],
      ahmedabad: [23.03, 72.58],
      'kuala lumpur': [3.14778, 101.69528],
      "xi'an": [34.265, 108.954],
      'hong kong': [22.3, 114.2],
      dongguan: [23.021, 113.752],
      hangzhou: [30.267, 120.153],
      foshan: [23.0214, 113.1216],
      shenyang: [41.8047, 123.434],
      riyadh: [24.63333, 46.71667],
      baghdad: [33.33333, 44.38333],
      santiago: [-33.45, -70.66667],
      surat: [21.17024, 72.83106],
      madrid: [40.38333, -3.71667],
      suzhou: [31.2998, 120.5853],
      pune: [18.52028, 73.85667],
      harbin: [45.7576, 126.6409],
      houston: [29.76278, -95.38306],
      dallas: [32.77917, -96.80889],
      toronto: [43.74167, -79.37333],
      'dar es salaam': [-6.8, 39.28333],
      miami: [25.77528, -80.20889],
      'belo horizonte': [-19.91667, -43.93333],
      singapore: [1.28333, 103.83333],
      philadelphia: [39.95278, -75.16361],
      atlanta: [33.755, -84.39],
      fukuoka: [33.58333, 130.4],
      khartoum: [15.50056, 32.56],
      barcelona: [41.38333, 2.18333],
      johannesburg: [-26.20444, 28.04556],
      'saint petersburg': [59.9375, 30.30861],
      qingdao: [36.0669, 120.3827],
      dalian: [38.914, 121.6148],
      'washington, d.c.': [38.90472, -77.01639],
      yangon: [16.85, 96.18333],
      alexandria: [31.2, 29.91667],
      jinan: [36.6702, 117.0207],
      guadalajara: [20.67667, -103.3475]
    };

    var ontario = {
      brampton: [43.68333, -79.76667],
      barrie: [44.37111, -79.67694],
      belleville: [44.16667, -77.38333],
      brantford: [43.16667, -80.25],
      cornwall: [45.0275, -74.74],
      brockville: [44.58333, -75.68333],
      burlington: [43.31667, -79.8],
      cambridge: [43.36667, -80.31667],
      'clarence-rockland': [45.48333, -75.2],
      guelph: [43.55, -80.25],
      dryden: [49.78333, -92.83333],
      'elliot lake': [46.38333, -82.65],
      'greater sudbury': [46.49, -81.01],
      'haldimand county': [42.93333, -79.88333],
      hamilton: [43.25667, -79.86917],
      kitchener: [43.41861, -80.47278],
      kingston: [44.23333, -76.5],
      kenora: [49.76667, -94.48333],
      'kawartha lakes': [44.35, -78.75],
      london: [42.98361, -81.24972],
      mississauga: [43.6, -79.65],
      markham: [43.87667, -79.26333],
      'niagara falls': [43.06, -79.10667],
      'norfolk county': [42.85, -80.26667],
      ottawa: [45.42472, -75.695],
      'north bay': [46.3, -79.45],
      orillia: [44.6, -79.41667],
      oshawa: [43.9, -78.85],
      'owen sound': [44.56667, -80.93333],
      pickering: [43.83944, -79.08139],
      peterborough: [44.3, -78.31667],
      'port colborne': [42.88333, -79.25],
      pembroke: [45.81667, -77.1],
      sarnia: [42.99944, -82.30889],
      'st. catharines': [43.18333, -79.23333],
      'richmond hill': [43.86667, -79.43333],
      'quinte west': [44.18333, -77.56667],
      'sault ste. marie': [46.53333, -84.35],
      'thunder bay': [48.38222, -89.24611],
      stratford: [43.37083, -80.98194],
      'st. thomas': [42.775, -81.18333],
      thorold: [43.11667, -79.2],
      'temiskaming shores': [47.51667, -79.68333],
      toronto: [43.74167, -79.37333],
      waterloo: [43.46667, -80.51667],
      timmins: [48.46667, -81.33333],
      vaughan: [43.83333, -79.5],
      welland: [42.98333, -79.23333],
      windsor: [42.28333, -83],
      woodstock: [43.13056, -80.74667]
    };

    var northAmerica = {
      'mexico city': [19.43333, -99.13333],
      'new york city': [40.661, -73.944],
      'los angeles': [34.05, -118.25],
      toronto: [43.74167, -79.37333],
      chicago: [41.82192, -87.70304],
      houston: [29.76278, -95.38306],
      havana: [23.13667, -82.35889],
      montreal: [45.50889, -73.56167],
      'ecatepec de morelos': [19.60972, -99.06],
      philadelphia: [39.95278, -75.16361],
      'san antonio': [29.425, -98.49389],
      guadalajara: [20.67667, -103.3475],
      puebla: [19, -97.88333],
      'san diego': [32.715, -117.1625],
      dallas: [32.77917, -96.80889],
      tijuana: [32.525, -117.03333],
      calgary: [51.05, -114.06667],
      tegucigalpa: [14.1, -87.21667],
      zapopan: [20.72028, -103.39194],
      monterrey: [25.66667, -100.3],
      managua: [12.13639, -86.25139],
      'santo domingo': [18.46667, -69.95],
      'guatemala city': [14.61333, -90.53528],
      'port-au-prince': [18.53333, -72.33333],
      naucalpan: [19.47528, -99.23778],
      ottawa: [45.42472, -75.695],
      austin: [30.26722, -97.74306],
      edmonton: [53.53444, -113.49028],
      querétaro: [20.58333, -100.38333],
      toluca: [19.2925, -99.65694],
      jacksonville: [30.33694, -81.66139],
      'san francisco': [37.7775, -122.41639],
      indianapolis: [39.76861, -86.15806],
      'fort worth': [32.75, -97.33333],
      charlotte: [35.22722, -80.84306],
      hermosillo: [29.09889, -110.95417],
      saltillo: [25.43333, -101],
      aguascalientes: [22.01667, -102.35],
      mississauga: [43.6, -79.65],
      'san luis potosí': [22.6, -100.43333],
      veracruz: [19.43333, -96.38333],
      'san pedro sula': [15.5, -88.03333],
      'santiago de los caballeros': [19.45726, -70.6888],
      culiacán: [24.80694, -107.39389],
      winnipeg: [49.88444, -97.14639],
      mexicali: [32.66333, -115.46778],
      cancún: [21.16056, -86.8475],
      acapulco: [16.86361, -99.8825],
      tlalnepantla: [19.53667, -99.19472],
      seattle: [47.60972, -122.33306],
      denver: [39.73917, -104.99028],
      'el paso': [31.75917, -106.48861],
      chimalhuacán: [19.4375, -98.95417],
      detroit: [42.33139, -83.04583],
      'washington, d.c.': [38.90472, -77.01639],
      boston: [42.35806, -71.06361],
      tlaquepaque: [20.61667, -103.31667],
      nashville: [36.16667, -86.78333],
      torreón: [25.53944, -103.44861],
      vancouver: [49.25, -123.1],
      reynosa: [26.09222, -98.27778],
      'oklahoma city': [35.46861, -97.52139],
      'las vegas': [36.175, -115.13639],
      baltimore: [39.28333, -76.61667],
      brampton: [43.68333, -79.76667],
      louisville: [38.22533, -85.74167],
      morelia: [19.76833, -101.18944],
      milwaukee: [43.05, -87.95],
      'tuxtla gutiérrez': [16.75278, -93.11667],
      apodaca: [25.78333, -100.18333],
      durango: [24.93333, -104.91667],
      albuquerque: [35.11083, -106.61],
      'quebec city': [46.81389, -71.20806],
      tucson: [32.22167, -110.92639],
      'cuautitlán izcalli': [19.64611, -99.21139],
      surrey: [51.25, -0.41667],
      'ciudad lópez mateos': [19.56111, -99.24694],
      tultitlán: [19.645, -99.16944],
      fresno: [36.75, -119.76667]
    };

    const points = [
      ['afghanistan', 'kabul', 34.28, 69.11],
      ['albania', 'tirane', 41.18, 19.49],
      ['algeria', 'algiers', 36.42, 3.08],
      ['american samoa', 'pago pago', -14.16, -170.43],
      ['andorra', 'andorra la vella', 42.31, 1.32],
      ['angola', 'luanda', -8.5, 13.15],
      ['antigua and barbuda', 'west indies', 17.2, -61.48],
      ['argentina', 'buenos aires', -36.3, -60.0],
      ['armenia', 'yerevan', 40.1, 44.31],
      ['aruba', 'oranjestad', 12.32, -70.02],
      ['australia', 'canberra', -35.15, 149.08],
      ['austria', 'vienna', 48.12, 16.22],
      ['azerbaijan', 'baku', 40.29, 49.56],
      ['bahamas', 'nassau', 25.05, -77.2],
      ['bahrain', 'manama', 26.1, 50.3],
      ['bangladesh', 'dhaka', 23.43, 90.26],
      ['barbados', 'bridgetown', 13.05, -59.3],
      ['belarus', 'minsk', 53.52, 27.3],
      ['belgium', 'brussels', 50.51, 4.21],
      ['belize', 'belmopan', 17.18, -88.3],
      ['benin', 'porto novo', 6.23, 2.42],
      ['bhutan', 'thimphu', 27.31, 89.45],
      ['bolivia', 'la paz', -16.2, -68.1],
      ['bosnia and herzegovina', 'sarajevo', 43.52, 18.26],
      ['botswana', 'gaborone', -24.45, 25.57],
      ['brazil', 'brasilia', -15.47, -47.55],
      ['british virgin islands', 'road town', 18.27, -64.37],
      ['brunei darussalam', 'bandar seri begawan', 4.52, 115.0],
      ['bulgaria', 'sofia', 42.45, 23.2],
      ['burkina faso', 'ouagadougou', 12.15, -1.3],
      ['burundi', 'bujumbura', -3.16, 29.18],
      ['cambodia', 'phnom penh', 11.33, 104.55],
      ['cameroon', 'yaounde', 3.5, 11.35],
      ['canada', 'ottawa', 45.27, -75.42],
      ['cape verde', 'praia', 15.02, -23.34],
      ['cayman islands', 'george town', 19.2, -81.24],
      ['central african republic', 'bangui', 4.23, 18.35],
      ['chad', "n'djamena", 12.1, 14.59],
      ['chile', 'santiago', -33.24, -70.4],
      ['china', 'beijing', 39.55, 116.2],
      ['colombia', 'bogota', 4.34, -74.0],
      ['comros', 'moroni', -11.4, 43.16],
      ['congo', 'brazzaville', -4.09, 15.12],
      ['costa rica', 'san jose', 9.55, -84.02],
      ["cote d'ivoire", 'yamoussoukro', 6.49, -5.17],
      ['croatia', 'zagreb', 45.5, 15.58],
      ['cuba', 'havana', 23.08, -82.22],
      ['cyprus', 'nicosia', 35.1, 33.25],
      ['czech republic', 'prague', 50.05, 14.22],
      ['democratic republic of the congo', 'kinshasa', -4.2, 15.15],
      ['denmark', 'copenhagen', 55.41, 12.34],
      ['djibouti', 'djibouti', 11.08, 42.2],
      ['dominica', 'roseau', 15.2, -61.24],
      ['dominica republic', 'santo domingo', 18.3, -69.59],
      ['east timor', 'dili', -8.29, 125.34],
      ['ecuador', 'quito', -0.15, -78.35],
      ['egypt', 'cairo', 30.01, 31.14],
      ['el salvador', 'san salvador', 13.4, -89.1],
      ['equatorial guinea', 'malabo', 3.45, 8.5],
      ['eritrea', 'asmara', 15.19, 38.55],
      ['estonia', 'tallinn', 59.22, 24.48],
      ['ethiopia', 'addis ababa', 9.02, 38.42],
      ['falkland islands', 'stanley', -51.4, -59.51],
      ['faroe islands', 'torshavn', 62.05, -6.56],
      ['fiji', 'suva', -18.06, 178.3],
      ['finland', 'helsinki', 60.15, 25.03],
      ['france', 'paris', 48.5, 2.2],
      ['french guiana', 'cayenne', 5.05, -52.18],
      ['french polynesia', 'papeete', -17.32, -149.34],
      ['gabon', 'libreville', 0.25, 9.26],
      ['gambia', 'banjul', 13.28, -16.4],
      ['georgia', 'tbilisi', 41.43, 44.5],
      ['germany', 'berlin', 52.3, 13.25],
      ['ghana', 'accra', 5.35, -0.06],
      ['greece', 'athens', 37.58, 23.46],
      ['greenland', 'nuuk', 64.1, -51.35],
      ['guadeloupe', 'basse-terre', 16.0, -61.44],
      ['guatemala', 'guatemala', 14.4, -90.22],
      ['guernsey', 'st. peter port', 49.26, -2.33],
      ['guinea', 'conakry', 9.29, -13.49],
      ['guinea-bissau', 'bissau', 11.45, -15.45],
      ['guyana', 'georgetown', 6.5, -58.12],
      ['haiti', 'port-au-prince', 18.4, -72.2],
      ['honduras', 'tegucigalpa', 14.05, -87.14],
      ['hungary', 'budapest', 47.29, 19.05],
      ['iceland', 'reykjavik', 64.1, -21.57],
      ['india', 'new delhi', 28.37, 77.13],
      ['indonesia', 'jakarta', -6.09, 106.49],
      ['iran', 'tehran', 35.44, 51.3],
      ['iraq', 'baghdad', 33.2, 44.3],
      ['ireland', 'dublin', 53.21, -6.15],
      ['israel', 'jerusalem', 31.71, -35.1],
      ['italy', 'rome', 41.54, 12.29],
      ['jamaica', 'kingston', 18.0, -76.5],
      ['jordan', 'amman', 31.57, 35.52],
      ['kazakhstan', 'astana', 51.1, 71.3],
      ['kenya', 'nairobi', -1.17, 36.48],
      ['kiribati', 'tarawa', 1.3, 173.0],
      ['kuwait', 'kuwait', 29.3, 48.0],
      ['kyrgyzstan', 'bishkek', 42.54, 74.46],
      ['laos', 'vientiane', 17.58, 102.36],
      ['latvia', 'riga', 56.53, 24.08],
      ['lebanon', 'beirut', 33.53, 35.31],
      ['lesotho', 'maseru', -29.18, 27.3],
      ['liberia', 'monrovia', 6.18, -10.47],
      ['libyan arab jamahiriya', 'tripoli', 32.49, 13.07],
      ['liechtenstein', 'vaduz', 47.08, 9.31],
      ['lithuania', 'vilnius', 54.38, 25.19],
      ['luxembourg', 'luxembourg', 49.37, 6.09],
      ['macao, china', 'macau', 22.12, 113.33],
      ['madagascar', 'antananarivo', -18.55, 47.31],
      ['macedonia', 'skopje', 42.01, 21.26],
      ['malawi', 'lilongwe', -14.0, 33.48],
      ['malaysia', 'kuala lumpur', 3.09, 101.41],
      ['maldives', 'male', 4.0, 73.28],
      ['mali', 'bamako', 12.34, -7.55],
      ['malta', 'valletta', 35.54, 14.31],
      ['martinique', 'fort-de-france', 14.36, -61.02],
      ['mauritania', 'nouakchott', -20.1, 57.3],
      ['mayotte', 'mamoudzou', -12.48, 45.14],
      ['mexico', 'mexico', 19.2, -99.1],
      ['micronesia', 'palikir', 6.55, 158.09],
      ['moldova, republic of', 'chisinau', 47.02, 28.5],
      ['mozambique', 'maputo', -25.58, 32.32],
      ['myanmar', 'yangon', 16.45, 96.2],
      ['namibia', 'windhoek', -22.35, 17.04],
      ['nepal', 'kathmandu', 27.45, 85.2],
      ['netherlands', 'amsterdam', 52.23, 4.54],
      ['netherlands antilles', 'willemstad', 12.05, -69.0],
      ['new caledonia', 'noumea', -22.17, 166.3],
      ['new zealand', 'wellington', -41.19, 174.46],
      ['nicaragua', 'managua', 12.06, -86.2],
      ['niger', 'niamey', 13.27, 2.06],
      ['nigeria', 'abuja', 9.05, 7.32],
      ['norfolk island', 'kingston', -45.2, 168.43],
      ['north korea', 'pyongyang', 39.09, 125.3],
      ['northern mariana islands', 'saipan', 15.12, 145.45],
      ['norway', 'oslo', 59.55, 10.45],
      ['oman', 'masqat', 23.37, 58.36],
      ['pakistan', 'islamabad', 33.4, 73.1],
      ['palau', 'koror', 7.2, 134.28],
      ['panama', 'panama', 9.0, -79.25],
      ['papua new guinea', 'port moresby', -9.24, 147.08],
      ['paraguay', 'asuncion', -25.1, -57.3],
      ['peru', 'lima', -12.0, -77.0],
      ['philippines', 'manila', 14.4, 121.03],
      ['poland', 'warsaw', 52.13, 21.0],
      ['portugal', 'lisbon', 38.42, -9.1],
      ['puerto rico', 'san juan', 18.28, -66.07],
      ['qatar', 'doha', 25.15, 51.35],
      ['republic of korea', 'seoul', 37.31, 126.58],
      ['romania', 'bucuresti', 44.27, 26.1],
      ['russia', 'moscow', 55.45, 37.35],
      ['rawanda', 'kigali', -1.59, 30.04],
      ['saint kitts and nevis', 'basseterre', 17.17, -62.43],
      ['saint lucia', 'castries', 14.02, -60.58],
      ['saint pierre and miquelon', 'saint-pierre', 46.46, -56.12],
      ['saint vincent and the greenadines', 'kingstown', 13.1, -61.1],
      ['samoa', 'apia', -13.5, -171.5],
      ['san marino', 'san marino', 43.55, 12.3],
      ['sao tome and principe', 'sao tome', 0.1, 6.39],
      ['saudi arabia', 'riyadh', 24.41, 46.42],
      ['senegal', 'dakar', 14.34, -17.29],
      ['sierra leone', 'freetown', 8.3, -13.17],
      ['slovakia', 'bratislava', 48.1, 17.07],
      ['slovenia', 'ljubljana', 46.04, 14.33],
      ['solomon islands', 'honiara', -9.27, 159.57],
      ['somalia', 'mogadishu', 2.02, 45.25],
      ['south africa', 'pretoria', -25.44, 28.12],
      ['spain', 'madrid', 40.25, -3.45],
      ['sudan', 'khartoum', 15.31, 32.35],
      ['suriname', 'paramaribo', 5.5, -55.1],
      ['swaziland', 'mbabane', -26.18, 31.06],
      ['sweden', 'stockholm', 59.2, 18.03],
      ['switzerland', 'bern', 46.57, 7.28],
      ['syria', 'damascus', 33.3, 36.18],
      ['tajikistan', 'dushanbe', 38.33, 68.48],
      ['thailand', 'bangkok', 13.45, 100.35],
      ['togo', 'lome', 6.09, 1.2],
      ['tonga', "nuku'alofa", -21.1, -174.0],
      ['tunisia', 'tunis', 36.5, 10.11],
      ['turkey', 'ankara', 39.57, 32.54],
      ['turkmenistan', 'ashgabat', 38.0, 57.5],
      ['tuvalu', 'funafuti', -8.31, 179.13],
      ['uganda', 'kampala', 0.2, 32.3],
      ['ukraine', 'kiev', 50.3, 30.28],
      ['united arab emirates', 'abu dhabi', 24.28, 54.22],
      ['united kingdom', 'london', 51.36, -0.05],
      ['united republic of tanzania', 'dodoma', -6.08, 35.45],
      ['united states of america', 'washington dc', 39.91, -77.02],
      ['united states of virgin islands', 'charlotte amalie', 18.21, -64.56],
      ['uruguay', 'montevideo', -34.5, -56.11],
      ['uzbekistan', 'tashkent', 41.2, 69.1],
      ['vanuatu', 'port-vila', -17.45, 168.18],
      ['venezuela', 'caracas', 10.3, -66.55],
      ['viet nam', 'hanoi', 21.05, 105.55],
      ['yugoslavia', 'belgrade', 44.5, 20.37],
      ['zambia', 'lusaka', -15.28, 28.16],
      ['zimbabwe', 'harare', -17.43, 31.02]
    ];

    let obj = {};
    points.forEach(a => {
      obj[a[0]] = [a[2], a[3]];
      obj[a[1]] = [a[2], a[3]];
    });
    var countries = obj;

    var points$1 = Object.assign(
      {},
      cities,
      ontario,
      northAmerica,
      countries
    );

    const findPoint = function (input) {
      if (points$1.hasOwnProperty(input)) {
        return points$1[input]
      }
      return input
    };

    const focusOn = function (shape, projection, width, height) {
      let path = index().projection(projection);

      var b = path.bounds(shape);
      let s = 0.95 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height);
      let t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];
      projection.scale(s).translate(t);
      return projection
    };

    /* node_modules/somehow-maps/src/Map.svelte generated by Svelte v3.22.3 */
    const file$1 = "node_modules/somehow-maps/src/Map.svelte";

    function create_fragment$1(ctx) {
    	let svg;
    	let svg_viewBox_value;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[6].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[5], null);

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");
    			if (default_slot) default_slot.c();
    			attr_dev(svg, "viewBox", svg_viewBox_value = "0,0," + /*width*/ ctx[0] + "," + /*height*/ ctx[1]);
    			attr_dev(svg, "preserveAspectRatio", "xMidYMid meet");
    			set_style(svg, "margin", "10px 20px 25px 25px");
    			set_style(svg, "transform", "rotate3d(1, 0, 0, " + /*tilt*/ ctx[2] + "deg)");
    			attr_dev(svg, "class", "svelte-ip4obd");
    			add_location(svg, file$1, 28, 0, 715);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, svg, anchor);

    			if (default_slot) {
    				default_slot.m(svg, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 32) {
    					default_slot.p(get_slot_context(default_slot_template, ctx, /*$$scope*/ ctx[5], null), get_slot_changes(default_slot_template, /*$$scope*/ ctx[5], dirty, null));
    				}
    			}

    			if (!current || dirty & /*width, height*/ 3 && svg_viewBox_value !== (svg_viewBox_value = "0,0," + /*width*/ ctx[0] + "," + /*height*/ ctx[1])) {
    				attr_dev(svg, "viewBox", svg_viewBox_value);
    			}

    			if (!current || dirty & /*tilt*/ 4) {
    				set_style(svg, "transform", "rotate3d(1, 0, 0, " + /*tilt*/ ctx[2] + "deg)");
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { width = 500 } = $$props;
    	let { height = 300 } = $$props;
    	let { focus = [] } = $$props;
    	let { tilt = 0 } = $$props;
    	let projection = mercator();
    	projection.scale(1).translate([0, 0]);
    	projection.rotate([1, 0, 0]);
    	focusOn(focus, projection, width, height);

    	// projection.zoom([3, 10, 1])
    	// projection.transform([10, 10, 10])
    	setContext("projection", projection);

    	const writable_props = ["width", "height", "focus", "tilt"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Map> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Map", $$slots, ['default']);

    	$$self.$set = $$props => {
    		if ("width" in $$props) $$invalidate(0, width = $$props.width);
    		if ("height" in $$props) $$invalidate(1, height = $$props.height);
    		if ("focus" in $$props) $$invalidate(3, focus = $$props.focus);
    		if ("tilt" in $$props) $$invalidate(2, tilt = $$props.tilt);
    		if ("$$scope" in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		setContext,
    		Shape,
    		d3Geo,
    		findPoint,
    		focusOn,
    		width,
    		height,
    		focus,
    		tilt,
    		projection
    	});

    	$$self.$inject_state = $$props => {
    		if ("width" in $$props) $$invalidate(0, width = $$props.width);
    		if ("height" in $$props) $$invalidate(1, height = $$props.height);
    		if ("focus" in $$props) $$invalidate(3, focus = $$props.focus);
    		if ("tilt" in $$props) $$invalidate(2, tilt = $$props.tilt);
    		if ("projection" in $$props) projection = $$props.projection;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [width, height, tilt, focus, projection, $$scope, $$slots];
    }

    class Map$1 extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, { width: 0, height: 1, focus: 3, tilt: 2 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Map",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get width() {
    		throw new Error("<Map>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<Map>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get height() {
    		throw new Error("<Map>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set height(value) {
    		throw new Error("<Map>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focus() {
    		throw new Error("<Map>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focus(value) {
    		throw new Error("<Map>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get tilt() {
    		throw new Error("<Map>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set tilt(value) {
    		throw new Error("<Map>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /**
     *  Point2D.js
     *  @module Point2D
     *  @copyright 2001-2019 Kevin Lindsey
     */

    /**
     *  Point2D
     *
     *  @memberof module:kld-affine
     */
    class Point2D {
        /**
         *  Point2D
         *
         *  @param {number} x
         *  @param {number} y
         *  @returns {module:kld-affine.Point2D}
         */
        constructor(x = 0, y = 0) {
            this.x = x;
            this.y = y;
        }

        /**
         *  clone
         *
         *  @returns {module:kld-affine.Point2D}
         */
        clone() {
            return new this.constructor(this.x, this.y);
        }

        /**
         *  add
         *
         *  @param {module:kld-affine.Point2D} that
         *  @returns {module:kld-affine.Point2D}
         */
        add(that) {
            return new this.constructor(this.x + that.x, this.y + that.y);
        }

        /**
         *  subtract
         *
         *  @param {module:kld-affine.Point2D} that
         *  @returns {module:kld-affine.Point2D}
         */
        subtract(that) {
            return new this.constructor(this.x - that.x, this.y - that.y);
        }

        /**
         *  multiply
         *
         *  @param {number} scalar
         *  @returns {module:kld-affine.Point2D}
         */
        multiply(scalar) {
            return new this.constructor(this.x * scalar, this.y * scalar);
        }

        /**
         *  divide
         *
         *  @param {number} scalar
         *  @returns {module:kld-affine.Point2D}
         */
        divide(scalar) {
            return new this.constructor(this.x / scalar, this.y / scalar);
        }

        /**
         *  equals
         *
         *  @param {module:kld-affine.Point2D} that
         *  @returns {boolean}
         */
        equals(that) {
            return (this.x === that.x && this.y === that.y);
        }

        /**
         *  precisionEquals
         *
         *  @param {module:kld-affine.Point2D} that
         *  @param {number} precision
         *  @returns {boolean}
         */
        precisionEquals(that, precision) {
            return (
                Math.abs(this.x - that.x) < precision &&
                Math.abs(this.y - that.y) < precision
            );
        }

        // utility methods

        /**
         *  lerp
         *
         *  @param {module:kld-affine.Point2D} that
         *  @param {number} t
         *  @returns {module:kld-affine.Point2D}
         */
        lerp(that, t) {
            const omt = 1.0 - t;

            return new this.constructor(
                this.x * omt + that.x * t,
                this.y * omt + that.y * t
            );
        }

        /**
         *  distanceFrom
         *
         *  @param {module:kld-affine.Point2D} that
         *  @returns {number}
         */
        distanceFrom(that) {
            const dx = this.x - that.x;
            const dy = this.y - that.y;

            return Math.sqrt(dx * dx + dy * dy);
        }

        /**
         *  min
         *
         *  @param {module:kld-affine.Point2D} that
         *  @returns {number}
         */
        min(that) {
            return new this.constructor(
                Math.min(this.x, that.x),
                Math.min(this.y, that.y)
            );
        }

        /**
         *  max
         *
         *  @param {module:kld-affine.Point2D} that
         *  @returns {number}
         */
        max(that) {
            return new this.constructor(
                Math.max(this.x, that.x),
                Math.max(this.y, that.y)
            );
        }

        /**
         *  transform
         *
         *  @param {module:kld-affine.Matrix2D} matrix
         *  @returns {module:kld-affine.Point2D}
         */
        transform(matrix) {
            return new this.constructor(
                matrix.a * this.x + matrix.c * this.y + matrix.e,
                matrix.b * this.x + matrix.d * this.y + matrix.f
            );
        }

        /**
         *  toString
         *
         *  @returns {string}
         */
        toString() {
            return `point(${this.x},${this.y})`;
        }
    }

    /**
     *  Vector2D.js
     *  @module Vector2D
     *  @copyright 2001-2019 Kevin Lindsey
     */

    /**
     *  Vector2D
     *
     *  @memberof module:kld-affine
     */
    class Vector2D {
        /**
         *  Vector2D
         *
         *  @param {number} x
         *  @param {number} y
         *  @returns {module:kld-affine.Vector2D}
         */
        constructor(x = 0, y = 0) {
            this.x = x;
            this.y = y;
        }

        /**
         *  fromPoints
         *
         *  @param {module:kld-affine.Point2D} p1
         *  @param {module:kld-affine.Point2D} p2
         *  @returns {module:kld-affine.Vector2D}
         */
        static fromPoints(p1, p2) {
            return new Vector2D(
                p2.x - p1.x,
                p2.y - p1.y
            );
        }

        /**
         *  length
         *
         *  @returns {number}
         */
        length() {
            return Math.sqrt(this.x * this.x + this.y * this.y);
        }

        /**
         *  magnitude
         *
         *  @returns {number}
         */
        magnitude() {
            return this.x * this.x + this.y * this.y;
        }

        /**
         *  dot
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {number}
         */
        dot(that) {
            return this.x * that.x + this.y * that.y;
        }

        /**
         *  cross
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {number}
         */
        cross(that) {
            return this.x * that.y - this.y * that.x;
        }

        /**
         *  determinant
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {number}
         */
        determinant(that) {
            return this.x * that.y - this.y * that.x;
        }

        /**
         *  unit
         *
         *  @returns {module:kld-affine.Vector2D}
         */
        unit() {
            return this.divide(this.length());
        }

        /**
         *  add
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {module:kld-affine.Vector2D}
         */
        add(that) {
            return new this.constructor(this.x + that.x, this.y + that.y);
        }

        /**
         *  subtract
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {module:kld-affine.Vector2D}
         */
        subtract(that) {
            return new this.constructor(this.x - that.x, this.y - that.y);
        }

        /**
         *  multiply
         *
         *  @param {number} scalar
         *  @returns {module:kld-affine.Vector2D}
         */
        multiply(scalar) {
            return new this.constructor(this.x * scalar, this.y * scalar);
        }

        /**
         *  divide
         *
         *  @param {number} scalar
         *  @returns {module:kld-affine.Vector2D}
         */
        divide(scalar) {
            return new this.constructor(this.x / scalar, this.y / scalar);
        }

        /**
         *  angleBetween
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {number}
         */
        angleBetween(that) {
            let cos = this.dot(that) / (this.length() * that.length());
            cos = Math.max(-1, Math.min(cos, 1));
            const radians = Math.acos(cos);

            return (this.cross(that) < 0.0) ? -radians : radians;
        }

        /**
         *  Find a vector is that is perpendicular to this vector
         *
         *  @returns {module:kld-affine.Vector2D}
         */
        perp() {
            return new this.constructor(-this.y, this.x);
        }

        /**
         *  Find the component of the specified vector that is perpendicular to
         *  this vector
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {module:kld-affine.Vector2D}
         */
        perpendicular(that) {
            return this.subtract(this.project(that));
        }

        /**
         *  project
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {module:kld-affine.Vector2D}
         */
        project(that) {
            const percent = this.dot(that) / that.dot(that);

            return that.multiply(percent);
        }

        /**
         *  transform
         *
         *  @param {module:kld-affine.Matrix2D} matrix
         *  @returns {module:kld-affine.Vector2D}
         */
        transform(matrix) {
            return new this.constructor(
                matrix.a * this.x + matrix.c * this.y,
                matrix.b * this.x + matrix.d * this.y
            );
        }

        /**
         *  equals
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @returns {boolean}
         */
        equals(that) {
            return (
                this.x === that.x &&
                this.y === that.y
            );
        }

        /**
         *  precisionEquals
         *
         *  @param {module:kld-affine.Vector2D} that
         *  @param {number} precision
         *  @returns {boolean}
         */
        precisionEquals(that, precision) {
            return (
                Math.abs(this.x - that.x) < precision &&
                Math.abs(this.y - that.y) < precision
            );
        }

        /**
         *  toString
         *
         *  @returns {string}
         */
        toString() {
            return `vector(${this.x},${this.y})`;
        }
    }

    /**
     *  Matrix2D.js
     *  @module Matrix2D
     *  @copyright 2001-2019 Kevin Lindsey
     */

    /**
     *  Matrix2D
     *
     *  @memberof module:kld-affine
     */
    class Matrix2D {
        /**
         *  A 2D Matrix of the form:<br>
         *  [a c e]<br>
         *  [b d f]<br>
         *  [0 0 1]<br>
         *
         *  @param {number} a
         *  @param {number} b
         *  @param {number} c
         *  @param {number} d
         *  @param {number} e
         *  @param {number} f
         *  @returns {module:kld-affine.Matrix2D}
         */
        constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
            this.a = a;
            this.b = b;
            this.c = c;
            this.d = d;
            this.e = e;
            this.f = f;
        }

        /**
         *  translation
         *
         *  @param {number} tx
         *  @param {number} ty
         *  @returns {module:kld-affine.Matrix2D}
         */
        static translation(tx, ty) {
            return new Matrix2D(1, 0, 0, 1, tx, ty);
        }

        /**
         *  scaling
         *
         *  @param {number} scale
         *  @returns {module:kld-affine.Matrix2D}
         */
        static scaling(scale) {
            return new Matrix2D(scale, 0, 0, scale, 0, 0);
        }

        /**
         *  scalingAt
         *
         *  @param {number} scale
         *  @param {module:kld-affine.Point2D} center
         *  @returns {module:kld-affine.Matrix2D}
         */
        static scalingAt(scale, center) {
            return new Matrix2D(
                scale,
                0,
                0,
                scale,
                center.x - center.x * scale,
                center.y - center.y * scale
            );
        }

        /**
         *  nonUniformScaling
         *
         *  @param {number} scaleX
         *  @param {number} scaleY
         *  @returns {module:kld-affine.Matrix2D}
         */
        static nonUniformScaling(scaleX, scaleY) {
            return new Matrix2D(scaleX, 0, 0, scaleY, 0, 0);
        }

        /**
         *  nonUniformScalingAt
         *
         *  @param {number} scaleX
         *  @param {number} scaleY
         *  @param {module:kld-affine.Point2D} center
         *  @returns {module:kld-affine.Matrix2D}
         */
        static nonUniformScalingAt(scaleX, scaleY, center) {
            return new Matrix2D(
                scaleX,
                0,
                0,
                scaleY,
                center.x - center.x * scaleX,
                center.y - center.y * scaleY
            );
        }

        /**
         *  rotation
         *
         *  @param {number} radians
         *  @returns {module:kld-affine.Matrix2D}
         */
        static rotation(radians) {
            const c = Math.cos(radians);
            const s = Math.sin(radians);

            return new Matrix2D(c, s, -s, c, 0, 0);
        }

        /**
         *  rotationAt
         *
         *  @param {number} radians
         *  @param {module:kld-affine.Point2D} center
         *  @returns {module:kld-affine.Matrix2D}
         */
        static rotationAt(radians, center) {
            const c = Math.cos(radians);
            const s = Math.sin(radians);

            return new Matrix2D(
                c,
                s,
                -s,
                c,
                center.x - center.x * c + center.y * s,
                center.y - center.y * c - center.x * s
            );
        }

        /**
         *  rotationFromVector
         *
         *  @param {module:kld-affine.Vector2D} vector
         *  @returns {module:kld-affine.Matrix2D}
         */
        static rotationFromVector(vector) {
            const unit = vector.unit();
            const c = unit.x; // cos
            const s = unit.y; // sin

            return new Matrix2D(c, s, -s, c, 0, 0);
        }

        /**
         *  xFlip
         *
         *  @returns {module:kld-affine.Matrix2D}
         */
        static xFlip() {
            return new Matrix2D(-1, 0, 0, 1, 0, 0);
        }

        /**
         *  yFlip
         *
         *  @returns {module:kld-affine.Matrix2D}
         */
        static yFlip() {
            return new Matrix2D(1, 0, 0, -1, 0, 0);
        }

        /**
         *  xSkew
         *
         *  @param {number} radians
         *  @returns {module:kld-affine.Matrix2D}
         */
        static xSkew(radians) {
            const t = Math.tan(radians);

            return new Matrix2D(1, 0, t, 1, 0, 0);
        }

        /**
         *  ySkew
         *
         *  @param {number} radians
         *  @returns {module:kld-affine.Matrix2D}
         */
        static ySkew(radians) {
            const t = Math.tan(radians);

            return new Matrix2D(1, t, 0, 1, 0, 0);
        }

        /**
         *  multiply
         *
         *  @param {module:kld-affine.Matrix2D} that
         *  @returns {module:kld-affine.Matrix2D}
         */
        multiply(that) {
            if (this.isIdentity()) {
                return that;
            }

            if (that.isIdentity()) {
                return this;
            }

            return new this.constructor(
                this.a * that.a + this.c * that.b,
                this.b * that.a + this.d * that.b,
                this.a * that.c + this.c * that.d,
                this.b * that.c + this.d * that.d,
                this.a * that.e + this.c * that.f + this.e,
                this.b * that.e + this.d * that.f + this.f
            );
        }

        /**
         *  inverse
         *
         *  @returns {module:kld-affine.Matrix2D}
         */
        inverse() {
            if (this.isIdentity()) {
                return this;
            }

            const det1 = this.a * this.d - this.b * this.c;

            if (det1 === 0.0) {
                throw new Error("Matrix is not invertible");
            }

            const idet = 1.0 / det1;
            const det2 = this.f * this.c - this.e * this.d;
            const det3 = this.e * this.b - this.f * this.a;

            return new this.constructor(
                this.d * idet,
                -this.b * idet,
                -this.c * idet,
                this.a * idet,
                det2 * idet,
                det3 * idet
            );
        }

        /**
         *  translate
         *
         *  @param {number} tx
         *  @param {number} ty
         *  @returns {module:kld-affine.Matrix2D}
         */
        translate(tx, ty) {
            return new this.constructor(
                this.a,
                this.b,
                this.c,
                this.d,
                this.a * tx + this.c * ty + this.e,
                this.b * tx + this.d * ty + this.f
            );
        }

        /**
         *  scale
         *
         *  @param {number} scale
         *  @returns {module:kld-affine.Matrix2D}
         */
        scale(scale) {
            return new this.constructor(
                this.a * scale,
                this.b * scale,
                this.c * scale,
                this.d * scale,
                this.e,
                this.f
            );
        }

        /**
         *  scaleAt
         *
         *  @param {number} scale
         *  @param {module:kld-affine.Point2D} center
         *  @returns {module:kld-affine.Matrix2D}
         */
        scaleAt(scale, center) {
            const dx = center.x - scale * center.x;
            const dy = center.y - scale * center.y;

            return new this.constructor(
                this.a * scale,
                this.b * scale,
                this.c * scale,
                this.d * scale,
                this.a * dx + this.c * dy + this.e,
                this.b * dx + this.d * dy + this.f
            );
        }

        /**
         *  scaleNonUniform
         *
         *  @param {number} scaleX
         *  @param {number} scaleY
         *  @returns {module:kld-affine.Matrix2D}
         */
        scaleNonUniform(scaleX, scaleY) {
            return new this.constructor(
                this.a * scaleX,
                this.b * scaleX,
                this.c * scaleY,
                this.d * scaleY,
                this.e,
                this.f
            );
        }

        /**
         *  scaleNonUniformAt
         *
         *  @param {number} scaleX
         *  @param {number} scaleY
         *  @param {module:kld-affine.Point2D} center
         *  @returns {module:kld-affine.Matrix2D}
         */
        scaleNonUniformAt(scaleX, scaleY, center) {
            const dx = center.x - scaleX * center.x;
            const dy = center.y - scaleY * center.y;

            return new this.constructor(
                this.a * scaleX,
                this.b * scaleX,
                this.c * scaleY,
                this.d * scaleY,
                this.a * dx + this.c * dy + this.e,
                this.b * dx + this.d * dy + this.f
            );
        }

        /**
         *  rotate
         *
         *  @param {number} radians
         *  @returns {module:kld-affine.Matrix2D}
         */
        rotate(radians) {
            const c = Math.cos(radians);
            const s = Math.sin(radians);

            return new this.constructor(
                this.a * c + this.c * s,
                this.b * c + this.d * s,
                this.a * -s + this.c * c,
                this.b * -s + this.d * c,
                this.e,
                this.f
            );
        }

        /**
         *  rotateAt
         *
         *  @param {number} radians
         *  @param {module:kld-affine.Point2D} center
         *  @returns {module:kld-affine.Matrix2D}
         */
        rotateAt(radians, center) {
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);
            const cx = center.x;
            const cy = center.y;

            const a = this.a * cos + this.c * sin;
            const b = this.b * cos + this.d * sin;
            const c = this.c * cos - this.a * sin;
            const d = this.d * cos - this.b * sin;

            return new this.constructor(
                a,
                b,
                c,
                d,
                (this.a - a) * cx + (this.c - c) * cy + this.e,
                (this.b - b) * cx + (this.d - d) * cy + this.f
            );
        }

        /**
         *  rotateFromVector
         *
         *  @param {module:kld-affine.Vector2D} vector
         *  @returns {module:kld-affine.Matrix2D}
         */
        rotateFromVector(vector) {
            const unit = vector.unit();
            const c = unit.x; // cos
            const s = unit.y; // sin

            return new this.constructor(
                this.a * c + this.c * s,
                this.b * c + this.d * s,
                this.a * -s + this.c * c,
                this.b * -s + this.d * c,
                this.e,
                this.f
            );
        }

        /**
         *  flipX
         *
         *  @returns {module:kld-affine.Matrix2D}
         */
        flipX() {
            return new this.constructor(
                -this.a,
                -this.b,
                this.c,
                this.d,
                this.e,
                this.f
            );
        }

        /**
         *  flipY
         *
         *  @returns {module:kld-affine.Matrix2D}
         */
        flipY() {
            return new this.constructor(
                this.a,
                this.b,
                -this.c,
                -this.d,
                this.e,
                this.f
            );
        }

        /**
         *  skewX
         *
         *  @param {number} radians
         *  @returns {module:kld-affine.Matrix2D}
         */
        skewX(radians) {
            const t = Math.tan(radians);

            return new this.constructor(
                this.a,
                this.b,
                this.c + this.a * t,
                this.d + this.b * t,
                this.e,
                this.f
            );
        }

        // TODO: skewXAt

        /**
         *  skewY
         *
         *  @param {number} radians
         *  @returns {module:kld-affine.Matrix2D}
         */
        skewY(radians) {
            const t = Math.tan(radians);

            return new this.constructor(
                this.a + this.c * t,
                this.b + this.d * t,
                this.c,
                this.d,
                this.e,
                this.f
            );
        }

        // TODO: skewYAt

        /**
         *  isIdentity
         *
         *  @returns {boolean}
         */
        isIdentity() {
            return (
                this.a === 1.0 &&
                this.b === 0.0 &&
                this.c === 0.0 &&
                this.d === 1.0 &&
                this.e === 0.0 &&
                this.f === 0.0
            );
        }

        /**
         *  isInvertible
         *
         *  @returns {boolean}
         */
        isInvertible() {
            return this.a * this.d - this.b * this.c !== 0.0;
        }

        /**
         *  getScale
         *
         *  @returns {{ scaleX: number, scaleY: number }}
         */
        getScale() {
            return {
                scaleX: Math.sqrt(this.a * this.a + this.c * this.c),
                scaleY: Math.sqrt(this.b * this.b + this.d * this.d)
            };
        }

        /**
         *  Calculates matrix Singular Value Decomposition
         *
         *  The resulting matrices — translation, rotation, scale, and rotation0 — return
         *  this matrix when they are multiplied together in the listed order
         *
         *  @see Jim Blinn's article {@link http://dx.doi.org/10.1109/38.486688}
         *  @see {@link http://math.stackexchange.com/questions/861674/decompose-a-2d-arbitrary-transform-into-only-scaling-and-rotation}
         *
         *  @returns {{
         *    translation: module:kld-affine.Matrix2D,
         *    rotation: module:kld-affine.Matrix2D,
         *    scale: module:kld-affine.Matrix2D,
         *    rotation0: module:kld-affine.Matrix2D
         *  }}
         */
        getDecomposition() {
            const E = (this.a + this.d) * 0.5;
            const F = (this.a - this.d) * 0.5;
            const G = (this.b + this.c) * 0.5;
            const H = (this.b - this.c) * 0.5;

            const Q = Math.sqrt(E * E + H * H);
            const R = Math.sqrt(F * F + G * G);
            const scaleX = Q + R;
            const scaleY = Q - R;

            const a1 = Math.atan2(G, F);
            const a2 = Math.atan2(H, E);
            const theta = (a2 - a1) * 0.5;
            const phi = (a2 + a1) * 0.5;

            return {
                translation: this.constructor.translation(this.e, this.f),
                rotation: this.constructor.rotation(phi),
                scale: this.constructor.nonUniformScaling(scaleX, scaleY),
                rotation0: this.constructor.rotation(theta)
            };
        }

        /**
         *  equals
         *
         *  @param {module:kld-affine.Matrix2D} that
         *  @returns {boolean}
         */
        equals(that) {
            return (
                this.a === that.a &&
                this.b === that.b &&
                this.c === that.c &&
                this.d === that.d &&
                this.e === that.e &&
                this.f === that.f
            );
        }

        /**
         *  precisionEquals
         *
         *  @param {module:kld-affine.Matrix2D} that
         *  @param {number} precision
         *  @returns {boolean}
         */
        precisionEquals(that, precision) {
            return (
                Math.abs(this.a - that.a) < precision &&
                Math.abs(this.b - that.b) < precision &&
                Math.abs(this.c - that.c) < precision &&
                Math.abs(this.d - that.d) < precision &&
                Math.abs(this.e - that.e) < precision &&
                Math.abs(this.f - that.f) < precision
            );
        }

        /**
         *  toString
         *
         *  @returns {string}
         */
        toString() {
            return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`;
        }
    }

    /**
     *  Identity matrix
     *
     *  @returns {module:kld-affine.Matrix2D}
     */
    Matrix2D.IDENTITY = new Matrix2D();
    Matrix2D.IDENTITY.isIdentity = () => true;

    /**
     *  PathLexeme.js
     *
     *  @copyright 2002, 2013 Kevin Lindsey
     *  @module PathLexeme
     */

    /**
     *  PathLexeme
     */
    class PathLexeme {
        /**
         *  PathLexeme
         *
         *  @param {number} type
         *  @param {string} text
         */
        constructor(type, text) {
            this.type = type;
            this.text = text;
        }

        /**
         *  Determine if this lexeme is of the given type
         *
         *  @param {number} type
         *  @returns {boolean}
         */
        typeis(type) {
            return this.type === type;
        }
    }

    /*
     * token type enumerations
     */
    PathLexeme.UNDEFINED = 0;
    PathLexeme.COMMAND = 1;
    PathLexeme.NUMBER = 2;
    PathLexeme.EOD = 3;

    /**
     *  PathLexer.js
     *
     *  @copyright 2003, 2013 Kevin Lindsey
     *  @module PathLexer
     */

    /**
     *  Create a new instance of PathLexer
     */
    class PathLexer {
        /**
         *  @param {string} [pathData]
         */
        constructor(pathData) {
            if (pathData === null || pathData === undefined) {
                pathData = "";
            }

            this.setPathData(pathData);
        }

        /**
         *  setPathData
         *
         *  @param {string} pathData
         */
        setPathData(pathData) {
            if (typeof pathData !== "string") {
                throw new TypeError("The first parameter must be a string");
            }

            this._pathData = pathData;
        }

        /**
         *  getNextToken
         *
         *  @returns {PathLexeme}
         */
        getNextToken() {
            let result = null;
            let d = this._pathData;

            while (result === null) {
                if (d === null || d === "") {
                    result = new PathLexeme(PathLexeme.EOD, "");
                }
                else if (d.match(/^([ \t\r\n,]+)/)) {
                    d = d.substr(RegExp.$1.length);
                }
                else if (d.match(/^([AaCcHhLlMmQqSsTtVvZz])/)) {
                    result = new PathLexeme(PathLexeme.COMMAND, RegExp.$1);
                    d = d.substr(RegExp.$1.length);
                }
                /* eslint-disable-next-line unicorn/no-unsafe-regex */
                else if (d.match(/^(([-+]?\d+(\.\d*)?|[-+]?\.\d+)([eE][-+]?\d+)?)/)) {
                    result = new PathLexeme(PathLexeme.NUMBER, RegExp.$1);
                    d = d.substr(RegExp.$1.length);
                }
                else {
                    throw new SyntaxError(`Unrecognized path data: ${d}`);
                }
            }

            this._pathData = d;

            return result;
        }
    }

    /**
     *  PathParser.js
     *
     *  @copyright 2003, 2017 Kevin Lindsey
     *  @module PathParser
     */

    const BOP = "BOP";

    /**
     *  PathParser
     */
    class PathParser {
        /**
         * constructor
         */
        constructor() {
            this._lexer = new PathLexer();
            this._handler = null;
        }

        /**
         *  parseData
         *
         *  @param {string} pathData
         *  @throws {Error}
         */
        parseData(pathData) {
            if (typeof pathData !== "string") {
                throw new TypeError(`The first parameter must be a string: ${pathData}`);
            }

            // begin parse
            if (this._handler !== null && typeof this._handler.beginParse === "function") {
                this._handler.beginParse();
            }

            // pass the pathData to the lexer
            const lexer = this._lexer;

            lexer.setPathData(pathData);

            // set mode to signify new path - Beginning Of Path
            let mode = BOP;

            // Process all tokens
            let lastToken = null;
            let token = lexer.getNextToken();

            while (token.typeis(PathLexeme.EOD) === false) {
                let parameterCount;
                const params = [];

                // process current token
                switch (token.type) {
                    case PathLexeme.COMMAND:
                        if (mode === BOP && token.text !== "M" && token.text !== "m") {
                            throw new SyntaxError(`New paths must begin with a moveto command. Found '${token.text}'`);
                        }

                        // Set new parsing mode
                        mode = token.text;

                        // Get count of numbers that must follow this command
                        parameterCount = PathParser.PARAMCOUNT[token.text.toUpperCase()];

                        // Advance past command token
                        token = lexer.getNextToken();
                        break;

                    case PathLexeme.NUMBER:
                        // Most commands allow you to keep repeating parameters
                        // without specifying the command again.  We just assume
                        // that is the case and do nothing since the mode remains
                        // the same

                        if (mode === BOP) {
                            throw new SyntaxError(`New paths must begin with a moveto command. Found '${token.text}'`);
                        }
                        else {
                            parameterCount = PathParser.PARAMCOUNT[mode.toUpperCase()];
                        }
                        break;

                    default:
                        throw new SyntaxError(`Unrecognized command type: ${token.type}`);
                }

                // Get parameters
                for (let i = 0; i < parameterCount; i++) {
                    switch (token.type) {
                        case PathLexeme.COMMAND:
                            throw new SyntaxError(`Parameter must be a number. Found '${token.text}'`);

                        case PathLexeme.NUMBER:
                            // convert current parameter to a float and add to
                            // parameter list
                            params[i] = parseFloat(token.text);
                            break;

                        case PathLexeme.EOD:
                            throw new SyntaxError("Unexpected end of string");

                        default:
                            throw new SyntaxError(`Unrecognized parameter type. Found type '${token.type}'`);
                    }

                    token = lexer.getNextToken();
                }

                // fire handler
                if (this._handler !== null) {
                    const handler = this._handler;
                    const methodName = PathParser.METHODNAME[mode];

                    // convert types for arcs
                    if (mode === "a" || mode === "A") {
                        params[3] = params[3] !== 0;
                        params[4] = params[4] !== 0;
                    }

                    if (handler !== null && typeof handler[methodName] === "function") {
                        handler[methodName](...params);
                    }
                }

                // Lineto's follow moveto when no command follows moveto params.  Go
                // ahead and set the mode just in case no command follows the moveto
                // command
                switch (mode) {
                    case "M":
                        mode = "L";
                        break;
                    case "m":
                        mode = "l";
                        break;
                    case "Z":
                    case "z":
                        mode = "BOP";
                        break;
                        // ignore for now
                }

                if (token === lastToken) {
                    throw new SyntaxError(`Parser stalled on '${token.text}'`);
                }
                else {
                    lastToken = token;
                }
            }

            // end parse
            if (this._handler !== null && typeof this._handler.endParse === "function") {
                this._handler.endParse();
            }
        }

        /**
         *  setHandler
         *
         *  @param {Object} handler
         */
        setHandler(handler) {
            this._handler = handler;
        }
    }

    /*
     * class constants
     */
    PathParser.PARAMCOUNT = {
        A: 7,
        C: 6,
        H: 1,
        L: 2,
        M: 2,
        Q: 4,
        S: 4,
        T: 2,
        V: 1,
        Z: 0
    };
    PathParser.METHODNAME = {
        A: "arcAbs",
        a: "arcRel",
        C: "curvetoCubicAbs",
        c: "curvetoCubicRel",
        H: "linetoHorizontalAbs",
        h: "linetoHorizontalRel",
        L: "linetoAbs",
        l: "linetoRel",
        M: "movetoAbs",
        m: "movetoRel",
        Q: "curvetoQuadraticAbs",
        q: "curvetoQuadraticRel",
        S: "curvetoCubicSmoothAbs",
        s: "curvetoCubicSmoothRel",
        T: "curvetoQuadraticSmoothAbs",
        t: "curvetoQuadraticSmoothRel",
        V: "linetoVerticalAbs",
        v: "linetoVerticalRel",
        Z: "closePath",
        z: "closePath"
    };

    /**
     *  PathHandler.js
     *
     *  @copyright 2017 Kevin Lindsey
     */

    const TWO_PI = 2.0 * Math.PI;

    /**
     * Based on the SVG 1.1 specification, Appendix F: Implementation Requirements,
     * Section F.6 "Elliptical arc implementation notes"
     * {@see https://www.w3.org/TR/SVG11/implnote.html#ArcImplementationNotes}
     *
     * @param {module:kld-affine.Point2D} startPoint
     * @param {module:kld-affine.Point2D} endPoint
     * @param {number} rx
     * @param {number} ry
     * @param {number} angle
     * @param {boolean} arcFlag
     * @param {boolean} sweepFlag
     * @returns {Array}
     */
    function getArcParameters(startPoint, endPoint, rx, ry, angle, arcFlag, sweepFlag) {
        angle = angle * Math.PI / 180;

        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const TOLERANCE = 1e-6;

        // Section (F.6.5.1)
        const halfDiff = startPoint.subtract(endPoint).multiply(0.5);
        const x1p = halfDiff.x * c + halfDiff.y * s;
        const y1p = halfDiff.x * -s + halfDiff.y * c;

        // Section (F.6.6.1)
        rx = Math.abs(rx);
        ry = Math.abs(ry);

        // Section (F.6.6.2)
        const x1px1p = x1p * x1p;
        const y1py1p = y1p * y1p;
        const lambda = (x1px1p / (rx * rx)) + (y1py1p / (ry * ry));

        // Section (F.6.6.3)
        if (lambda > 1) {
            const factor = Math.sqrt(lambda);

            rx *= factor;
            ry *= factor;
        }

        // Section (F.6.5.2)
        const rxrx = rx * rx;
        const ryry = ry * ry;
        const rxy1 = rxrx * y1py1p;
        const ryx1 = ryry * x1px1p;

        let factor = (rxrx * ryry - rxy1 - ryx1) / (rxy1 + ryx1);

        if (Math.abs(factor) < TOLERANCE) {
            factor = 0;
        }

        let sq = Math.sqrt(factor);

        if (arcFlag === sweepFlag) {
            sq = -sq;
        }

        // Section (F.6.5.3)
        const mid = startPoint.add(endPoint).multiply(0.5);
        const cxp = sq * rx * y1p / ry;
        const cyp = sq * -ry * x1p / rx;

        // Section (F.6.5.5 - F.6.5.6)
        const xcr1 = (x1p - cxp) / rx;
        const xcr2 = (x1p + cxp) / rx;
        const ycr1 = (y1p - cyp) / ry;
        const ycr2 = (y1p + cyp) / ry;

        const theta1 = new Vector2D(1, 0).angleBetween(new Vector2D(xcr1, ycr1));
        // let deltaTheta = normalizeAngle(new Vector2D(xcr1, ycr1).angleBetween(new Vector2D(-xcr2, -ycr2)));
        let deltaTheta = new Vector2D(xcr1, ycr1).angleBetween(new Vector2D(-xcr2, -ycr2));

        if (sweepFlag === false) {
            deltaTheta -= TWO_PI;
        }

        return [
            cxp * c - cyp * s + mid.x,
            cxp * s + cyp * c + mid.y,
            rx,
            ry,
            theta1,
            theta1 + deltaTheta
        ];
    }

    /**
     *  PathHandler
     */
    class PathHandler {
        /**
         * PathHandler
         *
         * @param {ShapeInfo} shapeCreator
         */
        constructor(shapeCreator) {
            this.shapeCreator = shapeCreator;
            this.shapes = [];
            this.firstX = null;
            this.firstY = null;
            this.lastX = null;
            this.lastY = null;
            this.lastCommand = null;
        }

        /**
         * beginParse
         */
        beginParse() {
            // zero out the sub-path array
            this.shapes = [];

            // clear firstX, firstY, lastX, and lastY
            this.firstX = null;
            this.firstY = null;
            this.lastX = null;
            this.lastY = null;

            // need to remember last command type to determine how to handle the
            // relative Bezier commands
            this.lastCommand = null;
        }

        /**
         *  addShape
         *
         *  @param {ShapeInfo} shape
         */
        addShape(shape) {
            this.shapes.push(shape);
        }

        /**
         *  arcAbs - A
         *
         *  @param {number} rx
         *  @param {number} ry
         *  @param {number} xAxisRotation
         *  @param {boolean} arcFlag
         *  @param {boolean} sweepFlag
         *  @param {number} x
         *  @param {number} y
         */
        arcAbs(rx, ry, xAxisRotation, arcFlag, sweepFlag, x, y) {
            if (rx === 0 || ry === 0) {
                this.addShape(this.shapeCreator.line(
                    this.lastX, this.lastY,
                    x, y
                ));
            }
            else {
                const arcParameters = getArcParameters(
                    new Point2D(this.lastX, this.lastY),
                    new Point2D(x, y),
                    rx, ry,
                    xAxisRotation,
                    arcFlag, sweepFlag
                );

                this.addShape(this.shapeCreator.arc(...arcParameters));
            }

            this.lastCommand = "A";
            this.lastX = x;
            this.lastY = y;
        }

        /**
         *  arcRel - a
         *
         *  @param {number} rx
         *  @param {number} ry
         *  @param {number} xAxisRotation
         *  @param {boolean} arcFlag
         *  @param {boolean} sweepFlag
         *  @param {number} x
         *  @param {number} y
         */
        arcRel(rx, ry, xAxisRotation, arcFlag, sweepFlag, x, y) {
            if (rx === 0 || ry === 0) {
                this.addShape(this.shapeCreator.line(
                    this.lastX, this.lastY,
                    this.lastX + x, this.lastY + y
                ));
            }
            else {
                const arcParameters = getArcParameters(
                    new Point2D(this.lastX, this.lastY),
                    new Point2D(this.lastX + x, this.lastY + y),
                    rx, ry,
                    xAxisRotation,
                    arcFlag, sweepFlag
                );

                this.addShape(this.shapeCreator.arc(...arcParameters));
            }

            this.lastCommand = "a";
            this.lastX += x;
            this.lastY += y;
        }

        /**
         *  curvetoCubicAbs - C
         *
         *  @param {number} x1
         *  @param {number} y1
         *  @param {number} x2
         *  @param {number} y2
         *  @param {number} x
         *  @param {number} y
         */
        curvetoCubicAbs(x1, y1, x2, y2, x, y) {
            this.addShape(this.shapeCreator.cubicBezier(
                this.lastX, this.lastY,
                x1, y1,
                x2, y2,
                x, y
            ));

            this.lastX = x;
            this.lastY = y;
            this.lastCommand = "C";
        }

        /**
         *  curvetoCubicRel - c
         *
         *  @param {number} x1
         *  @param {number} y1
         *  @param {number} x2
         *  @param {number} y2
         *  @param {number} x
         *  @param {number} y
         */
        curvetoCubicRel(x1, y1, x2, y2, x, y) {
            this.addShape(this.shapeCreator.cubicBezier(
                this.lastX, this.lastY,
                this.lastX + x1, this.lastY + y1,
                this.lastX + x2, this.lastY + y2,
                this.lastX + x, this.lastY + y
            ));

            this.lastX += x;
            this.lastY += y;
            this.lastCommand = "c";
        }

        /**
         *  linetoHorizontalAbs - H
         *
         *  @param {number} x
         */
        linetoHorizontalAbs(x) {
            this.addShape(this.shapeCreator.line(
                this.lastX, this.lastY,
                x, this.lastY
            ));

            this.lastX = x;
            this.lastCommand = "H";
        }

        /**
         *  linetoHorizontalRel - h
         *
         *  @param {number} x
         */
        linetoHorizontalRel(x) {
            this.addShape(this.shapeCreator.line(
                this.lastX, this.lastY,
                this.lastX + x, this.lastY
            ));

            this.lastX += x;
            this.lastCommand = "h";
        }

        /**
         *  linetoAbs - L
         *
         *  @param {number} x
         *  @param {number} y
         */
        linetoAbs(x, y) {
            this.addShape(this.shapeCreator.line(
                this.lastX, this.lastY,
                x, y
            ));

            this.lastX = x;
            this.lastY = y;
            this.lastCommand = "L";
        }

        /**
         *  linetoRel - l
         *
         *  @param {number} x
         *  @param {number} y
         */
        linetoRel(x, y) {
            this.addShape(this.shapeCreator.line(
                this.lastX, this.lastY,
                this.lastX + x, this.lastY + y
            ));

            this.lastX += x;
            this.lastY += y;
            this.lastCommand = "l";
        }

        /**
         *  movetoAbs - M
         *
         *  @param {number} x
         *  @param {number} y
         */
        movetoAbs(x, y) {
            this.firstX = x;
            this.firstY = y;
            this.lastX = x;
            this.lastY = y;
            this.lastCommand = "M";
        }

        /**
         *  movetoRel - m
         *
         *  @param {number} x
         *  @param {number} y
         */
        movetoRel(x, y) {
            this.firstX += x;
            this.firstY += y;
            this.lastX += x;
            this.lastY += y;
            this.lastCommand = "m";
        }

        /**
         *  curvetoQuadraticAbs - Q
         *
         *  @param {number} x1
         *  @param {number} y1
         *  @param {number} x
         *  @param {number} y
         */
        curvetoQuadraticAbs(x1, y1, x, y) {
            this.addShape(this.shapeCreator.quadraticBezier(
                this.lastX, this.lastY,
                x1, y1,
                x, y
            ));

            this.lastX = x;
            this.lastY = y;
            this.lastCommand = "Q";
        }

        /**
         *  curvetoQuadraticRel - q
         *
         *  @param {number} x1
         *  @param {number} y1
         *  @param {number} x
         *  @param {number} y
         */
        curvetoQuadraticRel(x1, y1, x, y) {
            this.addShape(this.shapeCreator.quadraticBezier(
                this.lastX, this.lastY,
                this.lastX + x1, this.lastY + y1,
                this.lastX + x, this.lastY + y
            ));

            this.lastX += x;
            this.lastY += y;
            this.lastCommand = "q";
        }

        /**
         *  curvetoCubicSmoothAbs - S
         *
         *  @param {number} x2
         *  @param {number} y2
         *  @param {number} x
         *  @param {number} y
         */
        curvetoCubicSmoothAbs(x2, y2, x, y) {
            let controlX, controlY;

            if (this.lastCommand.match(/^[SsCc]$/)) {
                const secondToLast = this.shapes[this.shapes.length - 1].args[2];

                controlX = 2 * this.lastX - secondToLast.x;
                controlY = 2 * this.lastY - secondToLast.y;
            }
            else {
                controlX = this.lastX;
                controlY = this.lastY;
            }

            this.addShape(this.shapeCreator.cubicBezier(
                this.lastX, this.lastY,
                controlX, controlY,
                x2, y2,
                x, y
            ));

            this.lastX = x;
            this.lastY = y;
            this.lastCommand = "S";
        }

        /**
         *  curvetoCubicSmoothRel - s
         *
         *  @param {number} x2
         *  @param {number} y2
         *  @param {number} x
         *  @param {number} y
         */
        curvetoCubicSmoothRel(x2, y2, x, y) {
            let controlX, controlY;

            if (this.lastCommand.match(/^[SsCc]$/)) {
                const secondToLast = this.shapes[this.shapes.length - 1].args[2];

                controlX = 2 * this.lastX - secondToLast.x;
                controlY = 2 * this.lastY - secondToLast.y;
            }
            else {
                controlX = this.lastX;
                controlY = this.lastY;
            }

            this.addShape(this.shapeCreator.cubicBezier(
                this.lastX, this.lastY,
                controlX, controlY,
                this.lastX + x2, this.lastY + y2,
                this.lastX + x, this.lastY + y
            ));

            this.lastX += x;
            this.lastY += y;
            this.lastCommand = "s";
        }

        /**
         *  curvetoQuadraticSmoothAbs - T
         *
         *  @param {number} x
         *  @param {number} y
         */
        curvetoQuadraticSmoothAbs(x, y) {
            let controlX, controlY;

            if (this.lastCommand.match(/^[QqTt]$/)) {
                const secondToLast = this.shapes[this.shapes.length - 1].args[1];

                controlX = 2 * this.lastX - secondToLast.x;
                controlY = 2 * this.lastY - secondToLast.y;
            }
            else {
                controlX = this.lastX;
                controlY = this.lastY;
            }

            this.addShape(this.shapeCreator.quadraticBezier(
                this.lastX, this.lastY,
                controlX, controlY,
                x, y
            ));

            this.lastX = x;
            this.lastY = y;
            this.lastCommand = "T";
        }

        /**
         *  curvetoQuadraticSmoothRel - t
         *
         *  @param {number} x
         *  @param {number} y
         */
        curvetoQuadraticSmoothRel(x, y) {
            let controlX, controlY;

            if (this.lastCommand.match(/^[QqTt]$/)) {
                const secondToLast = this.shapes[this.shapes.length - 1].args[1];

                controlX = 2 * this.lastX - secondToLast.x;
                controlY = 2 * this.lastY - secondToLast.y;
            }
            else {
                controlX = this.lastX;
                controlY = this.lastY;
            }

            this.addShape(this.shapeCreator.quadraticBezier(
                this.lastX, this.lastY,
                controlX, controlY,
                this.lastX + x, this.lastY + y
            ));

            this.lastX += x;
            this.lastY += y;
            this.lastCommand = "t";
        }

        /**
         *  linetoVerticalAbs - V
         *
         *  @param {number} y
         */
        linetoVerticalAbs(y) {
            this.addShape(this.shapeCreator.line(
                this.lastX, this.lastY,
                this.lastX, y
            ));

            this.lastY = y;

            this.lastCommand = "V";
        }

        /**
         *  linetoVerticalRel - v
         *
         *  @param {number} y
         */
        linetoVerticalRel(y) {
            this.addShape(this.shapeCreator.line(
                this.lastX, this.lastY,
                this.lastX, this.lastY + y
            ));

            this.lastY += y;

            this.lastCommand = "v";
        }

        /**
         *  closePath - z or Z
         */
        closePath() {
            this.addShape(this.shapeCreator.line(
                this.lastX, this.lastY,
                this.firstX, this.firstY
            ));

            this.lastX = this.firstX;
            this.lastY = this.firstY;
            this.lastCommand = "z";
        }
    }

    /**
     *  ShapeInfo.js
     *  @copyright 2002, 2017 Kevin Lindsey
     */

    const degree90 = Math.PI * 0.5;
    const parser = new PathParser();


    /**
     * getValues
     *
     * @param {Array} types
     * @param {Array} args
     * @returns {Array}
     */
    function getValues(types, args) {
        const result = [];

        for (const [names, type] of types) {
            let value = null;

            if (type === "Point2D") {
                value = parsePoint(names, args);
            }
            else if (type === "Number") {
                value = parseNumber(names, args);
            }
            else if (type === "Array<Point2D>" || type === "Point2D[]") {
                const values = [];

                while (args.length > 0) {
                    values.push(parsePoint(names, args));
                }

                if (values.length > 0) {
                    value = values;
                }
            }
            else if (type === "Optional<Number>" || type === "Number?") {
                value = parseNumber(names, args);

                if (value === null) {
                    value = undefined;
                }
            }
            else {
                throw new TypeError(`Unrecognized value type: ${type}`);
            }

            if (value !== null) {
                result.push(value);
            }
            else {
                throw new TypeError(`Unable to extract value for ${names}`);
            }
        }

        return result;
    }

    /**
     * parseNumber
     *
     * @param {Array} names
     * @param {Array} args
     * @returns {number}
     */
    function parseNumber(names, args) {
        let result = null;

        if (args.length > 0) {
            const item = args[0];
            const itemType = typeof item;

            if (itemType === "number") {
                return args.shift();
            }
            else if (itemType === "object") {
                for (const prop of names) {
                    if (prop in item && typeof item[prop] === "number") {
                        result = item[prop];
                        break;
                    }
                }
            }
        }

        return result;
    }

    /**
     * parsePoint
     *
     * @param {Array} names
     * @param {Array} args
     * @returns {Array}
     */
    function parsePoint(names, args) {
        let result = null;

        if (args.length > 0) {
            const item = args[0];
            const itemType = typeof item;

            if (itemType === "number") {
                if (args.length > 1) {
                    const x = args.shift();
                    const y = args.shift();

                    result = new Point2D(x, y);
                }
            }
            else if (Array.isArray(item) && item.length > 1) {
                if (item.length === 2) {
                    const [x, y] = args.shift();

                    result = new Point2D(x, y);
                }
                else {
                    throw new TypeError(`Unhandled array of length ${item.length}`);
                }
            }
            else if (itemType === "object") {
                if ("x" in item && "y" in item) {
                    result = new Point2D(item.x, item.y);
                    args.shift();
                }
                else {
                    for (const props of names) {
                        if (Array.isArray(props)) {
                            if (props.every(p => p in item)) {
                                result = new Point2D(item[props[0]], item[props[1]]);
                                break;
                            }
                        }
                        else if (props in item) {
                            result = parsePoint([], [item[props]]);
                            break;
                        }
                    }
                }
            }
        }

        return result;
    }

    /**
     *  ShapeInfo
     *  @memberof module:kld-intersections
     */
    class ShapeInfo {
        /**
         *  @param {string} name
         *  @param {Array} args
         *  @returns {module:kld-intersections.ShapeInfo}
         */
        constructor(name, args) {
            this.name = name;
            this.args = args;
        }

        static arc(...args) {
            const types = [
                [["center", ["centerX", "centerY"], ["cx", "cy"]], "Point2D"],
                [["radiusX", "rx"], "Number"],
                [["radiusY", "ry"], "Number"],
                [["startRadians"], "Number"],
                [["endRadians"], "Number"]
            ];
            const values = getValues(types, args);

            return new ShapeInfo(ShapeInfo.ARC, values);
        }

        static quadraticBezier(...args) {
            const types = [
                [["p1", ["p1x", "p1y"]], "Point2D"],
                [["p2", ["p2x", "p2y"]], "Point2D"],
                [["p3", ["p3x", "p3y"]], "Point2D"]
            ];
            const values = getValues(types, args);

            return new ShapeInfo(ShapeInfo.QUADRATIC_BEZIER, values);
        }

        static cubicBezier(...args) {
            const types = [
                [["p1", ["p1x", "p1y"]], "Point2D"],
                [["p2", ["p2x", "p2y"]], "Point2D"],
                [["p3", ["p3x", "p3y"]], "Point2D"],
                [["p4", ["p4x", "p4y"]], "Point2D"]
            ];
            const values = getValues(types, args);

            return new ShapeInfo(ShapeInfo.CUBIC_BEZIER, values);
        }

        static circle(...args) {
            const types = [
                [["center", ["centerX", "centerY"], ["cx", "cy"]], "Point2D"],
                [["radius", "r"], "Number"]
            ];
            const values = getValues(types, args);

            return new ShapeInfo(ShapeInfo.CIRCLE, values);
        }

        static ellipse(...args) {
            const types = [
                [["center", ["centerX", "centerY"], ["cx", "cy"]], "Point2D"],
                [["radiusX", "rx"], "Number"],
                [["radiusY", "ry"], "Number"]
            ];
            const values = getValues(types, args);

            return new ShapeInfo(ShapeInfo.ELLIPSE, values);
        }

        static line(...args) {
            const types = [
                [["p1", ["p1x", "p1y"], ["x1", "y1"]], "Point2D"],
                [["p2", ["p2x", "p2y"], ["x2", "y2"]], "Point2D"]
            ];
            const values = getValues(types, args);

            return new ShapeInfo(ShapeInfo.LINE, values);
        }

        static path(...args) {
            parser.parseData(args[0]);

            return new ShapeInfo(ShapeInfo.PATH, handler.shapes);
        }

        static polygon(...args) {
            const types = [
                [[], "Array<Point2D>"]
            ];
            const values = getValues(
                types,
                args.length === 1 && Array.isArray(args[0]) ? args[0] : args
            );

            return new ShapeInfo(ShapeInfo.POLYGON, values);
        }

        static polyline(...args) {
            const types = [
                [[], "Array<Point2D>"]
            ];
            const values = getValues(
                types,
                args.length === 1 && Array.isArray(args[0]) ? args[0] : args
            );

            return new ShapeInfo(ShapeInfo.POLYLINE, values);
        }

        static rectangle(...args) {
            const types = [
                [["topLeft", ["x", "y"], ["left", "top"]], "Point2D"],
                [["size", ["width", "height"], ["w", "h"]], "Point2D"],
                [["radiusX", "rx"], "Optional<Number>"],
                [["radiusY", "ry"], "Optional<Number>"]
            ];
            const values = getValues(types, args);

            // fix up bottom-right point
            const p1 = values[0];
            const p2 = values[1];
            values[1] = new Point2D(p1.x + p2.x, p1.y + p2.y);

            // create shape info
            const result = new ShapeInfo(ShapeInfo.RECTANGLE, values);

            // handle possible rounded rectangle values
            let ry = result.args.pop();
            let rx = result.args.pop();

            rx = rx === undefined ? 0 : rx;
            ry = ry === undefined ? 0 : ry;

            if (rx === 0 && ry === 0) {
                return result;
            }

            const {x: p1x, y: p1y} = result.args[0];
            const {x: p2x, y: p2y} = result.args[1];
            const width = p2x - p1x;
            const height = p2y - p1y;

            if (rx === 0) {
                rx = ry;
            }
            if (ry === 0) {
                ry = rx;
            }
            if (rx > width * 0.5) {
                rx = width * 0.5;
            }
            if (ry > height * 0.5) {
                ry = height * 0.5;
            }

            const x0 = p1x;
            const y0 = p1y;
            const x1 = p1x + rx;
            const y1 = p1y + ry;
            const x2 = p2x - rx;
            const y2 = p2y - ry;
            const x3 = p2x;
            const y3 = p2y;

            const segments = [
                ShapeInfo.arc(x1, y1, rx, ry, 2 * degree90, 3 * degree90),
                ShapeInfo.line(x1, y0, x2, y0),
                ShapeInfo.arc(x2, y1, rx, ry, 3 * degree90, 4 * degree90),
                ShapeInfo.line(x3, y1, x3, y2),
                ShapeInfo.arc(x2, y2, rx, ry, 0, degree90),
                ShapeInfo.line(x2, y3, x1, y3),
                ShapeInfo.arc(x1, y2, rx, ry, degree90, 2 * degree90),
                ShapeInfo.line(x0, y2, x0, y1)
            ];

            return new ShapeInfo(ShapeInfo.PATH, segments);
        }
    }

    // define shape name constants
    ShapeInfo.ARC = "Arc";
    ShapeInfo.QUADRATIC_BEZIER = "Bezier2";
    ShapeInfo.CUBIC_BEZIER = "Bezier3";
    ShapeInfo.CIRCLE = "Circle";
    ShapeInfo.ELLIPSE = "Ellipse";
    ShapeInfo.LINE = "Line";
    ShapeInfo.PATH = "Path";
    ShapeInfo.POLYGON = "Polygon";
    ShapeInfo.POLYLINE = "Polyline";
    ShapeInfo.RECTANGLE = "Rectangle";

    // setup path parser handler after ShapeInfo has been defined
    const handler = new PathHandler(ShapeInfo);

    parser.setHandler(handler);

    /* components/Head.svelte generated by Svelte v3.22.3 */

    const file$2 = "components/Head.svelte";

    function create_fragment$2(ctx) {
    	let div;
    	let a;
    	let t0;
    	let t1;
    	let t2;
    	let t3;

    	const block = {
    		c: function create() {
    			div = element("div");
    			a = element("a");
    			t0 = text("〱 ./");
    			t1 = text(/*year*/ ctx[1]);
    			t2 = text("/ ");
    			t3 = text(/*num*/ ctx[0]);
    			attr_dev(a, "class", "link f1 blue svelte-7y3xyx");
    			attr_dev(a, "href", "../../");
    			add_location(a, file$2, 34, 2, 601);
    			attr_dev(div, "class", "blue ml1 goleft left svelte-7y3xyx");
    			add_location(div, file$2, 33, 0, 564);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, a);
    			append_dev(a, t0);
    			append_dev(a, t1);
    			append_dev(a, t2);
    			append_dev(a, t3);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*num*/ 1) set_data_dev(t3, /*num*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let year = new Date().getFullYear();
    	let { num = "01" } = $$props;
    	const writable_props = ["num"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Head> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Head", $$slots, []);

    	$$self.$set = $$props => {
    		if ("num" in $$props) $$invalidate(0, num = $$props.num);
    	};

    	$$self.$capture_state = () => ({ year, num });

    	$$self.$inject_state = $$props => {
    		if ("year" in $$props) $$invalidate(1, year = $$props.year);
    		if ("num" in $$props) $$invalidate(0, num = $$props.num);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [num, year];
    }

    class Head extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { num: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Head",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get num() {
    		throw new Error("<Head>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set num(value) {
    		throw new Error("<Head>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components/Foot.svelte generated by Svelte v3.22.3 */

    const file$3 = "components/Foot.svelte";

    // (40:2) {:else}
    function create_else_block(ctx) {
    	let a;

    	const block = {
    		c: function create() {
    			a = element("a");
    			a.textContent = "source";
    			attr_dev(a, "class", "m2 svelte-1xt868z");
    			attr_dev(a, "href", "https://github.com/spencermountain/thensome");
    			add_location(a, file$3, 40, 4, 712);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(40:2) {:else}",
    		ctx
    	});

    	return block;
    }

    // (36:2) {#if num && year}
    function create_if_block(ctx) {
    	let a;
    	let t;
    	let a_href_value;

    	const block = {
    		c: function create() {
    			a = element("a");
    			t = text("source");
    			attr_dev(a, "class", "m2 svelte-1xt868z");
    			attr_dev(a, "href", a_href_value = "https://github.com/spencermountain/thensome/tree/gh-pages/" + /*year*/ ctx[1] + "/" + /*num*/ ctx[0]);
    			add_location(a, file$3, 36, 4, 583);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*year, num*/ 3 && a_href_value !== (a_href_value = "https://github.com/spencermountain/thensome/tree/gh-pages/" + /*year*/ ctx[1] + "/" + /*num*/ ctx[0])) {
    				attr_dev(a, "href", a_href_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(36:2) {#if num && year}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div;
    	let t0;
    	let a;

    	function select_block_type(ctx, dirty) {
    		if (/*num*/ ctx[0] && /*year*/ ctx[1]) return create_if_block;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if_block.c();
    			t0 = space();
    			a = element("a");
    			a.textContent = "@spencermountain";
    			attr_dev(a, "class", "name svelte-1xt868z");
    			attr_dev(a, "href", "http://twitter.com/spencermountain/");
    			add_location(a, file$3, 42, 2, 798);
    			attr_dev(div, "class", "footer svelte-1xt868z");
    			add_location(div, file$3, 34, 0, 538);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			if_block.m(div, null);
    			append_dev(div, t0);
    			append_dev(div, a);
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(div, t0);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { num = "" } = $$props;
    	let { year = "" } = $$props;
    	const writable_props = ["num", "year"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Foot> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Foot", $$slots, []);

    	$$self.$set = $$props => {
    		if ("num" in $$props) $$invalidate(0, num = $$props.num);
    		if ("year" in $$props) $$invalidate(1, year = $$props.year);
    	};

    	$$self.$capture_state = () => ({ num, year });

    	$$self.$inject_state = $$props => {
    		if ("num" in $$props) $$invalidate(0, num = $$props.num);
    		if ("year" in $$props) $$invalidate(1, year = $$props.year);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [num, year];
    }

    class Foot extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { num: 0, year: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Foot",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get num() {
    		throw new Error("<Foot>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set num(value) {
    		throw new Error("<Foot>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get year() {
    		throw new Error("<Foot>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set year(value) {
    		throw new Error("<Foot>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const subscriber_queue = [];
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }

    let isDown = writable(false);

    /* drafts/toronto-henge/Road.svelte generated by Svelte v3.22.3 */
    const file$4 = "drafts/toronto-henge/Road.svelte";

    function create_fragment$4(ctx) {
    	let path;
    	let path_stroke_value;
    	let path_stroke_linecap_value;
    	let path_stroke_width_value;
    	let dispose;

    	const block = {
    		c: function create() {
    			path = svg_element("path");
    			attr_dev(path, "d", /*d*/ ctx[2]);
    			attr_dev(path, "stroke", path_stroke_value = /*selected*/ ctx[1] ? "#D68881" : "lightsteelblue");
    			attr_dev(path, "fill", "none");

    			attr_dev(path, "stroke-linecap", path_stroke_linecap_value = /*hovering*/ ctx[0] || /*selected*/ ctx[1]
    			? "round"
    			: "butt");

    			attr_dev(path, "stroke-width", path_stroke_width_value = /*hovering*/ ctx[0] || /*selected*/ ctx[1]
    			? "5px"
    			: "2px");

    			add_location(path, file$4, 35, 0, 745);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor, remount) {
    			insert_dev(target, path, anchor);
    			if (remount) run_all(dispose);

    			dispose = [
    				listen_dev(path, "mouseenter", /*enter*/ ctx[3], false, false, false),
    				listen_dev(path, "mouseleave", /*leave*/ ctx[4], false, false, false),
    				listen_dev(path, "click", /*onClick*/ ctx[5], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*selected*/ 2 && path_stroke_value !== (path_stroke_value = /*selected*/ ctx[1] ? "#D68881" : "lightsteelblue")) {
    				attr_dev(path, "stroke", path_stroke_value);
    			}

    			if (dirty & /*hovering, selected*/ 3 && path_stroke_linecap_value !== (path_stroke_linecap_value = /*hovering*/ ctx[0] || /*selected*/ ctx[1]
    			? "round"
    			: "butt")) {
    				attr_dev(path, "stroke-linecap", path_stroke_linecap_value);
    			}

    			if (dirty & /*hovering, selected*/ 3 && path_stroke_width_value !== (path_stroke_width_value = /*hovering*/ ctx[0] || /*selected*/ ctx[1]
    			? "5px"
    			: "2px")) {
    				attr_dev(path, "stroke-width", path_stroke_width_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(path);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $isDown;
    	validate_store(isDown, "isDown");
    	component_subscribe($$self, isDown, $$value => $$invalidate(9, $isDown = $$value));
    	let { shape = "" } = $$props;
    	let { stroke = "lightgrey" } = $$props;
    	let { fill = "white" } = $$props;
    	let hovering;
    	let selected = false;
    	fill = spencerColor.colors[fill] || fill;
    	stroke = spencerColor.colors[stroke] || stroke;
    	let projection = getContext("projection");
    	const toPath = index().projection(projection);
    	let d = toPath(shape);

    	function enter() {
    		if ($isDown === true) {
    			$$invalidate(1, selected = true);
    		} else {
    			$$invalidate(0, hovering = true);
    		}
    	}

    	function leave() {
    		$$invalidate(0, hovering = false);
    	}

    	function onClick() {
    		$$invalidate(1, selected = !selected);
    	}

    	const writable_props = ["shape", "stroke", "fill"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Road> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Road", $$slots, []);

    	$$self.$set = $$props => {
    		if ("shape" in $$props) $$invalidate(8, shape = $$props.shape);
    		if ("stroke" in $$props) $$invalidate(6, stroke = $$props.stroke);
    		if ("fill" in $$props) $$invalidate(7, fill = $$props.fill);
    	};

    	$$self.$capture_state = () => ({
    		getContext,
    		d3Geo,
    		topojson,
    		c: spencerColor,
    		isDown,
    		shape,
    		stroke,
    		fill,
    		hovering,
    		selected,
    		projection,
    		toPath,
    		d,
    		enter,
    		leave,
    		onClick,
    		$isDown
    	});

    	$$self.$inject_state = $$props => {
    		if ("shape" in $$props) $$invalidate(8, shape = $$props.shape);
    		if ("stroke" in $$props) $$invalidate(6, stroke = $$props.stroke);
    		if ("fill" in $$props) $$invalidate(7, fill = $$props.fill);
    		if ("hovering" in $$props) $$invalidate(0, hovering = $$props.hovering);
    		if ("selected" in $$props) $$invalidate(1, selected = $$props.selected);
    		if ("projection" in $$props) projection = $$props.projection;
    		if ("d" in $$props) $$invalidate(2, d = $$props.d);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [hovering, selected, d, enter, leave, onClick, stroke, fill, shape];
    }

    class Road extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { shape: 8, stroke: 6, fill: 7 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Road",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get shape() {
    		throw new Error("<Road>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set shape(value) {
    		throw new Error("<Road>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stroke() {
    		throw new Error("<Road>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stroke(value) {
    		throw new Error("<Road>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fill() {
    		throw new Error("<Road>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fill(value) {
    		throw new Error("<Road>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* drafts/toronto-henge/Sunset.svelte generated by Svelte v3.22.3 */

    const file$5 = "drafts/toronto-henge/Sunset.svelte";

    function create_fragment$5(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			add_location(div, file$5, 8, 0, 117);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props) {
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Sunset> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Sunset", $$slots, []);
    	return [];
    }

    class Sunset extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Sunset",
    			options,
    			id: create_fragment$5.name
    		});
    	}
    }

    var type = "FeatureCollection";
    var generator = "overpass-ide";
    var copyright = "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.";
    var timestamp = "2020-05-15T12:05:02Z";
    var features = [
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/3998175",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4477375,
    					43.657304
    				],
    				[
    					-79.4476115,
    					43.6573291
    				],
    				[
    					-79.4474267,
    					43.6573667
    				],
    				[
    					-79.4469636,
    					43.6574725
    				],
    				[
    					-79.4453504,
    					43.6577913
    				]
    			]
    		},
    		id: "way/3998175"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/3998177",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Bloor Street West",
    			old_ref: "5",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3998167,
    					43.6675107
    				],
    				[
    					-79.3997056,
    					43.6675325
    				],
    				[
    					-79.399302,
    					43.6676217
    				]
    			]
    		},
    		id: "way/3998177"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4000036",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Queen's Park Crescent West",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3933295,
    					43.6658771
    				],
    				[
    					-79.3935039,
    					43.6657594
    				],
    				[
    					-79.3936341,
    					43.6656486
    				],
    				[
    					-79.3936833,
    					43.6655978
    				],
    				[
    					-79.3937301,
    					43.6655395
    				],
    				[
    					-79.3937772,
    					43.6654721
    				],
    				[
    					-79.393823,
    					43.6653845
    				],
    				[
    					-79.3938525,
    					43.6653208
    				],
    				[
    					-79.3938825,
    					43.665247
    				]
    			]
    		},
    		id: "way/4000036"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4000037",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Queen's Park Crescent West",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3931131,
    					43.6629433
    				],
    				[
    					-79.3930071,
    					43.6626748
    				],
    				[
    					-79.3929435,
    					43.6625369
    				],
    				[
    					-79.3929052,
    					43.6624866
    				],
    				[
    					-79.3928644,
    					43.6624313
    				]
    			]
    		},
    		id: "way/4000037"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4000038",
    			bridge: "yes",
    			highway: "secondary",
    			lanes: "3",
    			layer: "1",
    			lit: "yes",
    			name: "Queen's Park Crescent West",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3932391,
    					43.6632705
    				],
    				[
    					-79.3931131,
    					43.6629433
    				]
    			]
    		},
    		id: "way/4000038"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4000040",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			note: "Some signs say \"Queen's Park Circle\"",
    			oneway: "yes",
    			sidewalk: "none",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3912347,
    					43.6606757
    				],
    				[
    					-79.3911771,
    					43.6606517
    				],
    				[
    					-79.391081,
    					43.6606379
    				],
    				[
    					-79.3910114,
    					43.6606334
    				],
    				[
    					-79.3909467,
    					43.6606309
    				],
    				[
    					-79.3908822,
    					43.6606381
    				],
    				[
    					-79.3908173,
    					43.6606509
    				],
    				[
    					-79.3907361,
    					43.6606733
    				],
    				[
    					-79.3906645,
    					43.6606991
    				],
    				[
    					-79.3905639,
    					43.6607546
    				],
    				[
    					-79.3904803,
    					43.6608186
    				]
    			]
    		},
    		id: "way/4000040"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4000041",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park",
    			old_ref: "11A",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.392493,
    					43.6660672
    				],
    				[
    					-79.3927305,
    					43.6660906
    				],
    				[
    					-79.3928186,
    					43.666105
    				],
    				[
    					-79.392889,
    					43.6661286
    				],
    				[
    					-79.3929576,
    					43.6661691
    				],
    				[
    					-79.393016,
    					43.666217
    				],
    				[
    					-79.3930655,
    					43.6662616
    				],
    				[
    					-79.3931192,
    					43.6663161
    				],
    				[
    					-79.3931594,
    					43.6663676
    				]
    			]
    		},
    		id: "way/4000041"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4000042",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Queen's Park",
    			note: "Solid white lines on approach to intersection. Unclear if this prohibits turning from the u-turn ramp to southbound Queen's Park to westbound College.",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3912347,
    					43.6606757
    				],
    				[
    					-79.3911416,
    					43.6606417
    				],
    				[
    					-79.3910628,
    					43.6606062
    				],
    				[
    					-79.3910032,
    					43.6605737
    				],
    				[
    					-79.3909445,
    					43.6605331
    				],
    				[
    					-79.390896,
    					43.6604951
    				],
    				[
    					-79.3908501,
    					43.6604449
    				],
    				[
    					-79.390823,
    					43.6604068
    				],
    				[
    					-79.3907,
    					43.6600705
    				]
    			]
    		},
    		id: "way/4000042"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4000043",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "University Avenue",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3893464,
    					43.6575829
    				],
    				[
    					-79.3893958,
    					43.6577092
    				],
    				[
    					-79.389639,
    					43.6582632
    				],
    				[
    					-79.3897333,
    					43.658462
    				],
    				[
    					-79.3898495,
    					43.6587168
    				],
    				[
    					-79.3898942,
    					43.6588269
    				],
    				[
    					-79.390072,
    					43.6592652
    				]
    			]
    		},
    		id: "way/4000043"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4000045",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3975786,
    					43.6772071
    				],
    				[
    					-79.3975575,
    					43.6771508
    				],
    				[
    					-79.3973841,
    					43.6766912
    				]
    			]
    		},
    		id: "way/4000045"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4005310",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			"maxspeed:advisory": "40",
    			name: "Queen's Park",
    			oneway: "yes",
    			sidewalk: "none",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3905512,
    					43.6603454
    				],
    				[
    					-79.3906015,
    					43.6604684
    				],
    				[
    					-79.3906254,
    					43.6605016
    				],
    				[
    					-79.3906571,
    					43.6605234
    				],
    				[
    					-79.3906863,
    					43.660538
    				],
    				[
    					-79.3907158,
    					43.6605438
    				],
    				[
    					-79.3907607,
    					43.6605429
    				],
    				[
    					-79.3907868,
    					43.6605313
    				],
    				[
    					-79.3908086,
    					43.6605145
    				],
    				[
    					-79.3908213,
    					43.6604968
    				],
    				[
    					-79.3908267,
    					43.6604778
    				],
    				[
    					-79.3908306,
    					43.6604594
    				],
    				[
    					-79.390829,
    					43.6604397
    				],
    				[
    					-79.390823,
    					43.6604068
    				]
    			]
    		},
    		id: "way/4005310"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4005323",
    			bridge: "yes",
    			highway: "secondary",
    			lanes: "3",
    			layer: "1",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.430636,
    					43.6322826
    				],
    				[
    					-79.4309954,
    					43.632497
    				],
    				[
    					-79.4314453,
    					43.6327369
    				]
    			]
    		},
    		id: "way/4005323"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4005324",
    			bridge: "yes",
    			highway: "secondary",
    			lanes: "3",
    			layer: "1",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4351985,
    					43.6334167
    				],
    				[
    					-79.43594,
    					43.633461
    				],
    				[
    					-79.4365534,
    					43.633494
    				]
    			]
    		},
    		id: "way/4005324"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4005325",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4365534,
    					43.633494
    				],
    				[
    					-79.4366846,
    					43.6335043
    				],
    				[
    					-79.4367467,
    					43.6335149
    				],
    				[
    					-79.4368826,
    					43.6335497
    				],
    				[
    					-79.4369846,
    					43.6335856
    				],
    				[
    					-79.4370852,
    					43.6336266
    				],
    				[
    					-79.4372871,
    					43.6337185
    				],
    				[
    					-79.4375404,
    					43.633869
    				],
    				[
    					-79.4376299,
    					43.6339184
    				],
    				[
    					-79.4377161,
    					43.6339534
    				],
    				[
    					-79.4379442,
    					43.6340194
    				]
    			]
    		},
    		id: "way/4005325"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4005326",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3974493,
    					43.6373664
    				],
    				[
    					-79.3979325,
    					43.6370812
    				]
    			]
    		},
    		id: "way/4005326"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4005328",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4198084,
    					43.6305446
    				],
    				[
    					-79.4201893,
    					43.6304994
    				],
    				[
    					-79.4205692,
    					43.6303887
    				]
    			]
    		},
    		id: "way/4005328"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4006096",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			note: "lrt in central reservation",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3997044,
    					43.6364536
    				],
    				[
    					-79.3996218,
    					43.6363438
    				],
    				[
    					-79.3996072,
    					43.6363253
    				],
    				[
    					-79.3994465,
    					43.6361816
    				],
    				[
    					-79.3992469,
    					43.6360774
    				]
    			]
    		},
    		id: "way/4006096"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4006103",
    			destination: "Parkside Drive",
    			highway: "secondary",
    			lanes: "2",
    			name: "Parkside Drive",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|left"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4545577,
    					43.6380725
    				],
    				[
    					-79.4542005,
    					43.6381164
    				],
    				[
    					-79.4540838,
    					43.6381091
    				],
    				[
    					-79.4539652,
    					43.6381113
    				],
    				[
    					-79.4538717,
    					43.6381199
    				],
    				[
    					-79.453805,
    					43.6381332
    				],
    				[
    					-79.4537485,
    					43.6381527
    				],
    				[
    					-79.4536912,
    					43.6381748
    				],
    				[
    					-79.4536338,
    					43.6382087
    				],
    				[
    					-79.4535755,
    					43.6382648
    				],
    				[
    					-79.4535544,
    					43.6382907
    				],
    				[
    					-79.4535292,
    					43.6383781
    				]
    			]
    		},
    		id: "way/4006103"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4006105",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "2",
    			maxheight: "4",
    			name: "Parkside Drive",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4535974,
    					43.6386884
    				],
    				[
    					-79.4538348,
    					43.6393433
    				],
    				[
    					-79.4539293,
    					43.6394136
    				]
    			]
    		},
    		id: "way/4006105"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4006106",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "2",
    			maxheight: "4",
    			name: "Parkside Drive",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4539293,
    					43.6394136
    				],
    				[
    					-79.4539361,
    					43.6393302
    				],
    				[
    					-79.4537163,
    					43.6387463
    				]
    			]
    		},
    		id: "way/4006106"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4006108",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4545577,
    					43.6380725
    				],
    				[
    					-79.4535663,
    					43.6379871
    				],
    				[
    					-79.4530988,
    					43.6379424
    				],
    				[
    					-79.4530074,
    					43.6379287
    				],
    				[
    					-79.4518282,
    					43.637775
    				],
    				[
    					-79.4516145,
    					43.6377477
    				],
    				[
    					-79.4501327,
    					43.6374863
    				],
    				[
    					-79.4489549,
    					43.6372616
    				],
    				[
    					-79.4488542,
    					43.63724
    				],
    				[
    					-79.448654,
    					43.6372045
    				],
    				[
    					-79.4481614,
    					43.637117
    				],
    				[
    					-79.4480011,
    					43.6370907
    				],
    				[
    					-79.4476611,
    					43.6370494
    				],
    				[
    					-79.4474857,
    					43.6370336
    				],
    				[
    					-79.4473059,
    					43.6370225
    				],
    				[
    					-79.4471829,
    					43.6370189
    				]
    			]
    		},
    		id: "way/4006108"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4017395",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4143281,
    					43.6731379
    				],
    				[
    					-79.4142966,
    					43.673056
    				],
    				[
    					-79.4139289,
    					43.6721242
    				],
    				[
    					-79.4132145,
    					43.6702951
    				],
    				[
    					-79.4131331,
    					43.6700989
    				],
    				[
    					-79.4129459,
    					43.6696122
    				]
    			]
    		},
    		id: "way/4017395"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4017408",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4146538,
    					43.6739789
    				],
    				[
    					-79.4148004,
    					43.6743392
    				],
    				[
    					-79.4150785,
    					43.674989
    				],
    				[
    					-79.4151189,
    					43.6750853
    				],
    				[
    					-79.4151468,
    					43.675152
    				]
    			]
    		},
    		id: "way/4017408"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4045493",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4460871,
    					43.6387464
    				],
    				[
    					-79.4460664,
    					43.6387504
    				],
    				[
    					-79.4459487,
    					43.6387723
    				],
    				[
    					-79.4459293,
    					43.638776
    				],
    				[
    					-79.4438141,
    					43.6391774
    				],
    				[
    					-79.4436398,
    					43.6392085
    				],
    				[
    					-79.4424769,
    					43.6394309
    				],
    				[
    					-79.4421918,
    					43.6394882
    				],
    				[
    					-79.4416199,
    					43.6395999
    				],
    				[
    					-79.4411518,
    					43.6396899
    				],
    				[
    					-79.4410357,
    					43.6397126
    				],
    				[
    					-79.4409231,
    					43.6397346
    				]
    			]
    		},
    		id: "way/4045493"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4045495",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "50",
    			name: "King Street West",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4455095,
    					43.6383432
    				],
    				[
    					-79.4450561,
    					43.6381527
    				],
    				[
    					-79.4448459,
    					43.6380755
    				],
    				[
    					-79.4440035,
    					43.6377907
    				],
    				[
    					-79.4436538,
    					43.6376638
    				],
    				[
    					-79.4434004,
    					43.6375636
    				],
    				[
    					-79.4431358,
    					43.6374549
    				],
    				[
    					-79.4428333,
    					43.6373214
    				],
    				[
    					-79.4425578,
    					43.6371893
    				],
    				[
    					-79.4422769,
    					43.6370383
    				]
    			]
    		},
    		id: "way/4045495"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4045499",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "King Street West",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4412781,
    					43.6365244
    				],
    				[
    					-79.4411456,
    					43.6364977
    				],
    				[
    					-79.4410359,
    					43.6364819
    				],
    				[
    					-79.4408687,
    					43.6364674
    				],
    				[
    					-79.4401061,
    					43.636409
    				],
    				[
    					-79.4400507,
    					43.6364043
    				],
    				[
    					-79.4399879,
    					43.6364012
    				],
    				[
    					-79.4399425,
    					43.6364007
    				],
    				[
    					-79.4399008,
    					43.6364021
    				],
    				[
    					-79.4397998,
    					43.6364135
    				],
    				[
    					-79.4396804,
    					43.6364359
    				],
    				[
    					-79.4386769,
    					43.6366422
    				],
    				[
    					-79.4385714,
    					43.6366643
    				],
    				[
    					-79.4384794,
    					43.6366825
    				],
    				[
    					-79.4373173,
    					43.6369113
    				],
    				[
    					-79.4360964,
    					43.6371542
    				],
    				[
    					-79.4360046,
    					43.6371724
    				],
    				[
    					-79.4359197,
    					43.6371888
    				],
    				[
    					-79.4353358,
    					43.6373094
    				],
    				[
    					-79.4347645,
    					43.637426
    				],
    				[
    					-79.4346817,
    					43.6374422
    				],
    				[
    					-79.4346138,
    					43.6374567
    				],
    				[
    					-79.4337658,
    					43.6376318
    				],
    				[
    					-79.4333539,
    					43.6377165
    				],
    				[
    					-79.4332562,
    					43.6377362
    				],
    				[
    					-79.4331468,
    					43.6377576
    				],
    				[
    					-79.4318443,
    					43.6380271
    				],
    				[
    					-79.4309572,
    					43.6382089
    				],
    				[
    					-79.4308754,
    					43.6382259
    				],
    				[
    					-79.4307975,
    					43.638241
    				],
    				[
    					-79.4303167,
    					43.6383364
    				],
    				[
    					-79.4301509,
    					43.6383698
    				],
    				[
    					-79.4299972,
    					43.6384016
    				],
    				[
    					-79.4295295,
    					43.6384957
    				],
    				[
    					-79.4291068,
    					43.6385823
    				],
    				[
    					-79.4288341,
    					43.6386374
    				],
    				[
    					-79.4284156,
    					43.6387209
    				],
    				[
    					-79.4280772,
    					43.6387892
    				],
    				[
    					-79.4274647,
    					43.6389174
    				],
    				[
    					-79.4274564,
    					43.6389192
    				],
    				[
    					-79.4273712,
    					43.6389379
    				],
    				[
    					-79.4273517,
    					43.6389421
    				]
    			]
    		},
    		id: "way/4045499"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4045501",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4273517,
    					43.6389421
    				],
    				[
    					-79.4273353,
    					43.638946
    				],
    				[
    					-79.4272512,
    					43.6389656
    				],
    				[
    					-79.4272325,
    					43.63897
    				],
    				[
    					-79.4263022,
    					43.6391614
    				],
    				[
    					-79.4260299,
    					43.6392151
    				],
    				[
    					-79.4248166,
    					43.6394586
    				]
    			]
    		},
    		id: "way/4045501"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4045502",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4409437,
    					43.6502495
    				],
    				[
    					-79.440937,
    					43.6502644
    				],
    				[
    					-79.4409113,
    					43.6503203
    				],
    				[
    					-79.4408875,
    					43.6503582
    				],
    				[
    					-79.4408648,
    					43.6503748
    				],
    				[
    					-79.4408409,
    					43.6503923
    				],
    				[
    					-79.4407866,
    					43.650431
    				],
    				[
    					-79.4404292,
    					43.650683
    				],
    				[
    					-79.4402314,
    					43.6508268
    				],
    				[
    					-79.4401869,
    					43.6508578
    				],
    				[
    					-79.4401001,
    					43.65092
    				],
    				[
    					-79.4400175,
    					43.6509768
    				]
    			]
    		},
    		id: "way/4045502"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4078846",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4123696,
    					43.6681293
    				],
    				[
    					-79.4123448,
    					43.6680406
    				],
    				[
    					-79.4119293,
    					43.6669765
    				],
    				[
    					-79.411856,
    					43.6667912
    				]
    			]
    		},
    		id: "way/4078846"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4078847",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Bathurst Street",
    			note: "January 2020: Right lane only straight, middle lane streetcar only, left lane turn left",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3998491,
    					43.6369174
    				],
    				[
    					-79.399838,
    					43.6368665
    				],
    				[
    					-79.3998147,
    					43.6367593
    				],
    				[
    					-79.3998069,
    					43.6367265
    				],
    				[
    					-79.3998042,
    					43.6367153
    				],
    				[
    					-79.3997923,
    					43.6366683
    				]
    			]
    		},
    		id: "way/4078847"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4078848",
    			foot: "no",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Bathurst Street",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3995215,
    					43.6365184
    				],
    				[
    					-79.3996615,
    					43.6366958
    				]
    			]
    		},
    		id: "way/4078848"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4165491",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4286129,
    					43.6422201
    				],
    				[
    					-79.4286087,
    					43.6422057
    				],
    				[
    					-79.4285925,
    					43.6421514
    				],
    				[
    					-79.4285881,
    					43.6421364
    				],
    				[
    					-79.4284622,
    					43.641819
    				],
    				[
    					-79.4283586,
    					43.641554
    				],
    				[
    					-79.4279804,
    					43.640571
    				],
    				[
    					-79.4279665,
    					43.6405355
    				],
    				[
    					-79.4279395,
    					43.6404685
    				],
    				[
    					-79.4279076,
    					43.6403886
    				],
    				[
    					-79.4275476,
    					43.6394533
    				],
    				[
    					-79.4274844,
    					43.6392841
    				],
    				[
    					-79.427386,
    					43.6390291
    				],
    				[
    					-79.4273838,
    					43.6390235
    				],
    				[
    					-79.4273802,
    					43.6390144
    				],
    				[
    					-79.4273571,
    					43.6389559
    				],
    				[
    					-79.4273517,
    					43.6389421
    				]
    			]
    		},
    		id: "way/4165491"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4167752",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Front Street West",
    			sidewalk: "left",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4014083,
    					43.6407423
    				],
    				[
    					-79.4013922,
    					43.6407459
    				],
    				[
    					-79.401276,
    					43.6407716
    				],
    				[
    					-79.4009361,
    					43.6408634
    				],
    				[
    					-79.3998577,
    					43.6411455
    				],
    				[
    					-79.3989189,
    					43.641391
    				],
    				[
    					-79.398817,
    					43.6414166
    				],
    				[
    					-79.3980274,
    					43.6416255
    				],
    				[
    					-79.3975549,
    					43.6417541
    				],
    				[
    					-79.396301,
    					43.6420947
    				],
    				[
    					-79.3958383,
    					43.642225
    				],
    				[
    					-79.3949532,
    					43.642458
    				],
    				[
    					-79.3945826,
    					43.6425536
    				]
    			]
    		},
    		id: "way/4167752"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4168456",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4522887,
    					43.6384761
    				],
    				[
    					-79.4527189,
    					43.6384567
    				],
    				[
    					-79.4530448,
    					43.6384361
    				],
    				[
    					-79.4533299,
    					43.6384043
    				],
    				[
    					-79.4533942,
    					43.6383953
    				],
    				[
    					-79.4535292,
    					43.6383781
    				]
    			]
    		},
    		id: "way/4168456"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4212253",
    			bicycle: "yes",
    			cycleway: "lane",
    			foot: "yes",
    			highway: "secondary",
    			horse: "yes",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bay Street",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3907028,
    					43.6725823
    				],
    				[
    					-79.3907144,
    					43.6727153
    				],
    				[
    					-79.3907344,
    					43.6727982
    				],
    				[
    					-79.390734,
    					43.672898
    				],
    				[
    					-79.3907208,
    					43.6729517
    				],
    				[
    					-79.3907139,
    					43.6729801
    				],
    				[
    					-79.3906718,
    					43.6730501
    				]
    			]
    		},
    		id: "way/4212253"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4212259",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4006029,
    					43.6603115
    				],
    				[
    					-79.4006653,
    					43.6603293
    				],
    				[
    					-79.4007315,
    					43.6603523
    				],
    				[
    					-79.4007816,
    					43.6603787
    				],
    				[
    					-79.4008338,
    					43.6604123
    				],
    				[
    					-79.400878,
    					43.6604409
    				],
    				[
    					-79.4009107,
    					43.6604734
    				],
    				[
    					-79.4009366,
    					43.6604983
    				],
    				[
    					-79.4009692,
    					43.6605512
    				],
    				[
    					-79.4010197,
    					43.6606508
    				],
    				[
    					-79.401261,
    					43.6612369
    				],
    				[
    					-79.4012896,
    					43.6613168
    				]
    			]
    		},
    		id: "way/4212259"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4215365",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4007256,
    					43.659066
    				],
    				[
    					-79.4006704,
    					43.6590374
    				],
    				[
    					-79.4006102,
    					43.6590028
    				],
    				[
    					-79.4005767,
    					43.6589766
    				],
    				[
    					-79.4005557,
    					43.6589516
    				],
    				[
    					-79.4005191,
    					43.6588935
    				],
    				[
    					-79.4004825,
    					43.6587803
    				],
    				[
    					-79.4003665,
    					43.6584913
    				]
    			]
    		},
    		id: "way/4215365"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4268290",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes:backward": "none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4025483,
    					43.6758108
    				],
    				[
    					-79.4024432,
    					43.6757452
    				],
    				[
    					-79.4018217,
    					43.6753168
    				]
    			]
    		},
    		id: "way/4268290"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4275440",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4281541,
    					43.6614375
    				],
    				[
    					-79.4292859,
    					43.6611895
    				],
    				[
    					-79.4293963,
    					43.6611664
    				]
    			]
    		},
    		id: "way/4275440"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4651746",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3979465,
    					43.6529596
    				],
    				[
    					-79.3979264,
    					43.6529637
    				],
    				[
    					-79.3978272,
    					43.6529888
    				],
    				[
    					-79.3974255,
    					43.6530745
    				],
    				[
    					-79.3972497,
    					43.6531136
    				],
    				[
    					-79.3970285,
    					43.6531611
    				]
    			]
    		},
    		id: "way/4651746"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4663340",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4035688,
    					43.6662862
    				],
    				[
    					-79.4035377,
    					43.6661613
    				],
    				[
    					-79.4033218,
    					43.6657879
    				],
    				[
    					-79.4032877,
    					43.6657195
    				],
    				[
    					-79.4031372,
    					43.6654177
    				],
    				[
    					-79.4030788,
    					43.6652679
    				],
    				[
    					-79.4028533,
    					43.6647044
    				],
    				[
    					-79.402823,
    					43.664628
    				]
    			]
    		},
    		id: "way/4663340"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4674599",
    			"cycleway:right": "track",
    			highway: "secondary",
    			lanes: "3",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Adelaide Street West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4031968,
    					43.64519
    				],
    				[
    					-79.4031799,
    					43.6451934
    				],
    				[
    					-79.4030564,
    					43.6452184
    				],
    				[
    					-79.4026693,
    					43.6452982
    				],
    				[
    					-79.4017826,
    					43.645481
    				],
    				[
    					-79.4007075,
    					43.6456978
    				],
    				[
    					-79.4005862,
    					43.6457216
    				],
    				[
    					-79.4005026,
    					43.6457376
    				],
    				[
    					-79.4000895,
    					43.6458185
    				],
    				[
    					-79.3995818,
    					43.6459342
    				],
    				[
    					-79.398994,
    					43.6460561
    				],
    				[
    					-79.3982031,
    					43.6462158
    				],
    				[
    					-79.3981323,
    					43.6462299
    				],
    				[
    					-79.3980623,
    					43.6462431
    				],
    				[
    					-79.3975846,
    					43.6463387
    				],
    				[
    					-79.3968962,
    					43.6464789
    				],
    				[
    					-79.3965162,
    					43.6465566
    				],
    				[
    					-79.3963593,
    					43.6465888
    				],
    				[
    					-79.3961686,
    					43.6466278
    				],
    				[
    					-79.3957608,
    					43.6467107
    				],
    				[
    					-79.3956542,
    					43.6467324
    				]
    			]
    		},
    		id: "way/4674599"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4674981",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4378554,
    					43.6658505
    				],
    				[
    					-79.4377706,
    					43.6655627
    				],
    				[
    					-79.43759,
    					43.6651334
    				],
    				[
    					-79.4374012,
    					43.6647024
    				],
    				[
    					-79.4370086,
    					43.6638378
    				]
    			]
    		},
    		id: "way/4674981"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5084862",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.39626,
    					43.6487741
    				],
    				[
    					-79.3962614,
    					43.6487776
    				],
    				[
    					-79.3962653,
    					43.6487868
    				],
    				[
    					-79.3962761,
    					43.6488126
    				],
    				[
    					-79.3963035,
    					43.6488784
    				],
    				[
    					-79.3965426,
    					43.6494515
    				]
    			]
    		},
    		id: "way/5084862"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5213383",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Queen's Park",
    			old_ref: "11A",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3931594,
    					43.6663676
    				],
    				[
    					-79.3931489,
    					43.6663109
    				],
    				[
    					-79.3931403,
    					43.6662448
    				],
    				[
    					-79.3931416,
    					43.6662156
    				],
    				[
    					-79.3931461,
    					43.6661878
    				],
    				[
    					-79.3931575,
    					43.6661198
    				],
    				[
    					-79.3931795,
    					43.6660522
    				],
    				[
    					-79.3932025,
    					43.666014
    				],
    				[
    					-79.3932661,
    					43.6659397
    				],
    				[
    					-79.3933295,
    					43.6658771
    				]
    			]
    		},
    		id: "way/5213383"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5213459",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3931594,
    					43.6663676
    				],
    				[
    					-79.393179,
    					43.6664063
    				],
    				[
    					-79.3932913,
    					43.666671
    				],
    				[
    					-79.3935234,
    					43.6672491
    				]
    			]
    		},
    		id: "way/5213459"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5686834",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3998273,
    					43.6525461
    				],
    				[
    					-79.3991923,
    					43.6526812
    				],
    				[
    					-79.3989482,
    					43.6527322
    				],
    				[
    					-79.3987078,
    					43.652785
    				],
    				[
    					-79.3982389,
    					43.652888
    				],
    				[
    					-79.3981501,
    					43.6529094
    				],
    				[
    					-79.3981331,
    					43.6529133
    				]
    			]
    		},
    		id: "way/5686834"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5686838",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4039923,
    					43.6472051
    				],
    				[
    					-79.4039753,
    					43.6472084
    				],
    				[
    					-79.4038521,
    					43.6472329
    				],
    				[
    					-79.4035424,
    					43.6472959
    				],
    				[
    					-79.4019962,
    					43.6476107
    				]
    			]
    		},
    		id: "way/5686838"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5686849",
    			"cycleway:left": "lane",
    			"embedded_rails:lanes": "|tram|tram",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4001546,
    					43.6579539
    				],
    				[
    					-79.4001038,
    					43.6579513
    				],
    				[
    					-79.4000578,
    					43.6579475
    				],
    				[
    					-79.4000157,
    					43.6579424
    				],
    				[
    					-79.399956,
    					43.6579332
    				],
    				[
    					-79.3999165,
    					43.6579316
    				]
    			]
    		},
    		id: "way/5686849"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5686851",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.396467,
    					43.6487299
    				],
    				[
    					-79.3964628,
    					43.6487169
    				],
    				[
    					-79.3964514,
    					43.648682
    				],
    				[
    					-79.3964408,
    					43.6486493
    				],
    				[
    					-79.396332,
    					43.6483529
    				],
    				[
    					-79.3961734,
    					43.6479918
    				],
    				[
    					-79.3961529,
    					43.6479451
    				],
    				[
    					-79.3961085,
    					43.6478428
    				]
    			]
    		},
    		id: "way/5686851"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5686852",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.396467,
    					43.6487299
    				],
    				[
    					-79.3963914,
    					43.648745
    				],
    				[
    					-79.3963529,
    					43.6487529
    				],
    				[
    					-79.3962698,
    					43.6487719
    				],
    				[
    					-79.39626,
    					43.6487741
    				]
    			]
    		},
    		id: "way/5686852"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5686884",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "University Avenue",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3896244,
    					43.6575265
    				],
    				[
    					-79.3895972,
    					43.6574678
    				],
    				[
    					-79.3891461,
    					43.6564008
    				],
    				[
    					-79.3891028,
    					43.6563019
    				]
    			]
    		},
    		id: "way/5686884"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8111503",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4143281,
    					43.6731379
    				],
    				[
    					-79.4143543,
    					43.6732021
    				],
    				[
    					-79.4143896,
    					43.6732914
    				],
    				[
    					-79.4145997,
    					43.6738233
    				]
    			]
    		},
    		id: "way/8111503"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8111504",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxheight: "3.9",
    			maxspeed: "50",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4145997,
    					43.6738233
    				],
    				[
    					-79.4146538,
    					43.6739789
    				]
    			]
    		},
    		id: "way/8111504"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8117215",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4430846,
    					43.6780214
    				],
    				[
    					-79.4432304,
    					43.6779947
    				],
    				[
    					-79.4436987,
    					43.6778978
    				],
    				[
    					-79.4440228,
    					43.6778061
    				],
    				[
    					-79.4448097,
    					43.6776262
    				],
    				[
    					-79.4451162,
    					43.6775673
    				]
    			]
    		},
    		id: "way/8117215"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8119650",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3906718,
    					43.6730501
    				],
    				[
    					-79.3906035,
    					43.673021
    				],
    				[
    					-79.3905558,
    					43.6730039
    				],
    				[
    					-79.3903355,
    					43.6729753
    				],
    				[
    					-79.3901601,
    					43.6729915
    				]
    			]
    		},
    		id: "way/8119650"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/9406751",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4430419,
    					43.6778786
    				],
    				[
    					-79.4429051,
    					43.6779039
    				],
    				[
    					-79.4424632,
    					43.6779976
    				],
    				[
    					-79.4422077,
    					43.6780703
    				],
    				[
    					-79.4419863,
    					43.6781185
    				]
    			]
    		},
    		id: "way/9406751"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/9454803",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Parkside Drive",
    			sidewalk: "left",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4576326,
    					43.6482886
    				],
    				[
    					-79.4573013,
    					43.6474767
    				],
    				[
    					-79.4569578,
    					43.6466405
    				],
    				[
    					-79.4566203,
    					43.645817
    				],
    				[
    					-79.4562687,
    					43.6449613
    				],
    				[
    					-79.4562351,
    					43.6448825
    				],
    				[
    					-79.4562091,
    					43.6448124
    				],
    				[
    					-79.4558814,
    					43.6440141
    				],
    				[
    					-79.4555326,
    					43.6431695
    				],
    				[
    					-79.4551057,
    					43.6421361
    				],
    				[
    					-79.454823,
    					43.6414564
    				]
    			]
    		},
    		id: "way/9454803"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/9454807",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "50",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4460871,
    					43.6387464
    				],
    				[
    					-79.4461035,
    					43.6387458
    				],
    				[
    					-79.4461855,
    					43.6387433
    				],
    				[
    					-79.4462008,
    					43.6387429
    				],
    				[
    					-79.4462142,
    					43.6387425
    				],
    				[
    					-79.446291,
    					43.6387349
    				],
    				[
    					-79.446665,
    					43.6386694
    				],
    				[
    					-79.4467722,
    					43.6386549
    				],
    				[
    					-79.4468377,
    					43.6386471
    				],
    				[
    					-79.4468512,
    					43.6386467
    				],
    				[
    					-79.4470182,
    					43.6386416
    				],
    				[
    					-79.4471676,
    					43.6386346
    				],
    				[
    					-79.4472282,
    					43.6386383
    				],
    				[
    					-79.4473399,
    					43.6386491
    				],
    				[
    					-79.4478917,
    					43.6387464
    				],
    				[
    					-79.4484034,
    					43.6388421
    				],
    				[
    					-79.448426,
    					43.6388468
    				],
    				[
    					-79.4495508,
    					43.6390596
    				],
    				[
    					-79.4496683,
    					43.639081
    				],
    				[
    					-79.4509309,
    					43.639325
    				],
    				[
    					-79.4511703,
    					43.6393819
    				],
    				[
    					-79.4513172,
    					43.6394305
    				]
    			]
    		},
    		id: "way/9454807"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/9454813",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "1",
    			name: "Parkside Drive",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4537163,
    					43.6387463
    				],
    				[
    					-79.4536675,
    					43.6386768
    				],
    				[
    					-79.4535782,
    					43.638461
    				],
    				[
    					-79.4535638,
    					43.6384334
    				],
    				[
    					-79.4535292,
    					43.6383781
    				]
    			]
    		},
    		id: "way/9454813"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/9454818",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4518323,
    					43.6539455
    				],
    				[
    					-79.4518043,
    					43.6539113
    				],
    				[
    					-79.4517404,
    					43.6538333
    				],
    				[
    					-79.4517095,
    					43.6538041
    				],
    				[
    					-79.4516651,
    					43.6537687
    				],
    				[
    					-79.4516263,
    					43.6537425
    				],
    				[
    					-79.4515925,
    					43.6537213
    				],
    				[
    					-79.4514607,
    					43.6536576
    				],
    				[
    					-79.4511539,
    					43.6535186
    				],
    				[
    					-79.4507895,
    					43.6533534
    				],
    				[
    					-79.4501146,
    					43.6530469
    				]
    			]
    		},
    		id: "way/9454818"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/9454826",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4506001,
    					43.6763519
    				],
    				[
    					-79.4505762,
    					43.6762955
    				],
    				[
    					-79.4505633,
    					43.6762684
    				],
    				[
    					-79.4505399,
    					43.6762155
    				]
    			]
    		},
    		id: "way/9454826"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/10075414",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4077058,
    					43.6564736
    				],
    				[
    					-79.4076884,
    					43.6564772
    				],
    				[
    					-79.4076127,
    					43.6564926
    				],
    				[
    					-79.407597,
    					43.6564958
    				],
    				[
    					-79.4075905,
    					43.6564971
    				],
    				[
    					-79.4067477,
    					43.6566569
    				],
    				[
    					-79.4064783,
    					43.6567112
    				]
    			]
    		},
    		id: "way/10075414"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15706353",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "2",
    			maxspeed: "40",
    			name: "Jameson Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4371229,
    					43.6400978
    				],
    				[
    					-79.4369452,
    					43.6395983
    				],
    				[
    					-79.4367382,
    					43.6390631
    				],
    				[
    					-79.4366046,
    					43.6387176
    				],
    				[
    					-79.4360289,
    					43.6372454
    				],
    				[
    					-79.4360088,
    					43.6371851
    				],
    				[
    					-79.4360046,
    					43.6371724
    				]
    			]
    		},
    		id: "way/15706353"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15706360",
    			foot: "no",
    			highway: "secondary",
    			lanes: "1",
    			name: "Jameson Avenue",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4342822,
    					43.6324853
    				],
    				[
    					-79.4342617,
    					43.6323963
    				],
    				[
    					-79.4342209,
    					43.6323464
    				],
    				[
    					-79.434177,
    					43.6322993
    				],
    				[
    					-79.4341027,
    					43.6322374
    				],
    				[
    					-79.4340173,
    					43.6321792
    				],
    				[
    					-79.433925,
    					43.6321336
    				],
    				[
    					-79.4338329,
    					43.6321019
    				],
    				[
    					-79.433323,
    					43.6319303
    				]
    			]
    		},
    		id: "way/15706360"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15706361",
    			bridge: "yes",
    			"cycleway:right": "lane",
    			highway: "secondary",
    			lanes: "3",
    			layer: "1",
    			name: "Jameson Avenue",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4344748,
    					43.6330982
    				],
    				[
    					-79.434347,
    					43.632768
    				],
    				[
    					-79.4343183,
    					43.632694
    				]
    			]
    		},
    		id: "way/15706361"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15706363",
    			highway: "secondary",
    			lanes: "2",
    			name: "Jameson Avenue",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4343183,
    					43.632694
    				],
    				[
    					-79.4343045,
    					43.6326291
    				],
    				[
    					-79.4342928,
    					43.6325548
    				],
    				[
    					-79.4342822,
    					43.6324853
    				]
    			]
    		},
    		id: "way/15706363"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15706364",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4314453,
    					43.6327369
    				],
    				[
    					-79.4316297,
    					43.6328152
    				],
    				[
    					-79.4318004,
    					43.6328739
    				],
    				[
    					-79.4320115,
    					43.6329263
    				],
    				[
    					-79.432431,
    					43.6330253
    				]
    			]
    		},
    		id: "way/15706364"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15803826",
    			cycleway: "lane",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4462727,
    					43.6662634
    				],
    				[
    					-79.4460823,
    					43.6657683
    				],
    				[
    					-79.4459147,
    					43.6653432
    				],
    				[
    					-79.4458677,
    					43.6652497
    				],
    				[
    					-79.4457517,
    					43.6649671
    				],
    				[
    					-79.4457231,
    					43.6648934
    				]
    			]
    		},
    		id: "way/15803826"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15803828",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxheight: "4.2",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4488478,
    					43.6662348
    				],
    				[
    					-79.4484615,
    					43.6663163
    				]
    			]
    		},
    		id: "way/15803828"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15803829",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "1",
    			"lanes:forward": "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4473636,
    					43.6665421
    				],
    				[
    					-79.447077,
    					43.6666039
    				],
    				[
    					-79.4465604,
    					43.6667126
    				],
    				[
    					-79.4464511,
    					43.6667349
    				]
    			]
    		},
    		id: "way/15803829"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15818587",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4292064,
    					43.6437934
    				],
    				[
    					-79.4290789,
    					43.6434702
    				],
    				[
    					-79.4288799,
    					43.6429677
    				],
    				[
    					-79.4286368,
    					43.6422908
    				],
    				[
    					-79.4286174,
    					43.6422334
    				],
    				[
    					-79.4286129,
    					43.6422201
    				]
    			]
    		},
    		id: "way/15818587"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/19881684",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4452661,
    					43.6511961
    				],
    				[
    					-79.4450709,
    					43.6511436
    				],
    				[
    					-79.4446331,
    					43.6510401
    				]
    			]
    		},
    		id: "way/19881684"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/19881685",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4434484,
    					43.6507662
    				],
    				[
    					-79.4432223,
    					43.6507125
    				],
    				[
    					-79.4431669,
    					43.6506994
    				]
    			]
    		},
    		id: "way/19881685"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/19881828",
    			bicycle: "no",
    			foot: "no",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "50",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "merge_to_right|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3929094,
    					43.6389525
    				],
    				[
    					-79.3936635,
    					43.6388308
    				]
    			]
    		},
    		id: "way/19881828"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/19881829",
    			bicycle: "no",
    			bridge: "yes",
    			foot: "no",
    			highway: "secondary",
    			lanes: "3",
    			layer: "2",
    			maxspeed: "50",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3908714,
    					43.6392923
    				],
    				[
    					-79.392054,
    					43.639088
    				]
    			]
    		},
    		id: "way/19881829"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21669971",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3926776,
    					43.6400385
    				],
    				[
    					-79.3927071,
    					43.6401393
    				],
    				[
    					-79.3928619,
    					43.6405667
    				]
    			]
    		},
    		id: "way/21669971"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21670009",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			offpeaklanes: "2",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3937545,
    					43.642765
    				],
    				[
    					-79.3938149,
    					43.642895
    				],
    				[
    					-79.3939332,
    					43.6431701
    				],
    				[
    					-79.3939805,
    					43.6432803
    				],
    				[
    					-79.3941093,
    					43.6435148
    				],
    				[
    					-79.3941573,
    					43.6436081
    				],
    				[
    					-79.3943297,
    					43.6440379
    				],
    				[
    					-79.3944439,
    					43.6443133
    				],
    				[
    					-79.3944932,
    					43.6444427
    				],
    				[
    					-79.3945424,
    					43.6445693
    				],
    				[
    					-79.3946079,
    					43.6447378
    				],
    				[
    					-79.3946473,
    					43.6448391
    				]
    			]
    		},
    		id: "way/21670009"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21670040",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3940177,
    					43.6427059
    				],
    				[
    					-79.3938782,
    					43.6424053
    				]
    			]
    		},
    		id: "way/21670040"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21670319",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			offpeaklanes: "2",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3950924,
    					43.6453605
    				],
    				[
    					-79.3950096,
    					43.6451772
    				],
    				[
    					-79.3949386,
    					43.6450133
    				],
    				[
    					-79.3949008,
    					43.6449209
    				],
    				[
    					-79.3946359,
    					43.6442726
    				],
    				[
    					-79.39454,
    					43.6440244
    				],
    				[
    					-79.3944158,
    					43.6437048
    				],
    				[
    					-79.3943465,
    					43.6435091
    				],
    				[
    					-79.3942499,
    					43.643216
    				],
    				[
    					-79.3940811,
    					43.6428384
    				],
    				[
    					-79.3940177,
    					43.6427059
    				]
    			]
    		},
    		id: "way/21670319"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21671710",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Spadina Road",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4070608,
    					43.6748668
    				],
    				[
    					-79.4070226,
    					43.6747764
    				],
    				[
    					-79.4069166,
    					43.674503
    				],
    				[
    					-79.4063991,
    					43.6731765
    				],
    				[
    					-79.4060387,
    					43.6722406
    				],
    				[
    					-79.4060065,
    					43.6721868
    				]
    			]
    		},
    		id: "way/21671710"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21672485",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4290119,
    					43.6700603
    				],
    				[
    					-79.4289328,
    					43.6700572
    				],
    				[
    					-79.4288554,
    					43.6700619
    				],
    				[
    					-79.4284285,
    					43.6701596
    				],
    				[
    					-79.4279002,
    					43.6702556
    				],
    				[
    					-79.4276436,
    					43.6703138
    				],
    				[
    					-79.4267045,
    					43.6705268
    				],
    				[
    					-79.4265696,
    					43.6705574
    				],
    				[
    					-79.4264632,
    					43.670581
    				],
    				[
    					-79.425967,
    					43.670691
    				],
    				[
    					-79.4242271,
    					43.6710768
    				],
    				[
    					-79.4224393,
    					43.6714322
    				],
    				[
    					-79.4220726,
    					43.6715051
    				],
    				[
    					-79.4216591,
    					43.671602
    				],
    				[
    					-79.4215307,
    					43.671625
    				]
    			]
    		},
    		id: "way/21672485"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21672702",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4500343,
    					43.6659885
    				],
    				[
    					-79.4488478,
    					43.6662348
    				]
    			]
    		},
    		id: "way/21672702"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21673142",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4554904,
    					43.6648555
    				],
    				[
    					-79.454127,
    					43.6651196
    				],
    				[
    					-79.4524731,
    					43.6654818
    				],
    				[
    					-79.4524211,
    					43.6654935
    				],
    				[
    					-79.4518152,
    					43.6656212
    				],
    				[
    					-79.4513293,
    					43.665718
    				],
    				[
    					-79.4512202,
    					43.6657391
    				],
    				[
    					-79.4511068,
    					43.6657622
    				],
    				[
    					-79.4506403,
    					43.6658703
    				],
    				[
    					-79.4500343,
    					43.6659885
    				]
    			]
    		},
    		id: "way/21673142"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21673183",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4587943,
    					43.6644482
    				],
    				[
    					-79.4587047,
    					43.6644714
    				],
    				[
    					-79.4586138,
    					43.664491
    				],
    				[
    					-79.4585228,
    					43.6645002
    				]
    			]
    		},
    		id: "way/21673183"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21674620",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park Crescent East",
    			old_ref: "11A",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3904803,
    					43.6608186
    				],
    				[
    					-79.3902983,
    					43.6609886
    				],
    				[
    					-79.3902079,
    					43.6610844
    				],
    				[
    					-79.3901402,
    					43.661165
    				],
    				[
    					-79.3900858,
    					43.6612393
    				],
    				[
    					-79.3900356,
    					43.661318
    				],
    				[
    					-79.3899856,
    					43.6614073
    				],
    				[
    					-79.389942,
    					43.6614983
    				],
    				[
    					-79.3899166,
    					43.6615629
    				],
    				[
    					-79.389896,
    					43.6616426
    				],
    				[
    					-79.3898782,
    					43.6617827
    				],
    				[
    					-79.3899148,
    					43.6619368
    				],
    				[
    					-79.3899574,
    					43.6620408
    				],
    				[
    					-79.3900409,
    					43.6622376
    				],
    				[
    					-79.3905817,
    					43.6635129
    				],
    				[
    					-79.3905921,
    					43.6635385
    				],
    				[
    					-79.3906208,
    					43.6636102
    				]
    			]
    		},
    		id: "way/21674620"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/21675239",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Queen's Park Crescent West",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3936224,
    					43.6642139
    				],
    				[
    					-79.3935068,
    					43.6639071
    				],
    				[
    					-79.3934766,
    					43.6638317
    				],
    				[
    					-79.3932391,
    					43.6632705
    				]
    			]
    		},
    		id: "way/21675239"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22241344",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Queen's Park Crescent West",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3928644,
    					43.6624313
    				],
    				[
    					-79.3926178,
    					43.6621106
    				],
    				[
    					-79.3924788,
    					43.66192
    				],
    				[
    					-79.3924469,
    					43.661867
    				],
    				[
    					-79.3922058,
    					43.6613928
    				]
    			]
    		},
    		id: "way/22241344"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22689198",
    			bridge: "yes",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			layer: "1",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4422876,
    					43.6505029
    				],
    				[
    					-79.4419358,
    					43.6504192
    				]
    			]
    		},
    		id: "way/22689198"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22689199",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4419358,
    					43.6504192
    				],
    				[
    					-79.4416538,
    					43.6503511
    				],
    				[
    					-79.441406,
    					43.6502987
    				],
    				[
    					-79.4411992,
    					43.6502701
    				],
    				[
    					-79.4411052,
    					43.6502619
    				],
    				[
    					-79.441049,
    					43.650257
    				],
    				[
    					-79.4409437,
    					43.6502495
    				]
    			]
    		},
    		id: "way/22689199"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22689354",
    			bridge: "yes",
    			built_date: "1989",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			layer: "1",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3938782,
    					43.6424053
    				],
    				[
    					-79.3935161,
    					43.6414403
    				]
    			]
    		},
    		id: "way/22689354"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22689355",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3935161,
    					43.6414403
    				],
    				[
    					-79.3934917,
    					43.6413757
    				],
    				[
    					-79.3931943,
    					43.6406747
    				],
    				[
    					-79.3931688,
    					43.6406155
    				]
    			]
    		},
    		id: "way/22689355"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22689358",
    			bridge: "yes",
    			built_date: "1989",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "4",
    			layer: "1",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3932076,
    					43.6415021
    				],
    				[
    					-79.3936286,
    					43.6424691
    				]
    			]
    		},
    		id: "way/22689358"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22689359",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3936286,
    					43.6424691
    				],
    				[
    					-79.3937545,
    					43.642765
    				]
    			]
    		},
    		id: "way/22689359"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22738842",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.401496,
    					43.6612762
    				],
    				[
    					-79.4014633,
    					43.6611997
    				],
    				[
    					-79.401163,
    					43.6604392
    				],
    				[
    					-79.4011531,
    					43.6604089
    				],
    				[
    					-79.4011463,
    					43.6603722
    				],
    				[
    					-79.4011512,
    					43.6603224
    				],
    				[
    					-79.4011646,
    					43.6602773
    				],
    				[
    					-79.401216,
    					43.6602073
    				]
    			]
    		},
    		id: "way/22738842"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22738843",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4012896,
    					43.6613168
    				],
    				[
    					-79.4013183,
    					43.6613889
    				],
    				[
    					-79.4016494,
    					43.6622265
    				],
    				[
    					-79.4017726,
    					43.6625341
    				]
    			]
    		},
    		id: "way/22738843"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22758492",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Queen's Park Crescent West",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3939085,
    					43.6650441
    				],
    				[
    					-79.3938967,
    					43.6649568
    				],
    				[
    					-79.3938762,
    					43.6648891
    				],
    				[
    					-79.39385,
    					43.6647979
    				],
    				[
    					-79.3937955,
    					43.6646726
    				],
    				[
    					-79.3936861,
    					43.6643875
    				],
    				[
    					-79.3936224,
    					43.6642139
    				]
    			]
    		},
    		id: "way/22758492"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22758493",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Queen's Park Crescent West",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3938825,
    					43.665247
    				],
    				[
    					-79.3939147,
    					43.6651098
    				],
    				[
    					-79.3939085,
    					43.6650441
    				]
    			]
    		},
    		id: "way/22758493"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22758494",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park Crescent East",
    			note: "Left lane Queen's Park Southbound/Hoskin Ave",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3906208,
    					43.6636102
    				],
    				[
    					-79.3906598,
    					43.6637009
    				],
    				[
    					-79.390691,
    					43.6637744
    				],
    				[
    					-79.390788,
    					43.6640058
    				],
    				[
    					-79.3910359,
    					43.6646059
    				],
    				[
    					-79.3911101,
    					43.6647911
    				],
    				[
    					-79.3911404,
    					43.6648629
    				]
    			]
    		},
    		id: "way/22758494"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22758495",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Ossington Avenue",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4207551,
    					43.6493335
    				],
    				[
    					-79.4207544,
    					43.6493205
    				],
    				[
    					-79.4207508,
    					43.6492546
    				],
    				[
    					-79.4206864,
    					43.6490949
    				],
    				[
    					-79.420594,
    					43.6488689
    				],
    				[
    					-79.4203668,
    					43.6483211
    				],
    				[
    					-79.4203503,
    					43.6482839
    				],
    				[
    					-79.4201588,
    					43.6478227
    				],
    				[
    					-79.4200464,
    					43.6475286
    				],
    				[
    					-79.4199473,
    					43.647276
    				],
    				[
    					-79.4198453,
    					43.6469962
    				],
    				[
    					-79.419819,
    					43.6469234
    				],
    				[
    					-79.4197918,
    					43.6468535
    				],
    				[
    					-79.4195187,
    					43.646073
    				],
    				[
    					-79.41936,
    					43.6456278
    				],
    				[
    					-79.4191507,
    					43.6450154
    				],
    				[
    					-79.4190609,
    					43.6447594
    				],
    				[
    					-79.4190037,
    					43.6445965
    				],
    				[
    					-79.4188831,
    					43.6442576
    				],
    				[
    					-79.4188534,
    					43.6441775
    				],
    				[
    					-79.4188487,
    					43.6441648
    				]
    			]
    		},
    		id: "way/22758495"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22795629",
    			cycleway: "lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4126146,
    					43.6554634
    				],
    				[
    					-79.4114564,
    					43.6557024
    				],
    				[
    					-79.4113804,
    					43.6557186
    				],
    				[
    					-79.411315,
    					43.6557325
    				],
    				[
    					-79.4101605,
    					43.6559657
    				],
    				[
    					-79.4089328,
    					43.6562156
    				],
    				[
    					-79.4083428,
    					43.6563355
    				]
    			]
    		},
    		id: "way/22795629"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22891215",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3903312,
    					43.6598822
    				],
    				[
    					-79.3903378,
    					43.6598952
    				],
    				[
    					-79.3903686,
    					43.6599803
    				],
    				[
    					-79.3905512,
    					43.6603454
    				]
    			]
    		},
    		id: "way/22891215"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22891216",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "University Avenue",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3905521,
    					43.6597268
    				],
    				[
    					-79.3903339,
    					43.6592086
    				],
    				[
    					-79.3901027,
    					43.6586742
    				],
    				[
    					-79.3899059,
    					43.658203
    				],
    				[
    					-79.389676,
    					43.6576469
    				],
    				[
    					-79.3896244,
    					43.6575265
    				]
    			]
    		},
    		id: "way/22891216"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22951869",
    			bridge: "yes",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			layer: "1",
    			maxspeed: "60",
    			name: "The Queensway",
    			note: "There is a concrete sidewalk on the bridge itself, but not on the bridge approaches either side.",
    			oneway: "yes",
    			sidewalk: "right",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4538852,
    					43.639819
    				],
    				[
    					-79.4542718,
    					43.6398239
    				]
    			]
    		},
    		id: "way/22951869"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22951870",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			maxspeed: "60",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4542718,
    					43.6398239
    				],
    				[
    					-79.4565491,
    					43.6398075
    				],
    				[
    					-79.4570219,
    					43.6398014
    				],
    				[
    					-79.457487,
    					43.6397881
    				],
    				[
    					-79.4579299,
    					43.6397666
    				]
    			]
    		},
    		id: "way/22951870"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22951871",
    			bridge: "yes",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			layer: "1",
    			maxspeed: "60",
    			name: "The Queensway",
    			note: "There is a concrete sidewalk on the bridge itself, but not on the bridge approaches either side.",
    			oneway: "yes",
    			sidewalk: "right",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4541661,
    					43.639624
    				],
    				[
    					-79.4538494,
    					43.6396304
    				]
    			]
    		},
    		id: "way/22951871"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22951872",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			maxspeed: "60",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4531025,
    					43.6396376
    				],
    				[
    					-79.4528241,
    					43.6396346
    				],
    				[
    					-79.4526889,
    					43.6396264
    				],
    				[
    					-79.4525307,
    					43.6396099
    				],
    				[
    					-79.4523905,
    					43.6395949
    				],
    				[
    					-79.4522397,
    					43.6395618
    				]
    			]
    		},
    		id: "way/22951872"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22952659",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3983024,
    					43.6358087
    				],
    				[
    					-79.398415,
    					43.6358713
    				],
    				[
    					-79.3984951,
    					43.6359092
    				]
    			]
    		},
    		id: "way/22952659"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23000746",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			maxspeed: "60",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4522485,
    					43.6397184
    				],
    				[
    					-79.452425,
    					43.6397687
    				],
    				[
    					-79.4526439,
    					43.6398046
    				],
    				[
    					-79.4529053,
    					43.6398247
    				],
    				[
    					-79.4538852,
    					43.639819
    				]
    			]
    		},
    		id: "way/23000746"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23000748",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "50",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4484637,
    					43.6387202
    				],
    				[
    					-79.4474022,
    					43.6385144
    				],
    				[
    					-79.4472765,
    					43.6384995
    				],
    				[
    					-79.4471854,
    					43.6384985
    				],
    				[
    					-79.4470076,
    					43.6384985
    				]
    			]
    		},
    		id: "way/23000748"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23297049",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxheight: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4286129,
    					43.6422201
    				],
    				[
    					-79.4285276,
    					43.6422363
    				],
    				[
    					-79.4284852,
    					43.6422444
    				],
    				[
    					-79.4279782,
    					43.6423512
    				]
    			]
    		},
    		id: "way/23297049"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23502714",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4007065,
    					43.6390341
    				],
    				[
    					-79.4006796,
    					43.6389699
    				],
    				[
    					-79.4006482,
    					43.6388929
    				],
    				[
    					-79.4006073,
    					43.6387911
    				],
    				[
    					-79.4005719,
    					43.6387028
    				],
    				[
    					-79.4003297,
    					43.6380984
    				],
    				[
    					-79.4001302,
    					43.6376332
    				],
    				[
    					-79.4000285,
    					43.6373594
    				]
    			]
    		},
    		id: "way/23502714"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23502722",
    			bridge: "yes",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			layer: "1",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4007065,
    					43.6390341
    				],
    				[
    					-79.4009945,
    					43.6397393
    				],
    				[
    					-79.4011346,
    					43.6400792
    				]
    			]
    		},
    		id: "way/23502722"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23612976",
    			highway: "secondary",
    			lanes: "2",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4256528,
    					43.6344964
    				],
    				[
    					-79.4256453,
    					43.6344769
    				],
    				[
    					-79.4256208,
    					43.634416
    				],
    				[
    					-79.4256108,
    					43.6343879
    				]
    			]
    		},
    		id: "way/23612976"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23661418",
    			highway: "secondary",
    			lanes: "4",
    			maxheight: "4",
    			name: "Parkside Drive",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4541675,
    					43.6398958
    				],
    				[
    					-79.4539293,
    					43.6394136
    				]
    			]
    		},
    		id: "way/23661418"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23689554",
    			"cycleway:right": "lane",
    			highway: "secondary",
    			lanes: "3",
    			name: "Jameson Avenue",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4345917,
    					43.6333744
    				],
    				[
    					-79.4345556,
    					43.6332776
    				],
    				[
    					-79.4344748,
    					43.6330982
    				]
    			]
    		},
    		id: "way/23689554"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23689555",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "3",
    			name: "Jameson Avenue",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4348041,
    					43.6339765
    				],
    				[
    					-79.4347499,
    					43.6338224
    				]
    			]
    		},
    		id: "way/23689555"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24221163",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.399819,
    					43.6743775
    				],
    				[
    					-79.3997044,
    					43.6743715
    				],
    				[
    					-79.3987928,
    					43.6743425
    				],
    				[
    					-79.3986064,
    					43.6743452
    				],
    				[
    					-79.3984242,
    					43.6743612
    				],
    				[
    					-79.3982653,
    					43.6743886
    				],
    				[
    					-79.3980756,
    					43.6744236
    				]
    			]
    		},
    		id: "way/24221163"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24222086",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "University Avenue",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3888057,
    					43.656362
    				],
    				[
    					-79.3888475,
    					43.6564584
    				],
    				[
    					-79.3889403,
    					43.656667
    				],
    				[
    					-79.3891937,
    					43.6572344
    				],
    				[
    					-79.3893177,
    					43.6575203
    				],
    				[
    					-79.3893464,
    					43.6575829
    				]
    			]
    		},
    		id: "way/24222086"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24590161",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3921328,
    					43.6385407
    				],
    				[
    					-79.3921952,
    					43.6386832
    				]
    			]
    		},
    		id: "way/24590161"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24590188",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			note: "persistent traffic congestion here due to traffic getting onto Gardiner",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "none|through;right|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3931688,
    					43.6406155
    				],
    				[
    					-79.3931251,
    					43.6405071
    				],
    				[
    					-79.3927213,
    					43.639502
    				],
    				[
    					-79.3925732,
    					43.6391006
    				],
    				[
    					-79.3925051,
    					43.6389265
    				]
    			]
    		},
    		id: "way/24590188"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24590189",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lower Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3923152,
    					43.6384636
    				],
    				[
    					-79.392292,
    					43.6384077
    				],
    				[
    					-79.3922076,
    					43.6382038
    				]
    			]
    		},
    		id: "way/24590189"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25757997",
    			bus_lanes: "7a-7p M-F (buses, taxis, bikes)",
    			cycleway: "share_busway",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			name: "Bay Street",
    			note: "\"Sharrows\" in bus lane",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3894689,
    					43.6697241
    				],
    				[
    					-79.3894243,
    					43.6696165
    				],
    				[
    					-79.389204,
    					43.6690592
    				]
    			]
    		},
    		id: "way/25757997"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/28823580",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3999165,
    					43.6579316
    				],
    				[
    					-79.3999232,
    					43.6579497
    				],
    				[
    					-79.3999433,
    					43.657997
    				],
    				[
    					-79.3999739,
    					43.6580696
    				],
    				[
    					-79.4000987,
    					43.658383
    				],
    				[
    					-79.4001408,
    					43.6584815
    				],
    				[
    					-79.4002789,
    					43.6588178
    				],
    				[
    					-79.4003084,
    					43.6588918
    				],
    				[
    					-79.4003263,
    					43.6589483
    				],
    				[
    					-79.4003309,
    					43.6589876
    				],
    				[
    					-79.4003326,
    					43.6590293
    				],
    				[
    					-79.400328,
    					43.659063
    				],
    				[
    					-79.4003199,
    					43.6590978
    				],
    				[
    					-79.4002974,
    					43.6591371
    				],
    				[
    					-79.4002292,
    					43.6591858
    				]
    			]
    		},
    		id: "way/28823580"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/28823581",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.400137,
    					43.6579033
    				],
    				[
    					-79.4001332,
    					43.6578931
    				],
    				[
    					-79.4001103,
    					43.6578315
    				],
    				[
    					-79.3996491,
    					43.6567102
    				],
    				[
    					-79.399351,
    					43.6559512
    				],
    				[
    					-79.399305,
    					43.6558351
    				],
    				[
    					-79.3992671,
    					43.6557415
    				],
    				[
    					-79.3990122,
    					43.6551124
    				],
    				[
    					-79.3987369,
    					43.6544449
    				]
    			]
    		},
    		id: "way/28823581"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/28823582",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3981331,
    					43.6529133
    				],
    				[
    					-79.3981309,
    					43.6529071
    				],
    				[
    					-79.3981287,
    					43.6529012
    				],
    				[
    					-79.3981152,
    					43.6528638
    				],
    				[
    					-79.3981003,
    					43.6528227
    				],
    				[
    					-79.3978792,
    					43.6522537
    				],
    				[
    					-79.397732,
    					43.6518803
    				]
    			]
    		},
    		id: "way/28823582"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/28823583",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3979465,
    					43.6529596
    				],
    				[
    					-79.397949,
    					43.6529662
    				],
    				[
    					-79.3979518,
    					43.6529733
    				],
    				[
    					-79.3979659,
    					43.6530098
    				],
    				[
    					-79.397987,
    					43.6530643
    				],
    				[
    					-79.398329,
    					43.6539539
    				]
    			]
    		},
    		id: "way/28823583"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30326730",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4019942,
    					43.663091
    				],
    				[
    					-79.4020253,
    					43.663165
    				],
    				[
    					-79.4023088,
    					43.6638845
    				],
    				[
    					-79.4025919,
    					43.66459
    				],
    				[
    					-79.4026208,
    					43.6646709
    				]
    			]
    		},
    		id: "way/30326730"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30326731",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4026208,
    					43.6646709
    				],
    				[
    					-79.4026505,
    					43.6647438
    				],
    				[
    					-79.402965,
    					43.6655376
    				],
    				[
    					-79.4030294,
    					43.6656884
    				],
    				[
    					-79.403112,
    					43.6658394
    				],
    				[
    					-79.403224,
    					43.6659877
    				],
    				[
    					-79.4032944,
    					43.6660671
    				],
    				[
    					-79.403435,
    					43.6662181
    				],
    				[
    					-79.4035688,
    					43.6662862
    				]
    			]
    		},
    		id: "way/30326731"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30326732",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.402823,
    					43.664628
    				],
    				[
    					-79.4027955,
    					43.6645502
    				],
    				[
    					-79.4025526,
    					43.6639305
    				]
    			]
    		},
    		id: "way/30326732"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30326734",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4022018,
    					43.6630487
    				],
    				[
    					-79.4021695,
    					43.662964
    				],
    				[
    					-79.402086,
    					43.662755
    				],
    				[
    					-79.4018657,
    					43.6622015
    				],
    				[
    					-79.4015246,
    					43.6613484
    				],
    				[
    					-79.401496,
    					43.6612762
    				]
    			]
    		},
    		id: "way/30326734"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30430773",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3894689,
    					43.6697241
    				],
    				[
    					-79.3893129,
    					43.6697574
    				],
    				[
    					-79.388631,
    					43.6698921
    				]
    			]
    		},
    		id: "way/30430773"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30674826",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4053307,
    					43.6663689
    				],
    				[
    					-79.4052142,
    					43.6663925
    				],
    				[
    					-79.4045152,
    					43.6665363
    				]
    			]
    		},
    		id: "way/30674826"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30674827",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "1",
    			"lanes:forward": "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4043276,
    					43.6665678
    				],
    				[
    					-79.4039576,
    					43.6666373
    				],
    				[
    					-79.4038017,
    					43.6666633
    				]
    			]
    		},
    		id: "way/30674827"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30679706",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3935234,
    					43.6672491
    				],
    				[
    					-79.3936052,
    					43.6674421
    				],
    				[
    					-79.3937268,
    					43.6677292
    				],
    				[
    					-79.3937666,
    					43.6678235
    				],
    				[
    					-79.3939413,
    					43.668237
    				]
    			]
    		},
    		id: "way/30679706"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30679731",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3921952,
    					43.6386832
    				],
    				[
    					-79.3924654,
    					43.6393334
    				],
    				[
    					-79.3925136,
    					43.6394687
    				]
    			]
    		},
    		id: "way/30679731"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30679732",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3921328,
    					43.6385407
    				],
    				[
    					-79.3920451,
    					43.6385711
    				],
    				[
    					-79.3909106,
    					43.6389027
    				],
    				[
    					-79.3898476,
    					43.6390822
    				],
    				[
    					-79.3884906,
    					43.6393267
    				],
    				[
    					-79.3875989,
    					43.6394167
    				]
    			]
    		},
    		id: "way/30679732"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30679733",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3923668,
    					43.6385638
    				],
    				[
    					-79.3923152,
    					43.6384636
    				]
    			]
    		},
    		id: "way/30679733"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30759212",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3987227,
    					43.6549271
    				],
    				[
    					-79.399031,
    					43.6557925
    				],
    				[
    					-79.3990645,
    					43.6558845
    				]
    			]
    		},
    		id: "way/30759212"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30759215",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3990645,
    					43.6558845
    				],
    				[
    					-79.399112,
    					43.6560051
    				],
    				[
    					-79.3991603,
    					43.6561325
    				],
    				[
    					-79.3997064,
    					43.657419
    				]
    			]
    		},
    		id: "way/30759215"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30759229",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.397732,
    					43.6518803
    				],
    				[
    					-79.3973544,
    					43.6509262
    				],
    				[
    					-79.3973205,
    					43.6508648
    				]
    			]
    		},
    		id: "way/30759229"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30759230",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3973205,
    					43.6508648
    				],
    				[
    					-79.3972944,
    					43.6508132
    				],
    				[
    					-79.3972102,
    					43.6506298
    				],
    				[
    					-79.3970467,
    					43.6502288
    				],
    				[
    					-79.3969628,
    					43.6500189
    				],
    				[
    					-79.3968449,
    					43.6497242
    				],
    				[
    					-79.3967552,
    					43.6494744
    				],
    				[
    					-79.3966891,
    					43.6493064
    				]
    			]
    		},
    		id: "way/30759230"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30759231",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3971245,
    					43.6509108
    				],
    				[
    					-79.3971458,
    					43.6509682
    				],
    				[
    					-79.3974977,
    					43.6518441
    				]
    			]
    		},
    		id: "way/30759231"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30759232",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3977085,
    					43.6523738
    				],
    				[
    					-79.3979107,
    					43.6528633
    				],
    				[
    					-79.3979415,
    					43.6529462
    				],
    				[
    					-79.3979465,
    					43.6529596
    				]
    			]
    		},
    		id: "way/30759232"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30775348",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3954439,
    					43.6467753
    				],
    				[
    					-79.3954773,
    					43.6468507
    				],
    				[
    					-79.3956427,
    					43.6472769
    				],
    				[
    					-79.3956996,
    					43.6474234
    				],
    				[
    					-79.3958107,
    					43.6476882
    				],
    				[
    					-79.3958257,
    					43.647724
    				],
    				[
    					-79.3958441,
    					43.6477655
    				],
    				[
    					-79.3958796,
    					43.6478404
    				]
    			]
    		},
    		id: "way/30775348"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30775349",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3958796,
    					43.6478404
    				],
    				[
    					-79.3959293,
    					43.6479395
    				],
    				[
    					-79.3960637,
    					43.6482548
    				]
    			]
    		},
    		id: "way/30775349"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30775350",
    			"cycleway:right": "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Richmond Street West",
    			note: "December 4, 2019: watermain construction complete except for a temporary-looking obstruction in left car lane near Maud Street. Bike lane + 2 car lanes + parking on most of left side",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3962215,
    					43.647849
    				],
    				[
    					-79.3964898,
    					43.6478722
    				],
    				[
    					-79.3966255,
    					43.6478759
    				],
    				[
    					-79.3967058,
    					43.6478668
    				],
    				[
    					-79.3977486,
    					43.6476548
    				],
    				[
    					-79.3978464,
    					43.6476351
    				],
    				[
    					-79.3985634,
    					43.6474882
    				],
    				[
    					-79.3986497,
    					43.6474703
    				],
    				[
    					-79.3987449,
    					43.6474506
    				],
    				[
    					-79.3993712,
    					43.6473246
    				],
    				[
    					-79.3998509,
    					43.6472277
    				],
    				[
    					-79.4001043,
    					43.6471745
    				],
    				[
    					-79.4005802,
    					43.647079
    				],
    				[
    					-79.4010267,
    					43.6469886
    				],
    				[
    					-79.4011086,
    					43.6469733
    				]
    			]
    		},
    		id: "way/30775350"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30775359",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3956542,
    					43.6467324
    				],
    				[
    					-79.3956274,
    					43.6466538
    				],
    				[
    					-79.3955022,
    					43.6463325
    				],
    				[
    					-79.3953681,
    					43.6459889
    				],
    				[
    					-79.3952366,
    					43.645665
    				],
    				[
    					-79.3951795,
    					43.6455379
    				],
    				[
    					-79.3951544,
    					43.6454915
    				],
    				[
    					-79.395139,
    					43.6454631
    				],
    				[
    					-79.3951312,
    					43.6454485
    				]
    			]
    		},
    		id: "way/30775359"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30775360",
    			"cycleway:right": "track",
    			highway: "secondary",
    			lanes: "3",
    			lcn: "yes",
    			maxspeed: "40",
    			name: "Adelaide Street West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3956542,
    					43.6467324
    				],
    				[
    					-79.3955555,
    					43.6467525
    				],
    				[
    					-79.395518,
    					43.6467601
    				],
    				[
    					-79.3954439,
    					43.6467753
    				]
    			]
    		},
    		id: "way/30775360"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30775361",
    			"cycleway:right": "track",
    			"embedded_rails:lanes": "||tram",
    			highway: "secondary",
    			lanes: "3",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Adelaide Street West",
    			note: "3 lanes + bike lane, was formerly 4 lanes",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3954439,
    					43.6467753
    				],
    				[
    					-79.3953229,
    					43.6467999
    				],
    				[
    					-79.3950637,
    					43.6468526
    				],
    				[
    					-79.3948331,
    					43.6469007
    				],
    				[
    					-79.3945236,
    					43.6469635
    				],
    				[
    					-79.3941058,
    					43.647051
    				],
    				[
    					-79.3935912,
    					43.6471581
    				],
    				[
    					-79.3934883,
    					43.6471787
    				],
    				[
    					-79.392938,
    					43.6472933
    				],
    				[
    					-79.39283,
    					43.6473153
    				]
    			]
    		},
    		id: "way/30775361"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30861344",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt",
    			"turn:lanes:backward": "left;through|through;right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4039923,
    					43.6472051
    				],
    				[
    					-79.4039901,
    					43.6471923
    				],
    				[
    					-79.4039792,
    					43.6471283
    				],
    				[
    					-79.403867,
    					43.6468308
    				]
    			]
    		},
    		id: "way/30861344"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/30861346",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4046215,
    					43.6488274
    				],
    				[
    					-79.4046068,
    					43.6487926
    				],
    				[
    					-79.4045717,
    					43.6487043
    				],
    				[
    					-79.4043972,
    					43.6482802
    				],
    				[
    					-79.4043726,
    					43.648215
    				],
    				[
    					-79.4043139,
    					43.648065
    				],
    				[
    					-79.4042887,
    					43.6480061
    				],
    				[
    					-79.4041541,
    					43.6476731
    				]
    			]
    		},
    		id: "way/30861346"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/32803592",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.411856,
    					43.6667912
    				],
    				[
    					-79.4118348,
    					43.6667344
    				],
    				[
    					-79.4118141,
    					43.6666824
    				],
    				[
    					-79.4117927,
    					43.6666285
    				],
    				[
    					-79.41166,
    					43.666291
    				],
    				[
    					-79.4114666,
    					43.6657949
    				],
    				[
    					-79.4114406,
    					43.6657292
    				]
    			]
    		},
    		id: "way/32803592"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/32974702",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4477375,
    					43.657304
    				],
    				[
    					-79.4478611,
    					43.6572764
    				],
    				[
    					-79.448024,
    					43.65724
    				]
    			]
    		},
    		id: "way/32974702"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33002810",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "University Avenue",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.390072,
    					43.6592652
    				],
    				[
    					-79.390294,
    					43.6597811
    				],
    				[
    					-79.3903267,
    					43.6598701
    				],
    				[
    					-79.3903312,
    					43.6598822
    				]
    			]
    		},
    		id: "way/33002810"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33002811",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3905908,
    					43.6598263
    				],
    				[
    					-79.3904809,
    					43.6598483
    				],
    				[
    					-79.3903312,
    					43.6598822
    				]
    			]
    		},
    		id: "way/33002811"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33002812",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3903312,
    					43.6598822
    				],
    				[
    					-79.3902083,
    					43.659908
    				],
    				[
    					-79.3898973,
    					43.6599769
    				],
    				[
    					-79.388699,
    					43.6602382
    				],
    				[
    					-79.3880995,
    					43.6603699
    				],
    				[
    					-79.3877981,
    					43.6604334
    				],
    				[
    					-79.3875018,
    					43.660499
    				],
    				[
    					-79.3873978,
    					43.6605206
    				]
    			]
    		},
    		id: "way/33002812"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33002813",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			"maxspeed:type": "sign",
    			name: "Queen's Park",
    			note: "Solid white lines on approach to intersection. Unclear if this prohibits turning from the u-turn ramp to southbound Queen's Park to westbound College.",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3907,
    					43.6600705
    				],
    				[
    					-79.3906287,
    					43.6599298
    				],
    				[
    					-79.390596,
    					43.6598397
    				],
    				[
    					-79.3905908,
    					43.6598263
    				]
    			]
    		},
    		id: "way/33002813"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33002814",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3905512,
    					43.6603454
    				],
    				[
    					-79.3905703,
    					43.6604159
    				],
    				[
    					-79.3905773,
    					43.6604661
    				],
    				[
    					-79.3905792,
    					43.6605191
    				],
    				[
    					-79.390577,
    					43.6605681
    				],
    				[
    					-79.3905725,
    					43.6606092
    				],
    				[
    					-79.3905614,
    					43.6606555
    				],
    				[
    					-79.390546,
    					43.6606992
    				],
    				[
    					-79.390522,
    					43.6607537
    				],
    				[
    					-79.3904803,
    					43.6608186
    				]
    			]
    		},
    		id: "way/33002814"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33820764",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.417175,
    					43.6638336
    				],
    				[
    					-79.4161184,
    					43.6640644
    				],
    				[
    					-79.4160234,
    					43.6640851
    				]
    			]
    		},
    		id: "way/33820764"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33820765",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4154098,
    					43.6642206
    				],
    				[
    					-79.4148252,
    					43.664347
    				],
    				[
    					-79.4137289,
    					43.6645883
    				],
    				[
    					-79.4136331,
    					43.6646094
    				]
    			]
    		},
    		id: "way/33820765"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33910428",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4114029,
    					43.6656383
    				],
    				[
    					-79.4113464,
    					43.665486
    				],
    				[
    					-79.4112391,
    					43.6652103
    				],
    				[
    					-79.4112064,
    					43.6651337
    				]
    			]
    		},
    		id: "way/33910428"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33910429",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4112064,
    					43.6651337
    				],
    				[
    					-79.4111787,
    					43.6650627
    				],
    				[
    					-79.4110612,
    					43.6647657
    				]
    			]
    		},
    		id: "way/33910429"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33910430",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4106812,
    					43.6638272
    				],
    				[
    					-79.4106559,
    					43.6637694
    				],
    				[
    					-79.4104122,
    					43.6631721
    				],
    				[
    					-79.410216,
    					43.6626844
    				],
    				[
    					-79.4097777,
    					43.6615977
    				],
    				[
    					-79.4097485,
    					43.6615211
    				],
    				[
    					-79.4097183,
    					43.6614475
    				],
    				[
    					-79.4090858,
    					43.6598859
    				],
    				[
    					-79.4090594,
    					43.6598205
    				]
    			]
    		},
    		id: "way/33910430"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33910431",
    			"cycleway:left": "track",
    			"cycleway:right": "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4118111,
    					43.665008
    				],
    				[
    					-79.4113204,
    					43.6651102
    				],
    				[
    					-79.4112241,
    					43.6651301
    				],
    				[
    					-79.4112064,
    					43.6651337
    				]
    			]
    		},
    		id: "way/33910431"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33910432",
    			"cycleway:left": "lane",
    			"cycleway:right": "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4105979,
    					43.6652651
    				],
    				[
    					-79.4099729,
    					43.6653879
    				],
    				[
    					-79.4093159,
    					43.665527
    				],
    				[
    					-79.408641,
    					43.6656769
    				],
    				[
    					-79.4075276,
    					43.6659094
    				],
    				[
    					-79.4074594,
    					43.6659237
    				],
    				[
    					-79.4073896,
    					43.6659348
    				],
    				[
    					-79.4066448,
    					43.6660973
    				],
    				[
    					-79.4062988,
    					43.6661648
    				],
    				[
    					-79.4060268,
    					43.6662215
    				]
    			]
    		},
    		id: "way/33910432"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/33910433",
    			"cycleway:left": "shared_lane",
    			"cycleway:right": "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4112064,
    					43.6651337
    				],
    				[
    					-79.411187,
    					43.665138
    				],
    				[
    					-79.4110904,
    					43.6651593
    				],
    				[
    					-79.4105979,
    					43.6652651
    				]
    			]
    		},
    		id: "way/33910433"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34574078",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Bathurst Street",
    			note: "January 2020: Right lane only straight, left lane turn left",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3997675,
    					43.6365844
    				],
    				[
    					-79.3997245,
    					43.636495
    				],
    				[
    					-79.3997044,
    					43.6364536
    				]
    			]
    		},
    		id: "way/34574078"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34575364",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4157589,
    					43.6766995
    				],
    				[
    					-79.4158297,
    					43.6768706
    				],
    				[
    					-79.4163506,
    					43.6783008
    				],
    				[
    					-79.416544,
    					43.6787631
    				],
    				[
    					-79.4167525,
    					43.6792355
    				],
    				[
    					-79.4169614,
    					43.6797517
    				],
    				[
    					-79.4169888,
    					43.6798084
    				]
    			]
    		},
    		id: "way/34575364"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34575371",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4173022,
    					43.6724757
    				],
    				[
    					-79.4184534,
    					43.6722415
    				],
    				[
    					-79.4185499,
    					43.6722219
    				]
    			]
    		},
    		id: "way/34575371"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34575372",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4143281,
    					43.6731379
    				],
    				[
    					-79.4142577,
    					43.673165
    				],
    				[
    					-79.4140533,
    					43.673197
    				]
    			]
    		},
    		id: "way/34575372"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34587650",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3936464,
    					43.6493281
    				],
    				[
    					-79.3935392,
    					43.6493486
    				],
    				[
    					-79.3934152,
    					43.649375
    				]
    			]
    		},
    		id: "way/34587650"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34614458",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3981331,
    					43.6529133
    				],
    				[
    					-79.398057,
    					43.652932
    				],
    				[
    					-79.3980232,
    					43.6529405
    				],
    				[
    					-79.3979465,
    					43.6529596
    				]
    			]
    		},
    		id: "way/34614458"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34614459",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.398329,
    					43.6539539
    				],
    				[
    					-79.3984904,
    					43.6543582
    				],
    				[
    					-79.3985195,
    					43.6544214
    				]
    			]
    		},
    		id: "way/34614459"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34614465",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.39626,
    					43.6487741
    				],
    				[
    					-79.3961423,
    					43.6487974
    				],
    				[
    					-79.3937955,
    					43.6492974
    				],
    				[
    					-79.3937686,
    					43.649303
    				],
    				[
    					-79.3936464,
    					43.6493281
    				]
    			]
    		},
    		id: "way/34614465"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34614466",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3965426,
    					43.6494515
    				],
    				[
    					-79.3966834,
    					43.649796
    				],
    				[
    					-79.3967969,
    					43.650081
    				],
    				[
    					-79.3969301,
    					43.650424
    				]
    			]
    		},
    		id: "way/34614466"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/34891974",
    			highway: "secondary",
    			lanes: "6",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4019222,
    					43.6358781
    				],
    				[
    					-79.4022839,
    					43.6358394
    				]
    			]
    		},
    		id: "way/34891974"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35038399",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4190035,
    					43.6305716
    				],
    				[
    					-79.4192931,
    					43.6305985
    				],
    				[
    					-79.4196028,
    					43.6305661
    				],
    				[
    					-79.4198084,
    					43.6305446
    				]
    			]
    		},
    		id: "way/35038399"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35038705",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4151468,
    					43.675152
    				],
    				[
    					-79.4152137,
    					43.6753445
    				],
    				[
    					-79.4154796,
    					43.6760733
    				],
    				[
    					-79.4155903,
    					43.6763768
    				],
    				[
    					-79.4157017,
    					43.6766243
    				],
    				[
    					-79.4157589,
    					43.6766995
    				]
    			]
    		},
    		id: "way/35038705"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35039151",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Road",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.404059,
    					43.6671905
    				],
    				[
    					-79.4041439,
    					43.6673926
    				]
    			]
    		},
    		id: "way/35039151"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35039157",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Road",
    			surface: "asphalt",
    			"turn:lanes:forward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.404059,
    					43.6671905
    				],
    				[
    					-79.403916,
    					43.6668849
    				],
    				[
    					-79.4038598,
    					43.6667642
    				],
    				[
    					-79.4038017,
    					43.6666633
    				]
    			]
    		},
    		id: "way/35039157"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35040105",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4133797,
    					43.6733314
    				],
    				[
    					-79.411829,
    					43.6736881
    				]
    			]
    		},
    		id: "way/35040105"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35040236",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			name: "Dupont Street",
    			surface: "asphalt",
    			"turn:lanes:backward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4185499,
    					43.6722219
    				],
    				[
    					-79.4191133,
    					43.6720968
    				]
    			]
    		},
    		id: "way/35040236"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35040237",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4191133,
    					43.6720968
    				],
    				[
    					-79.4197357,
    					43.6719625
    				],
    				[
    					-79.4203315,
    					43.6718621
    				],
    				[
    					-79.420938,
    					43.6717406
    				],
    				[
    					-79.4214126,
    					43.6716455
    				],
    				[
    					-79.4215307,
    					43.671625
    				]
    			]
    		},
    		id: "way/35040237"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35655532",
    			"cycleway:both": "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxheight: "3.9",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			oneway: "no",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4467366,
    					43.6674799
    				],
    				[
    					-79.4468541,
    					43.66775
    				]
    			]
    		},
    		id: "way/35655532"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/35828470",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4501146,
    					43.6530469
    				],
    				[
    					-79.4500038,
    					43.6529974
    				],
    				[
    					-79.4491681,
    					43.6526243
    				],
    				[
    					-79.4483035,
    					43.6522235
    				],
    				[
    					-79.4481177,
    					43.6521381
    				],
    				[
    					-79.4480348,
    					43.6521005
    				],
    				[
    					-79.4479707,
    					43.6520715
    				],
    				[
    					-79.4476133,
    					43.6519197
    				],
    				[
    					-79.4474664,
    					43.6518517
    				],
    				[
    					-79.4471569,
    					43.6517063
    				],
    				[
    					-79.4470411,
    					43.6516611
    				],
    				[
    					-79.4469104,
    					43.6516195
    				],
    				[
    					-79.4468021,
    					43.65159
    				],
    				[
    					-79.4465712,
    					43.6515316
    				],
    				[
    					-79.4461616,
    					43.6514276
    				],
    				[
    					-79.4458878,
    					43.6513544
    				],
    				[
    					-79.4455456,
    					43.6512685
    				],
    				[
    					-79.4452661,
    					43.6511961
    				]
    			]
    		},
    		id: "way/35828470"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/37821892",
    			highway: "secondary",
    			lanes: "1",
    			name: "Parkside Drive",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4535292,
    					43.6383781
    				],
    				[
    					-79.4534273,
    					43.6382807
    				],
    				[
    					-79.4533244,
    					43.6382084
    				],
    				[
    					-79.4532272,
    					43.638153
    				],
    				[
    					-79.4531437,
    					43.638115
    				],
    				[
    					-79.4529905,
    					43.6380652
    				],
    				[
    					-79.4528443,
    					43.638033
    				],
    				[
    					-79.4524228,
    					43.6379573
    				]
    			]
    		},
    		id: "way/37821892"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/37821893",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "2",
    			name: "Parkside Drive",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4535292,
    					43.6383781
    				],
    				[
    					-79.4535121,
    					43.6384432
    				],
    				[
    					-79.4535195,
    					43.6384646
    				],
    				[
    					-79.4535974,
    					43.6386884
    				]
    			]
    		},
    		id: "way/37821893"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/39619527",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			"parking:condition:right": "no_stopping",
    			"parking:condition:right:time_interval": "Mo-Fr 07:00-10:00",
    			"parking:lane:right": "no_parking",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4400175,
    					43.6509768
    				],
    				[
    					-79.4399287,
    					43.6510391
    				],
    				[
    					-79.4398381,
    					43.6510891
    				],
    				[
    					-79.4398108,
    					43.6511017
    				],
    				[
    					-79.439759,
    					43.6511204
    				],
    				[
    					-79.4397066,
    					43.6511332
    				],
    				[
    					-79.4396118,
    					43.6511538
    				]
    			]
    		},
    		id: "way/39619527"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41130849",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4439263,
    					43.6801534
    				],
    				[
    					-79.4433655,
    					43.6787534
    				],
    				[
    					-79.4432089,
    					43.6783641
    				],
    				[
    					-79.4431928,
    					43.6783174
    				],
    				[
    					-79.4431059,
    					43.6780806
    				],
    				[
    					-79.4430846,
    					43.6780214
    				]
    			]
    		},
    		id: "way/41130849"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41132308",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4456818,
    					43.6774377
    				],
    				[
    					-79.4457824,
    					43.6774176
    				],
    				[
    					-79.4462264,
    					43.6773098
    				],
    				[
    					-79.4473332,
    					43.6770724
    				],
    				[
    					-79.4474444,
    					43.6770468
    				]
    			]
    		},
    		id: "way/41132308"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41132309",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4474444,
    					43.6770468
    				],
    				[
    					-79.4475442,
    					43.6770237
    				],
    				[
    					-79.4486547,
    					43.6767848
    				],
    				[
    					-79.4491567,
    					43.6766561
    				],
    				[
    					-79.449848,
    					43.6765
    				]
    			]
    		},
    		id: "way/41132309"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41132310",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4473937,
    					43.6769195
    				],
    				[
    					-79.4472785,
    					43.67694
    				],
    				[
    					-79.4457254,
    					43.6772801
    				],
    				[
    					-79.4456221,
    					43.6773026
    				]
    			]
    		},
    		id: "way/41132310"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41132311",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4456221,
    					43.6773026
    				],
    				[
    					-79.4455117,
    					43.6773277
    				],
    				[
    					-79.4450952,
    					43.6774283
    				],
    				[
    					-79.4431753,
    					43.6778551
    				],
    				[
    					-79.4430419,
    					43.6778786
    				]
    			]
    		},
    		id: "way/41132311"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41133313",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4451162,
    					43.6775673
    				],
    				[
    					-79.4455678,
    					43.6774649
    				],
    				[
    					-79.4456818,
    					43.6774377
    				]
    			]
    		},
    		id: "way/41133313"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41133314",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4430846,
    					43.6780214
    				],
    				[
    					-79.4430602,
    					43.6779387
    				],
    				[
    					-79.4430419,
    					43.6778786
    				]
    			]
    		},
    		id: "way/41133314"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41133317",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4430419,
    					43.6778786
    				],
    				[
    					-79.4430286,
    					43.6778213
    				],
    				[
    					-79.442934,
    					43.677551
    				],
    				[
    					-79.4427482,
    					43.6771324
    				],
    				[
    					-79.4423783,
    					43.6763373
    				],
    				[
    					-79.4420303,
    					43.675517
    				],
    				[
    					-79.4417088,
    					43.6747355
    				]
    			]
    		},
    		id: "way/41133317"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41133322",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4408521,
    					43.6783526
    				],
    				[
    					-79.4407142,
    					43.6783763
    				],
    				[
    					-79.4402437,
    					43.6784879
    				],
    				[
    					-79.4400097,
    					43.6785524
    				],
    				[
    					-79.4397666,
    					43.6786083
    				],
    				[
    					-79.4396419,
    					43.6786367
    				]
    			]
    		},
    		id: "way/41133322"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41163746",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4482786,
    					43.6715638
    				],
    				[
    					-79.4482917,
    					43.6715127
    				],
    				[
    					-79.4482959,
    					43.6714596
    				],
    				[
    					-79.4482757,
    					43.6713785
    				],
    				[
    					-79.4477618,
    					43.6699819
    				],
    				[
    					-79.4474338,
    					43.6691082
    				],
    				[
    					-79.4473489,
    					43.6688845
    				],
    				[
    					-79.4473139,
    					43.6687922
    				],
    				[
    					-79.4468541,
    					43.66775
    				]
    			]
    		},
    		id: "way/41163746"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41164055",
    			highway: "secondary",
    			lit: "yes",
    			maxheight: "4.1",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4561105,
    					43.6749924
    				],
    				[
    					-79.455808,
    					43.6750582
    				]
    			]
    		},
    		id: "way/41164055"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41164056",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.455808,
    					43.6750582
    				],
    				[
    					-79.4548503,
    					43.6752713
    				],
    				[
    					-79.4547401,
    					43.6752928
    				]
    			]
    		},
    		id: "way/41164056"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41164057",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			maxheight: "4.1",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4559174,
    					43.6751823
    				],
    				[
    					-79.4561831,
    					43.6751236
    				]
    			]
    		},
    		id: "way/41164057"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41164058",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4561831,
    					43.6751236
    				],
    				[
    					-79.4571149,
    					43.6749102
    				],
    				[
    					-79.457549,
    					43.6748141
    				],
    				[
    					-79.4576585,
    					43.6747984
    				],
    				[
    					-79.4577605,
    					43.6747839
    				],
    				[
    					-79.4582347,
    					43.674676
    				],
    				[
    					-79.4587095,
    					43.67456
    				],
    				[
    					-79.4593086,
    					43.6744349
    				]
    			]
    		},
    		id: "way/41164058"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41363149",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Front Street West",
    			sidewalk: "both",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|left|through;right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3940177,
    					43.6427059
    				],
    				[
    					-79.3939102,
    					43.6427298
    				],
    				[
    					-79.3938705,
    					43.6427386
    				],
    				[
    					-79.3937545,
    					43.642765
    				],
    				[
    					-79.3936707,
    					43.6427893
    				],
    				[
    					-79.3924962,
    					43.6431144
    				]
    			]
    		},
    		id: "way/41363149"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41789175",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queens Quay West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3887363,
    					43.6384266
    				],
    				[
    					-79.3888181,
    					43.6384069
    				],
    				[
    					-79.3888558,
    					43.638399
    				],
    				[
    					-79.3895294,
    					43.6382573
    				]
    			]
    		},
    		id: "way/41789175"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/41789358",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4041541,
    					43.6476731
    				],
    				[
    					-79.4040178,
    					43.6473318
    				],
    				[
    					-79.4040118,
    					43.6473022
    				],
    				[
    					-79.4040091,
    					43.6472893
    				],
    				[
    					-79.4039954,
    					43.6472209
    				],
    				[
    					-79.4039923,
    					43.6472051
    				]
    			]
    		},
    		id: "way/41789358"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/42530356",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4114406,
    					43.6657292
    				],
    				[
    					-79.4114029,
    					43.6656383
    				]
    			]
    		},
    		id: "way/42530356"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/43483166",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4570197,
    					43.655345
    				],
    				[
    					-79.4571226,
    					43.6553235
    				],
    				[
    					-79.4586764,
    					43.6549985
    				]
    			]
    		},
    		id: "way/43483166"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/43483167",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4586764,
    					43.6549985
    				],
    				[
    					-79.4588303,
    					43.6549625
    				]
    			]
    		},
    		id: "way/43483167"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/43483168",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4588303,
    					43.6549625
    				],
    				[
    					-79.4598284,
    					43.6547546
    				],
    				[
    					-79.4600026,
    					43.6547121
    				]
    			]
    		},
    		id: "way/43483168"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/43483590",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.456836,
    					43.6553868
    				],
    				[
    					-79.4569375,
    					43.6553637
    				],
    				[
    					-79.4570197,
    					43.655345
    				]
    			]
    		},
    		id: "way/43483590"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/43483594",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4531887,
    					43.6561657
    				],
    				[
    					-79.4537716,
    					43.6560383
    				]
    			]
    		},
    		id: "way/43483594"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/43483595",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4537716,
    					43.6560383
    				],
    				[
    					-79.4542471,
    					43.655935
    				]
    			]
    		},
    		id: "way/43483595"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/43483596",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4542471,
    					43.655935
    				],
    				[
    					-79.4543545,
    					43.6559109
    				],
    				[
    					-79.4555293,
    					43.6556364
    				],
    				[
    					-79.456836,
    					43.6553868
    				]
    			]
    		},
    		id: "way/43483596"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/44119980",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3894196,
    					43.6729226
    				],
    				[
    					-79.3883223,
    					43.6728697
    				],
    				[
    					-79.3879502,
    					43.6728724
    				],
    				[
    					-79.3878373,
    					43.6728701
    				]
    			]
    		},
    		id: "way/44119980"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/44120042",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			"parking:lane:right": "no_stopping",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3918324,
    					43.6741055
    				],
    				[
    					-79.3916622,
    					43.6740115
    				],
    				[
    					-79.391581,
    					43.6739533
    				],
    				[
    					-79.3915112,
    					43.6738952
    				],
    				[
    					-79.391395,
    					43.6737671
    				],
    				[
    					-79.3911105,
    					43.6734362
    				]
    			]
    		},
    		id: "way/44120042"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/44120614",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4059438,
    					43.6750806
    				],
    				[
    					-79.4053176,
    					43.6752061
    				],
    				[
    					-79.404735,
    					43.6753275
    				]
    			]
    		},
    		id: "way/44120614"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/44120615",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.404735,
    					43.6753275
    				],
    				[
    					-79.4046305,
    					43.6753479
    				],
    				[
    					-79.4041487,
    					43.6754421
    				],
    				[
    					-79.4035997,
    					43.6755537
    				]
    			]
    		},
    		id: "way/44120615"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/44120616",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4029309,
    					43.6757249
    				],
    				[
    					-79.4027075,
    					43.675778
    				],
    				[
    					-79.4025483,
    					43.6758108
    				]
    			]
    		},
    		id: "way/44120616"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/45474046",
    			highway: "secondary",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Ossington Avenue",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4256302,
    					43.6619894
    				],
    				[
    					-79.4255848,
    					43.6619188
    				],
    				[
    					-79.4254541,
    					43.6616039
    				]
    			]
    		},
    		id: "way/45474046"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/45476780",
    			highway: "secondary",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Ossington Avenue",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4254541,
    					43.6616039
    				],
    				[
    					-79.4254418,
    					43.6615742
    				],
    				[
    					-79.4251368,
    					43.6607768
    				],
    				[
    					-79.425076,
    					43.6606182
    				],
    				[
    					-79.4247485,
    					43.6597643
    				],
    				[
    					-79.4246609,
    					43.6595313
    				],
    				[
    					-79.4243137,
    					43.6586348
    				],
    				[
    					-79.4242967,
    					43.6585901
    				],
    				[
    					-79.4242822,
    					43.6585518
    				]
    			]
    		},
    		id: "way/45476780"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/45476781",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4232488,
    					43.6625113
    				],
    				[
    					-79.4231725,
    					43.6625279
    				],
    				[
    					-79.4227677,
    					43.6626257
    				],
    				[
    					-79.4220581,
    					43.6627807
    				],
    				[
    					-79.4209929,
    					43.663004
    				],
    				[
    					-79.4208985,
    					43.6630242
    				],
    				[
    					-79.4208228,
    					43.6630409
    				],
    				[
    					-79.4203762,
    					43.6631354
    				],
    				[
    					-79.4195577,
    					43.6633119
    				],
    				[
    					-79.419466,
    					43.6633316
    				],
    				[
    					-79.4189484,
    					43.6634428
    				],
    				[
    					-79.4188386,
    					43.6634668
    				],
    				[
    					-79.4187227,
    					43.6634956
    				],
    				[
    					-79.4184157,
    					43.6635565
    				],
    				[
    					-79.417175,
    					43.6638336
    				]
    			]
    		},
    		id: "way/45476781"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/45476782",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4268171,
    					43.6617307
    				],
    				[
    					-79.4257344,
    					43.6619674
    				],
    				[
    					-79.4256302,
    					43.6619894
    				]
    			]
    		},
    		id: "way/45476782"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/45476784",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4256302,
    					43.6619894
    				],
    				[
    					-79.4255148,
    					43.6620126
    				],
    				[
    					-79.4246198,
    					43.6622098
    				]
    			]
    		},
    		id: "way/45476784"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/48890613",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4162831,
    					43.64471
    				],
    				[
    					-79.4161828,
    					43.6447319
    				],
    				[
    					-79.4160002,
    					43.6447681
    				],
    				[
    					-79.4155285,
    					43.6448639
    				],
    				[
    					-79.4150518,
    					43.6449562
    				]
    			]
    		},
    		id: "way/48890613"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/48890618",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt",
    			"turn:lanes:backward": "none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4188487,
    					43.6441648
    				],
    				[
    					-79.4187386,
    					43.6441863
    				],
    				[
    					-79.4181074,
    					43.6443141
    				],
    				[
    					-79.4179492,
    					43.6443466
    				],
    				[
    					-79.4177875,
    					43.6443834
    				],
    				[
    					-79.4174836,
    					43.6444541
    				]
    			]
    		},
    		id: "way/48890618"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/49138580",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4119592,
    					43.6420491
    				],
    				[
    					-79.4118539,
    					43.6420698
    				],
    				[
    					-79.4113198,
    					43.6421764
    				]
    			]
    		},
    		id: "way/49138580"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/49138583",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4212564,
    					43.6401734
    				],
    				[
    					-79.4211028,
    					43.6402038
    				],
    				[
    					-79.4207493,
    					43.6402792
    				]
    			]
    		},
    		id: "way/49138583"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/49138585",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4150052,
    					43.6414332
    				],
    				[
    					-79.414892,
    					43.641457
    				],
    				[
    					-79.4147245,
    					43.6414904
    				],
    				[
    					-79.4138012,
    					43.6416779
    				]
    			]
    		},
    		id: "way/49138585"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/56835247",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4357408,
    					43.6796564
    				],
    				[
    					-79.4357727,
    					43.6796479
    				],
    				[
    					-79.4360157,
    					43.6795946
    				],
    				[
    					-79.436578,
    					43.6794624
    				],
    				[
    					-79.4375743,
    					43.6792314
    				],
    				[
    					-79.438544,
    					43.6790147
    				],
    				[
    					-79.4386832,
    					43.6789906
    				],
    				[
    					-79.4388759,
    					43.6789521
    				],
    				[
    					-79.4391747,
    					43.67889
    				],
    				[
    					-79.4394775,
    					43.6788143
    				],
    				[
    					-79.4397525,
    					43.6787452
    				],
    				[
    					-79.4402226,
    					43.6786326
    				]
    			]
    		},
    		id: "way/56835247"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/58330496",
    			highway: "secondary",
    			lanes: "5",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.433323,
    					43.6319303
    				],
    				[
    					-79.4329893,
    					43.6318802
    				]
    			]
    		},
    		id: "way/58330496"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/58330519",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4337618,
    					43.632011
    				],
    				[
    					-79.4336515,
    					43.6319897
    				],
    				[
    					-79.433323,
    					43.6319303
    				]
    			]
    		},
    		id: "way/58330519"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/58330523",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4329893,
    					43.6318802
    				],
    				[
    					-79.4315767,
    					43.6317116
    				],
    				[
    					-79.4312189,
    					43.631662
    				],
    				[
    					-79.4308904,
    					43.631611
    				],
    				[
    					-79.4305614,
    					43.6315546
    				],
    				[
    					-79.4302796,
    					43.6314944
    				],
    				[
    					-79.4300974,
    					43.6314498
    				],
    				[
    					-79.4295989,
    					43.6313309
    				],
    				[
    					-79.4293013,
    					43.6312574
    				],
    				[
    					-79.4289952,
    					43.6311662
    				],
    				[
    					-79.4289385,
    					43.6311518
    				],
    				[
    					-79.4289127,
    					43.6311458
    				],
    				[
    					-79.4288877,
    					43.6311401
    				],
    				[
    					-79.428482,
    					43.6310531
    				]
    			]
    		},
    		id: "way/58330523"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/58869730",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Road",
    			"parking:condition:left": "ticket",
    			"parking:condition:left:time_interval": "Mo-Fr 08:00-15:30, 18:30-21:00; Sa 08:00-21:00; Su 13:00-21:00",
    			"parking:condition:right": "ticket",
    			"parking:condition:right:time_interval": "Mo-Fr 09:30-21:00; Sa 08:00-21:00; Su 13:00-21:00",
    			"parking:lane:both": "parallel",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4047557,
    					43.668979
    				],
    				[
    					-79.4047452,
    					43.6689526
    				],
    				[
    					-79.4044278,
    					43.668113
    				],
    				[
    					-79.4043137,
    					43.6678226
    				]
    			]
    		},
    		id: "way/58869730"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/60194038",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4271117,
    					43.6425233
    				],
    				[
    					-79.427004,
    					43.6425462
    				],
    				[
    					-79.42649,
    					43.6426463
    				],
    				[
    					-79.425961,
    					43.6427535
    				]
    			]
    		},
    		id: "way/60194038"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/60194043",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4279782,
    					43.6423512
    				],
    				[
    					-79.4276037,
    					43.6424236
    				],
    				[
    					-79.4272163,
    					43.6425018
    				],
    				[
    					-79.4271117,
    					43.6425233
    				]
    			]
    		},
    		id: "way/60194043"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/61760484",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "University Avenue",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3891028,
    					43.6563019
    				],
    				[
    					-79.3890676,
    					43.6562269
    				],
    				[
    					-79.3887298,
    					43.6554113
    				]
    			]
    		},
    		id: "way/61760484"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/64370253",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3896957,
    					43.6501616
    				],
    				[
    					-79.3895861,
    					43.6501856
    				],
    				[
    					-79.3894458,
    					43.6502163
    				]
    			]
    		},
    		id: "way/64370253"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/64370254",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3894458,
    					43.6502163
    				],
    				[
    					-79.3886816,
    					43.6503834
    				],
    				[
    					-79.3885914,
    					43.6504009
    				],
    				[
    					-79.3884976,
    					43.6504212
    				],
    				[
    					-79.3884024,
    					43.6504511
    				],
    				[
    					-79.3874365,
    					43.6506611
    				],
    				[
    					-79.386903,
    					43.6507754
    				],
    				[
    					-79.3867757,
    					43.6508031
    				]
    			]
    		},
    		id: "way/64370254"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/64613829",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			name: "Front Street West",
    			sidewalk: "both",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3893112,
    					43.6438307
    				],
    				[
    					-79.3893611,
    					43.6438198
    				]
    			]
    		},
    		id: "way/64613829"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/69020373",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bay Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.39017,
    					43.6713671
    				],
    				[
    					-79.3901444,
    					43.6713034
    				],
    				[
    					-79.3898668,
    					43.6706485
    				],
    				[
    					-79.3898328,
    					43.6705653
    				]
    			]
    		},
    		id: "way/69020373"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/69020374",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bay Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3898328,
    					43.6705653
    				],
    				[
    					-79.389805,
    					43.6704973
    				],
    				[
    					-79.3897068,
    					43.6702756
    				],
    				[
    					-79.3896296,
    					43.6701053
    				]
    			]
    		},
    		id: "way/69020374"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76298821",
    			"embedded_rails:lanes": "||tram|",
    			highway: "secondary",
    			lanes: "2",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4256528,
    					43.6344964
    				],
    				[
    					-79.4256749,
    					43.6345559
    				],
    				[
    					-79.4257049,
    					43.6346363
    				],
    				[
    					-79.4257717,
    					43.6348066
    				],
    				[
    					-79.425801,
    					43.6348829
    				]
    			]
    		},
    		id: "way/76298821"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76298822",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dufferin Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4292064,
    					43.6437934
    				],
    				[
    					-79.4293557,
    					43.6441704
    				],
    				[
    					-79.4295277,
    					43.6446244
    				],
    				[
    					-79.4296883,
    					43.6450479
    				],
    				[
    					-79.4297071,
    					43.6451022
    				],
    				[
    					-79.4298465,
    					43.6454656
    				]
    			]
    		},
    		id: "way/76298822"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76298829",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4314381,
    					43.6496315
    				],
    				[
    					-79.4313038,
    					43.6496279
    				],
    				[
    					-79.4308902,
    					43.6496169
    				]
    			]
    		},
    		id: "way/76298829"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76298836",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4525588,
    					43.6567567
    				],
    				[
    					-79.4524667,
    					43.6564244
    				]
    			]
    		},
    		id: "way/76298836"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76559093",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Roadway divided by bridge supports. Surface in tunnel is concrete, also on outside lanes",
    			oneway: "no",
    			surface: "concrete"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4207493,
    					43.6402792
    				],
    				[
    					-79.4189802,
    					43.6406363
    				],
    				[
    					-79.4185731,
    					43.6407186
    				]
    			]
    		},
    		id: "way/76559093"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76559094",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4173315,
    					43.6409697
    				],
    				[
    					-79.4171888,
    					43.6409987
    				],
    				[
    					-79.4166142,
    					43.6411142
    				],
    				[
    					-79.4153517,
    					43.6413664
    				],
    				[
    					-79.4151225,
    					43.64141
    				],
    				[
    					-79.4150052,
    					43.6414332
    				]
    			]
    		},
    		id: "way/76559094"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76699167",
    			"embedded_rails:lanes": "||tram|tram|",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt",
    			"turn:lanes:backward": "||right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4031968,
    					43.64519
    				],
    				[
    					-79.4031582,
    					43.6450951
    				],
    				[
    					-79.4030469,
    					43.6448155
    				]
    			]
    		},
    		id: "way/76699167"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76699170",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt",
    			"turn:lanes:backward": "through|through;right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4018704,
    					43.6419181
    				],
    				[
    					-79.4018413,
    					43.6418441
    				],
    				[
    					-79.4017255,
    					43.6415448
    				],
    				[
    					-79.4016912,
    					43.6414625
    				],
    				[
    					-79.4014409,
    					43.6408207
    				],
    				[
    					-79.4014083,
    					43.6407423
    				]
    			]
    		},
    		id: "way/76699170"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76699266",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4107224,
    					43.6422972
    				],
    				[
    					-79.4103882,
    					43.6423662
    				],
    				[
    					-79.4101631,
    					43.6424111
    				],
    				[
    					-79.4101151,
    					43.6424202
    				]
    			]
    		},
    		id: "way/76699266"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/76699268",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4122258,
    					43.6419951
    				],
    				[
    					-79.4120562,
    					43.6420291
    				],
    				[
    					-79.4119592,
    					43.6420491
    				]
    			]
    		},
    		id: "way/76699268"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/78135452",
    			highway: "secondary",
    			lanes: "3",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4289226,
    					43.6313
    				],
    				[
    					-79.4290607,
    					43.6313786
    				],
    				[
    					-79.4292373,
    					43.6314739
    				]
    			]
    		},
    		id: "way/78135452"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/78254882",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4463807,
    					43.6373779
    				],
    				[
    					-79.4466754,
    					43.6374542
    				],
    				[
    					-79.4473871,
    					43.6376242
    				],
    				[
    					-79.4481117,
    					43.6377973
    				],
    				[
    					-79.4485976,
    					43.6379011
    				],
    				[
    					-79.44914,
    					43.6380037
    				],
    				[
    					-79.4500659,
    					43.6381497
    				]
    			]
    		},
    		id: "way/78254882"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/78254894",
    			highway: "secondary",
    			lanes: "1",
    			maxspeed: "50",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4470076,
    					43.6384985
    				],
    				[
    					-79.4467074,
    					43.6385616
    				],
    				[
    					-79.4463217,
    					43.6386483
    				],
    				[
    					-79.4463,
    					43.6386553
    				],
    				[
    					-79.4462728,
    					43.6386639
    				],
    				[
    					-79.4462531,
    					43.6386705
    				],
    				[
    					-79.4462381,
    					43.6386768
    				],
    				[
    					-79.4461936,
    					43.6386953
    				],
    				[
    					-79.4461254,
    					43.638728
    				],
    				[
    					-79.4461011,
    					43.6387397
    				],
    				[
    					-79.4460871,
    					43.6387464
    				]
    			]
    		},
    		id: "way/78254894"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/78255114",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "2",
    			maxspeed: "40",
    			name: "Jameson Avenue",
    			note: "Planters on side of road",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4360046,
    					43.6371724
    				],
    				[
    					-79.436,
    					43.6371585
    				],
    				[
    					-79.4359764,
    					43.637088
    				],
    				[
    					-79.4358715,
    					43.6368102
    				],
    				[
    					-79.4358451,
    					43.6367401
    				],
    				[
    					-79.4357936,
    					43.6366036
    				],
    				[
    					-79.4355954,
    					43.6360788
    				],
    				[
    					-79.4354545,
    					43.6357055
    				],
    				[
    					-79.4353173,
    					43.6353421
    				],
    				[
    					-79.435298,
    					43.6352911
    				],
    				[
    					-79.4352132,
    					43.6350666
    				],
    				[
    					-79.4351766,
    					43.6349696
    				],
    				[
    					-79.4350372,
    					43.6346004
    				],
    				[
    					-79.4349294,
    					43.6343149
    				],
    				[
    					-79.4348284,
    					43.6340473
    				],
    				[
    					-79.4348041,
    					43.6339765
    				]
    			]
    		},
    		id: "way/78255114"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83301044",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "none|none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.432431,
    					43.6330253
    				],
    				[
    					-79.4330584,
    					43.6331229
    				],
    				[
    					-79.434452,
    					43.6333592
    				],
    				[
    					-79.4345917,
    					43.6333744
    				]
    			]
    		},
    		id: "way/83301044"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83301045",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4292373,
    					43.6314739
    				],
    				[
    					-79.4293055,
    					43.6315094
    				],
    				[
    					-79.430636,
    					43.6322826
    				]
    			]
    		},
    		id: "way/83301045"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83301271",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4345917,
    					43.6333744
    				],
    				[
    					-79.4347026,
    					43.633385
    				],
    				[
    					-79.4347356,
    					43.6333873
    				],
    				[
    					-79.4349642,
    					43.6334074
    				],
    				[
    					-79.4351985,
    					43.6334167
    				]
    			]
    		},
    		id: "way/83301271"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83782174",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.394793,
    					43.6703741
    				],
    				[
    					-79.3947811,
    					43.6703443
    				],
    				[
    					-79.3946144,
    					43.6699282
    				]
    			]
    		},
    		id: "way/83782174"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83782176",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt",
    			"turn:lanes:backward": "none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3944781,
    					43.6695958
    				],
    				[
    					-79.3944465,
    					43.6695135
    				],
    				[
    					-79.3943861,
    					43.6693588
    				]
    			]
    		},
    		id: "way/83782176"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83784166",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3954504,
    					43.6718958
    				],
    				[
    					-79.3950725,
    					43.6710152
    				]
    			]
    		},
    		id: "way/83784166"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83784167",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3950725,
    					43.6710152
    				],
    				[
    					-79.3948327,
    					43.6704652
    				],
    				[
    					-79.394793,
    					43.6703741
    				]
    			]
    		},
    		id: "way/83784167"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83786304",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3980756,
    					43.6744236
    				],
    				[
    					-79.3973967,
    					43.6745557
    				],
    				[
    					-79.3967158,
    					43.6746796
    				],
    				[
    					-79.3965765,
    					43.6747075
    				]
    			]
    		},
    		id: "way/83786304"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83786306",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes:backward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3965765,
    					43.6747075
    				],
    				[
    					-79.3964325,
    					43.6747364
    				],
    				[
    					-79.395959,
    					43.6748432
    				]
    			]
    		},
    		id: "way/83786306"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83786308",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3965765,
    					43.6747075
    				],
    				[
    					-79.3965408,
    					43.674616
    				],
    				[
    					-79.3962963,
    					43.6740097
    				]
    			]
    		},
    		id: "way/83786308"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83786310",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3960064,
    					43.6733551
    				],
    				[
    					-79.3958319,
    					43.6729034
    				],
    				[
    					-79.3958186,
    					43.6728689
    				],
    				[
    					-79.3955726,
    					43.6722321
    				],
    				[
    					-79.3955331,
    					43.6721282
    				],
    				[
    					-79.3955112,
    					43.6720643
    				],
    				[
    					-79.3954504,
    					43.6718958
    				]
    			]
    		},
    		id: "way/83786310"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83787293",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3972497,
    					43.6763676
    				],
    				[
    					-79.3969069,
    					43.6755445
    				]
    			]
    		},
    		id: "way/83787293"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/83787297",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3969069,
    					43.6755445
    				],
    				[
    					-79.3967434,
    					43.6751215
    				],
    				[
    					-79.3966184,
    					43.6748146
    				],
    				[
    					-79.3965765,
    					43.6747075
    				]
    			]
    		},
    		id: "way/83787297"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/98567762",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bay Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3907028,
    					43.6725823
    				],
    				[
    					-79.3904992,
    					43.6721349
    				],
    				[
    					-79.3901945,
    					43.671428
    				],
    				[
    					-79.39017,
    					43.6713671
    				]
    			]
    		},
    		id: "way/98567762"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/100106502",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4005051,
    					43.6843309
    				],
    				[
    					-79.4004864,
    					43.6842852
    				],
    				[
    					-79.4001454,
    					43.6834489
    				],
    				[
    					-79.4000454,
    					43.683208
    				],
    				[
    					-79.4000054,
    					43.6831118
    				],
    				[
    					-79.3999291,
    					43.6829279
    				],
    				[
    					-79.3997836,
    					43.6825776
    				],
    				[
    					-79.3997534,
    					43.682505
    				],
    				[
    					-79.3990489,
    					43.6807629
    				],
    				[
    					-79.3989134,
    					43.6804209
    				],
    				[
    					-79.3986899,
    					43.6798629
    				],
    				[
    					-79.3985773,
    					43.6795817
    				],
    				[
    					-79.3985529,
    					43.6795208
    				],
    				[
    					-79.3985326,
    					43.6794714
    				],
    				[
    					-79.3983282,
    					43.6789744
    				],
    				[
    					-79.3979583,
    					43.6781033
    				]
    			]
    		},
    		id: "way/100106502"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/101300432",
    			bridge: "yes",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			layer: "4",
    			maxspeed: "30",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4254465,
    					43.6339571
    				],
    				[
    					-79.4252759,
    					43.6335344
    				]
    			]
    		},
    		id: "way/101300432"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/101300433",
    			bicycle: "yes",
    			bridge: "yes",
    			cycleway: "shared_lane",
    			foot: "yes",
    			highway: "secondary",
    			lanes: "1",
    			layer: "4",
    			maxspeed: "30",
    			name: "Dufferin Street",
    			oneway: "yes",
    			surface: "metal"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4254465,
    					43.6339571
    				],
    				[
    					-79.4254468,
    					43.6340696
    				],
    				[
    					-79.4255337,
    					43.6342955
    				],
    				[
    					-79.4255415,
    					43.6343157
    				],
    				[
    					-79.4256108,
    					43.6343879
    				]
    			]
    		},
    		id: "way/101300433"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/101300434",
    			bicycle: "yes",
    			bridge: "yes",
    			cycleway: "shared_lane",
    			foot: "yes",
    			highway: "secondary",
    			lanes: "1",
    			layer: "4",
    			maxspeed: "30",
    			name: "Dufferin Street",
    			oneway: "yes",
    			surface: "metal"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4256108,
    					43.6343879
    				],
    				[
    					-79.4256177,
    					43.6342966
    				],
    				[
    					-79.4255999,
    					43.634239
    				],
    				[
    					-79.4255258,
    					43.6340465
    				],
    				[
    					-79.4254465,
    					43.6339571
    				]
    			]
    		},
    		id: "way/101300434"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/115685439",
    			bridge: "yes",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queens Quay West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3895294,
    					43.6382573
    				],
    				[
    					-79.3897472,
    					43.6382092
    				]
    			]
    		},
    		id: "way/115685439"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/124690742",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			"parking:lane:left": "no_parking",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3973948,
    					43.6680394
    				],
    				[
    					-79.3972838,
    					43.6680628
    				],
    				[
    					-79.3961665,
    					43.668281
    				]
    			]
    		},
    		id: "way/124690742"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/124690743",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			"parking:condition:left:1": "fee",
    			"parking:condition:left:1:time_interval": "Mo-Fr 09:30-15:30, 18:30-21:00; Sa 08:00-21:00; Su 13:00-21:00",
    			"parking:condition:left:2": "no_stopping",
    			"parking:condition:left:2:time_interval": "Mo-Fr 07:30-09:30, 15:30-18:30",
    			"parking:lane:left": "parallel",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3961665,
    					43.668281
    				],
    				[
    					-79.3957405,
    					43.6683658
    				],
    				[
    					-79.3954585,
    					43.6684267
    				],
    				[
    					-79.3948382,
    					43.6685556
    				]
    			]
    		},
    		id: "way/124690743"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/124690744",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3941295,
    					43.6687016
    				],
    				[
    					-79.3939658,
    					43.6687331
    				],
    				[
    					-79.3934625,
    					43.6688412
    				]
    			]
    		},
    		id: "way/124690744"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/126713282",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4025526,
    					43.6639305
    				],
    				[
    					-79.4023587,
    					43.6634445
    				],
    				[
    					-79.4022314,
    					43.6631254
    				],
    				[
    					-79.4022018,
    					43.6630487
    				]
    			]
    		},
    		id: "way/126713282"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/141001277",
    			bicycle: "no",
    			foot: "no",
    			highway: "secondary",
    			lanes: "3",
    			maxspeed: "50",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3870255,
    					43.639938
    				],
    				[
    					-79.3871485,
    					43.6399156
    				],
    				[
    					-79.3891706,
    					43.6395862
    				],
    				[
    					-79.3908714,
    					43.6392923
    				]
    			]
    		},
    		id: "way/141001277"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/141001279",
    			bicycle: "no",
    			foot: "no",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3936635,
    					43.6388308
    				],
    				[
    					-79.3943971,
    					43.6387176
    				],
    				[
    					-79.3947908,
    					43.6386242
    				],
    				[
    					-79.3952436,
    					43.6384969
    				],
    				[
    					-79.3955175,
    					43.6384013
    				],
    				[
    					-79.3957457,
    					43.6382865
    				],
    				[
    					-79.3961059,
    					43.6380958
    				],
    				[
    					-79.396381,
    					43.6379502
    				],
    				[
    					-79.3967864,
    					43.6376958
    				],
    				[
    					-79.3970598,
    					43.637547
    				],
    				[
    					-79.3972302,
    					43.6374715
    				],
    				[
    					-79.3973808,
    					43.6374022
    				],
    				[
    					-79.3974493,
    					43.6373664
    				]
    			]
    		},
    		id: "way/141001279"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/141693460",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3896957,
    					43.6501616
    				],
    				[
    					-79.3897835,
    					43.6501428
    				],
    				[
    					-79.3899368,
    					43.6501099
    				],
    				[
    					-79.3909835,
    					43.6498922
    				],
    				[
    					-79.3910788,
    					43.6498723
    				],
    				[
    					-79.3911748,
    					43.6498523
    				],
    				[
    					-79.3921147,
    					43.6496494
    				],
    				[
    					-79.3932939,
    					43.6494002
    				],
    				[
    					-79.3934152,
    					43.649375
    				]
    			]
    		},
    		id: "way/141693460"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/144320327",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4407652,
    					43.6725587
    				],
    				[
    					-79.4405935,
    					43.6721523
    				],
    				[
    					-79.4402241,
    					43.6712966
    				],
    				[
    					-79.4400068,
    					43.670794
    				],
    				[
    					-79.4398663,
    					43.6704417
    				],
    				[
    					-79.4394806,
    					43.6695348
    				],
    				[
    					-79.4394334,
    					43.6694284
    				],
    				[
    					-79.4392882,
    					43.6690811
    				]
    			]
    		},
    		id: "way/144320327"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/146154647",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queens Quay West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3906779,
    					43.6380043
    				],
    				[
    					-79.3908782,
    					43.6379602
    				]
    			]
    		},
    		id: "way/146154647"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/146291949",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "both",
    			surface: "asphalt",
    			"turn:lanes:backward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3929082,
    					43.6747125
    				],
    				[
    					-79.3928199,
    					43.6746664
    				],
    				[
    					-79.3925741,
    					43.674529
    				]
    			]
    		},
    		id: "way/146291949"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/150842802",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Road",
    			"parking:condition:left": "ticket",
    			"parking:condition:left:time_interval": "Mo-Fr 08:00-15:30, 18:30-21:00; Sa 08:00-21:00; Su 13:00-21:00",
    			"parking:lane:left": "parallel",
    			"parking:lane:right": "no_parking",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4043137,
    					43.6678226
    				],
    				[
    					-79.4042884,
    					43.6677562
    				],
    				[
    					-79.4041797,
    					43.6674805
    				],
    				[
    					-79.4041439,
    					43.6673926
    				]
    			]
    		},
    		id: "way/150842802"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/156269751",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3985195,
    					43.6544214
    				],
    				[
    					-79.3985462,
    					43.6544857
    				]
    			]
    		},
    		id: "way/156269751"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/174218469",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4420982,
    					43.6358489
    				],
    				[
    					-79.442833,
    					43.6360969
    				]
    			]
    		},
    		id: "way/174218469"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/174218472",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.442833,
    					43.6360969
    				],
    				[
    					-79.443815,
    					43.6364673
    				],
    				[
    					-79.4450956,
    					43.6369994
    				],
    				[
    					-79.4453821,
    					43.6371075
    				],
    				[
    					-79.4456744,
    					43.6371954
    				],
    				[
    					-79.4460261,
    					43.6372891
    				],
    				[
    					-79.4463807,
    					43.6373779
    				]
    			]
    		},
    		id: "way/174218472"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/189607127",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3928619,
    					43.6405667
    				],
    				[
    					-79.3929005,
    					43.6406658
    				]
    			]
    		},
    		id: "way/189607127"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/189607128",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3929005,
    					43.6406658
    				],
    				[
    					-79.3929218,
    					43.6407312
    				],
    				[
    					-79.3931611,
    					43.6413754
    				],
    				[
    					-79.3932076,
    					43.6415021
    				]
    			]
    		},
    		id: "way/189607128"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/189629020",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4587943,
    					43.6644482
    				],
    				[
    					-79.4586555,
    					43.6643633
    				],
    				[
    					-79.4582635,
    					43.6641466
    				],
    				[
    					-79.4573799,
    					43.6636468
    				]
    			]
    		},
    		id: "way/189629020"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/189629021",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			sidewalk: "both",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4592589,
    					43.6646906
    				],
    				[
    					-79.4591365,
    					43.6646369
    				],
    				[
    					-79.458905,
    					43.6645071
    				],
    				[
    					-79.4587943,
    					43.6644482
    				]
    			]
    		},
    		id: "way/189629021"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/195670504",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3901601,
    					43.6729915
    				],
    				[
    					-79.3900595,
    					43.6729849
    				],
    				[
    					-79.3898881,
    					43.6729723
    				],
    				[
    					-79.3894196,
    					43.6729226
    				]
    			]
    		},
    		id: "way/195670504"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/203841007",
    			"construction:cycleway:right": "track",
    			"cycleway:right": "no",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Richmond Street West",
    			note: "November 14, 2019: watermain construction - road narrowed to 1 lane shared between cars and bikes.",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3952348,
    					43.6479714
    				],
    				[
    					-79.3957198,
    					43.6478647
    				],
    				[
    					-79.3957619,
    					43.6478554
    				],
    				[
    					-79.3958796,
    					43.6478404
    				]
    			]
    		},
    		id: "way/203841007"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/204673561",
    			bridge: "yes",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "3",
    			layer: "1",
    			name: "Jameson Avenue",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4347499,
    					43.6338224
    				],
    				[
    					-79.434651,
    					43.6335413
    				]
    			]
    		},
    		id: "way/204673561"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/204673564",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "3",
    			name: "Jameson Avenue",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.434651,
    					43.6335413
    				],
    				[
    					-79.4346462,
    					43.6335245
    				],
    				[
    					-79.4345917,
    					43.6333744
    				]
    			]
    		},
    		id: "way/204673564"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/207223487",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			lcn: "yes",
    			lit: "yes",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4038017,
    					43.6666633
    				],
    				[
    					-79.4036742,
    					43.6666879
    				],
    				[
    					-79.4030894,
    					43.6668199
    				]
    			]
    		},
    		id: "way/207223487"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/214575856",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left||right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3992067,
    					43.6362113
    				],
    				[
    					-79.3992697,
    					43.636244
    				],
    				[
    					-79.3993288,
    					43.6362904
    				],
    				[
    					-79.3994316,
    					43.6364089
    				],
    				[
    					-79.3995215,
    					43.6365184
    				]
    			]
    		},
    		id: "way/214575856"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/216264395",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queens Quay West",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3910723,
    					43.6379165
    				],
    				[
    					-79.3911025,
    					43.63791
    				],
    				[
    					-79.3914268,
    					43.6378405
    				]
    			]
    		},
    		id: "way/216264395"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/216264396",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Queens Quay West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3917817,
    					43.6377686
    				],
    				[
    					-79.3918446,
    					43.6377556
    				],
    				[
    					-79.3919017,
    					43.6377434
    				],
    				[
    					-79.3919584,
    					43.6377313
    				],
    				[
    					-79.3919956,
    					43.6377232
    				]
    			]
    		},
    		id: "way/216264396"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/216264452",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Lower Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3922076,
    					43.6382038
    				],
    				[
    					-79.3920427,
    					43.6378314
    				],
    				[
    					-79.3920215,
    					43.6377835
    				],
    				[
    					-79.3919956,
    					43.6377232
    				]
    			]
    		},
    		id: "way/216264452"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/216566669",
    			bus_lanes: "7a-7p M-F (buses, taxis, bikes)",
    			cycleway: "share_busway",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Bay Street",
    			note: "\"Sharrows\" in bus lane",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.389204,
    					43.6690592
    				],
    				[
    					-79.3891256,
    					43.6688649
    				],
    				[
    					-79.3890183,
    					43.6686099
    				],
    				[
    					-79.3889952,
    					43.6685541
    				]
    			]
    		},
    		id: "way/216566669"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/218811399",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3923152,
    					43.6384636
    				],
    				[
    					-79.3922369,
    					43.6384967
    				],
    				[
    					-79.3921328,
    					43.6385407
    				]
    			]
    		},
    		id: "way/218811399"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/218811400",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "right",
    			surface: "asphalt",
    			"turn:lanes": "through|through|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.392686,
    					43.6383695
    				],
    				[
    					-79.3924724,
    					43.6384214
    				],
    				[
    					-79.3924147,
    					43.6384354
    				],
    				[
    					-79.3923152,
    					43.6384636
    				]
    			]
    		},
    		id: "way/218811400"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219798578",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4198299,
    					43.6304144
    				],
    				[
    					-79.4192861,
    					43.6304762
    				],
    				[
    					-79.4190035,
    					43.6305716
    				]
    			]
    		},
    		id: "way/219798578"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219798579",
    			highway: "secondary",
    			lanes: "7",
    			"lanes:backward": "4",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4205692,
    					43.6303887
    				],
    				[
    					-79.4217522,
    					43.6302873
    				]
    			]
    		},
    		id: "way/219798579"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219798580",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4205692,
    					43.6303887
    				],
    				[
    					-79.420184,
    					43.6303719
    				],
    				[
    					-79.4200583,
    					43.630387
    				],
    				[
    					-79.4198299,
    					43.6304144
    				]
    			]
    		},
    		id: "way/219798580"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219798581",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.428482,
    					43.6310531
    				],
    				[
    					-79.4285661,
    					43.6311114
    				],
    				[
    					-79.4286152,
    					43.6311434
    				],
    				[
    					-79.4286746,
    					43.6311771
    				],
    				[
    					-79.4287954,
    					43.6312395
    				],
    				[
    					-79.4289226,
    					43.6313
    				]
    			]
    		},
    		id: "way/219798581"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219798582",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4217522,
    					43.6302873
    				],
    				[
    					-79.4243816,
    					43.6300779
    				],
    				[
    					-79.4246775,
    					43.6300532
    				],
    				[
    					-79.4248331,
    					43.630042
    				],
    				[
    					-79.4249744,
    					43.6300373
    				],
    				[
    					-79.4251187,
    					43.6300377
    				],
    				[
    					-79.4252652,
    					43.6300449
    				],
    				[
    					-79.4253849,
    					43.6300576
    				],
    				[
    					-79.425492,
    					43.6300734
    				],
    				[
    					-79.4256075,
    					43.6300935
    				],
    				[
    					-79.4257222,
    					43.6301178
    				],
    				[
    					-79.4258274,
    					43.6301453
    				],
    				[
    					-79.4259663,
    					43.6301857
    				],
    				[
    					-79.4261085,
    					43.6302352
    				],
    				[
    					-79.4263871,
    					43.6303318
    				],
    				[
    					-79.4273912,
    					43.6306783
    				],
    				[
    					-79.428482,
    					43.6310531
    				]
    			]
    		},
    		id: "way/219798582"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219798749",
    			highway: "secondary",
    			lanes: "7",
    			"lanes:backward": "4",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4190035,
    					43.6305716
    				],
    				[
    					-79.4181496,
    					43.6307008
    				]
    			]
    		},
    		id: "way/219798749"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219798750",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4181496,
    					43.6307008
    				],
    				[
    					-79.4161847,
    					43.6310228
    				]
    			]
    		},
    		id: "way/219798750"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219798751",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4161847,
    					43.6310228
    				],
    				[
    					-79.4159618,
    					43.6309956
    				],
    				[
    					-79.4158089,
    					43.6310183
    				],
    				[
    					-79.4157709,
    					43.6310239
    				],
    				[
    					-79.4155872,
    					43.631054
    				],
    				[
    					-79.4154788,
    					43.6310718
    				]
    			]
    		},
    		id: "way/219798751"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219799046",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4109366,
    					43.6323863
    				],
    				[
    					-79.4104326,
    					43.6325343
    				],
    				[
    					-79.4103045,
    					43.6326481
    				]
    			]
    		},
    		id: "way/219799046"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219799048",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4110152,
    					43.6325081
    				],
    				[
    					-79.411163,
    					43.6324585
    				],
    				[
    					-79.4114836,
    					43.6323652
    				],
    				[
    					-79.4117015,
    					43.6322333
    				]
    			]
    		},
    		id: "way/219799048"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845317",
    			highway: "secondary",
    			lanes: "7",
    			"lanes:backward": "3",
    			"lanes:forward": "4",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4009661,
    					43.6360567
    				],
    				[
    					-79.4013475,
    					43.6359767
    				],
    				[
    					-79.4017579,
    					43.6359014
    				],
    				[
    					-79.4019222,
    					43.6358781
    				]
    			]
    		},
    		id: "way/219845317"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845318",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3997044,
    					43.6364536
    				],
    				[
    					-79.3998121,
    					43.6364168
    				],
    				[
    					-79.4003727,
    					43.636228
    				],
    				[
    					-79.4006422,
    					43.6361382
    				],
    				[
    					-79.4009661,
    					43.6360567
    				]
    			]
    		},
    		id: "way/219845318"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845319",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "right",
    			surface: "asphalt",
    			"turn:lanes": "left|||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3979325,
    					43.6370812
    				],
    				[
    					-79.3972975,
    					43.6372645
    				],
    				[
    					-79.3971342,
    					43.6373149
    				]
    			]
    		},
    		id: "way/219845319"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845428",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Bathurst Street",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.399695,
    					43.6367383
    				],
    				[
    					-79.3997899,
    					43.6368486
    				],
    				[
    					-79.399798,
    					43.636858
    				],
    				[
    					-79.3998491,
    					43.6369174
    				]
    			]
    		},
    		id: "way/219845428"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845758",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4130529,
    					43.6317871
    				],
    				[
    					-79.4139874,
    					43.6314999
    				]
    			]
    		},
    		id: "way/219845758"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845759",
    			highway: "secondary",
    			lanes: "7",
    			"lanes:backward": "4",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4117015,
    					43.6322333
    				],
    				[
    					-79.4130529,
    					43.6317871
    				]
    			]
    		},
    		id: "way/219845759"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845760",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4139874,
    					43.6314999
    				],
    				[
    					-79.4146954,
    					43.6312804
    				],
    				[
    					-79.4148823,
    					43.6312289
    				]
    			]
    		},
    		id: "way/219845760"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845761",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4155923,
    					43.631178
    				],
    				[
    					-79.415805,
    					43.6311439
    				],
    				[
    					-79.4159893,
    					43.631113
    				],
    				[
    					-79.4161847,
    					43.6310228
    				]
    			]
    		},
    		id: "way/219845761"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845762",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4117015,
    					43.6322333
    				],
    				[
    					-79.4114286,
    					43.6322446
    				],
    				[
    					-79.411132,
    					43.6323344
    				],
    				[
    					-79.4110969,
    					43.6323449
    				],
    				[
    					-79.4109366,
    					43.6323863
    				]
    			]
    		},
    		id: "way/219845762"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219845763",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4148823,
    					43.6312289
    				],
    				[
    					-79.4151786,
    					43.6312393
    				],
    				[
    					-79.4153425,
    					43.6312154
    				],
    				[
    					-79.415389,
    					43.6312086
    				],
    				[
    					-79.4155923,
    					43.631178
    				]
    			]
    		},
    		id: "way/219845763"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219860803",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4086747,
    					43.6344769
    				],
    				[
    					-79.4086105,
    					43.6345592
    				],
    				[
    					-79.408502,
    					43.6346704
    				],
    				[
    					-79.4083296,
    					43.6348332
    				],
    				[
    					-79.4081064,
    					43.6350477
    				]
    			]
    		},
    		id: "way/219860803"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219860804",
    			highway: "secondary",
    			lanes: "5",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4103045,
    					43.6326481
    				],
    				[
    					-79.4105924,
    					43.6326347
    				],
    				[
    					-79.4108424,
    					43.6325598
    				],
    				[
    					-79.4110152,
    					43.6325081
    				]
    			]
    		},
    		id: "way/219860804"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219860805",
    			highway: "secondary",
    			lanes: "7",
    			"lanes:backward": "4",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4091116,
    					43.6339465
    				],
    				[
    					-79.4092612,
    					43.6336781
    				],
    				[
    					-79.4093727,
    					43.6334933
    				]
    			]
    		},
    		id: "way/219860805"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219860806",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4093727,
    					43.6334933
    				],
    				[
    					-79.4094661,
    					43.6333548
    				],
    				[
    					-79.4095492,
    					43.6332368
    				]
    			]
    		},
    		id: "way/219860806"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219860807",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4091116,
    					43.6339465
    				],
    				[
    					-79.4089356,
    					43.6340649
    				],
    				[
    					-79.4088141,
    					43.6342744
    				],
    				[
    					-79.4087377,
    					43.6343783
    				],
    				[
    					-79.4087221,
    					43.6343974
    				],
    				[
    					-79.4086747,
    					43.6344769
    				]
    			]
    		},
    		id: "way/219860807"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219860808",
    			highway: "secondary",
    			lanes: "8",
    			"lanes:backward": "3",
    			"lanes:forward": "5",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|none|none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4095492,
    					43.6332368
    				],
    				[
    					-79.4096749,
    					43.6330823
    				],
    				[
    					-79.4099554,
    					43.6328353
    				],
    				[
    					-79.4102091,
    					43.6326984
    				],
    				[
    					-79.4103045,
    					43.6326481
    				]
    			]
    		},
    		id: "way/219860808"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219860817",
    			highway: "secondary",
    			lanes: "3",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4088216,
    					43.6345794
    				],
    				[
    					-79.4089174,
    					43.6344885
    				],
    				[
    					-79.4089869,
    					43.6343733
    				],
    				[
    					-79.4091053,
    					43.6341482
    				],
    				[
    					-79.4091116,
    					43.6339465
    				]
    			]
    		},
    		id: "way/219860817"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219930006",
    			highway: "secondary",
    			lanes: "7",
    			"lanes:backward": "3",
    			"lanes:forward": "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4078985,
    					43.635155
    				],
    				[
    					-79.4081064,
    					43.6350477
    				]
    			]
    		},
    		id: "way/219930006"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219930007",
    			highway: "secondary",
    			lanes: "7",
    			"lanes:backward": "4",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4074962,
    					43.6353101
    				],
    				[
    					-79.4077863,
    					43.6352081
    				],
    				[
    					-79.4078985,
    					43.635155
    				]
    			]
    		},
    		id: "way/219930007"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219930008",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4067421,
    					43.6354019
    				],
    				[
    					-79.4066153,
    					43.6354222
    				],
    				[
    					-79.4065081,
    					43.635437
    				],
    				[
    					-79.4063717,
    					43.6354558
    				],
    				[
    					-79.4060931,
    					43.6354924
    				],
    				[
    					-79.4057327,
    					43.6355829
    				]
    			]
    		},
    		id: "way/219930008"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219930009",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4074962,
    					43.6353101
    				],
    				[
    					-79.4070715,
    					43.6353447
    				],
    				[
    					-79.4068365,
    					43.635387
    				],
    				[
    					-79.4067421,
    					43.6354019
    				]
    			]
    		},
    		id: "way/219930009"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219930010",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4081064,
    					43.6350477
    				],
    				[
    					-79.4084344,
    					43.6349095
    				],
    				[
    					-79.4086115,
    					43.634784
    				],
    				[
    					-79.4086783,
    					43.6347261
    				],
    				[
    					-79.408732,
    					43.6346795
    				],
    				[
    					-79.4088216,
    					43.6345794
    				]
    			]
    		},
    		id: "way/219930010"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219931065",
    			highway: "secondary",
    			lanes: "6",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4022839,
    					43.6358394
    				],
    				[
    					-79.402857,
    					43.6357942
    				]
    			]
    		},
    		id: "way/219931065"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219931068",
    			highway: "secondary",
    			lanes: "6",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.402857,
    					43.6357942
    				],
    				[
    					-79.4031006,
    					43.635778
    				]
    			]
    		},
    		id: "way/219931068"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219931303",
    			highway: "secondary",
    			lanes: "7",
    			"lanes:backward": "3",
    			"lanes:forward": "4",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4057327,
    					43.6355829
    				],
    				[
    					-79.4037966,
    					43.6357286
    				],
    				[
    					-79.4036046,
    					43.6357435
    				]
    			]
    		},
    		id: "way/219931303"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219931304",
    			highway: "secondary",
    			lanes: "6",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4036046,
    					43.6357435
    				],
    				[
    					-79.4033721,
    					43.6357597
    				],
    				[
    					-79.4032659,
    					43.635767
    				],
    				[
    					-79.4031006,
    					43.635778
    				]
    			]
    		},
    		id: "way/219931304"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/219931305",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4057327,
    					43.6355829
    				],
    				[
    					-79.4060897,
    					43.6356206
    				],
    				[
    					-79.4063472,
    					43.6355995
    				],
    				[
    					-79.4065409,
    					43.6355748
    				],
    				[
    					-79.4066575,
    					43.63556
    				],
    				[
    					-79.4067885,
    					43.6355425
    				]
    			]
    		},
    		id: "way/219931305"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220190122",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4564734,
    					43.6630504
    				],
    				[
    					-79.4558203,
    					43.6623837
    				],
    				[
    					-79.455475,
    					43.6620297
    				],
    				[
    					-79.4549772,
    					43.6615192
    				],
    				[
    					-79.4542259,
    					43.6607497
    				],
    				[
    					-79.4540209,
    					43.6605388
    				],
    				[
    					-79.4538948,
    					43.6603965
    				],
    				[
    					-79.4537858,
    					43.6602115
    				],
    				[
    					-79.4536635,
    					43.659938
    				],
    				[
    					-79.4531417,
    					43.6587199
    				],
    				[
    					-79.4530928,
    					43.658607
    				],
    				[
    					-79.4530558,
    					43.658525
    				],
    				[
    					-79.4529711,
    					43.6583092
    				],
    				[
    					-79.4529265,
    					43.6581702
    				],
    				[
    					-79.4527604,
    					43.6575368
    				]
    			]
    		},
    		id: "way/220190122"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220190125",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Dundas Street West",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4573799,
    					43.6636468
    				],
    				[
    					-79.4571725,
    					43.6635301
    				]
    			]
    		},
    		id: "way/220190125"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220917049",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4340885,
    					43.6601399
    				],
    				[
    					-79.4338204,
    					43.660197
    				],
    				[
    					-79.433037,
    					43.6603692
    				],
    				[
    					-79.4328882,
    					43.6604025
    				],
    				[
    					-79.4324799,
    					43.6604904
    				],
    				[
    					-79.4324044,
    					43.6605066
    				],
    				[
    					-79.4323339,
    					43.660522
    				],
    				[
    					-79.4316518,
    					43.6606719
    				],
    				[
    					-79.4310995,
    					43.6607926
    				],
    				[
    					-79.4304168,
    					43.6609428
    				]
    			]
    		},
    		id: "way/220917049"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220917050",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4353298,
    					43.6598693
    				],
    				[
    					-79.435173,
    					43.6599023
    				],
    				[
    					-79.4340885,
    					43.6601399
    				]
    			]
    		},
    		id: "way/220917050"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220917051",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4364439,
    					43.6596308
    				],
    				[
    					-79.436115,
    					43.6596982
    				],
    				[
    					-79.4354624,
    					43.6598414
    				],
    				[
    					-79.4353298,
    					43.6598693
    				]
    			]
    		},
    		id: "way/220917051"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220917052",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4347486,
    					43.6583345
    				],
    				[
    					-79.4346258,
    					43.6580132
    				],
    				[
    					-79.4345766,
    					43.6578883
    				],
    				[
    					-79.4344902,
    					43.6576527
    				],
    				[
    					-79.4343218,
    					43.6572177
    				],
    				[
    					-79.4342852,
    					43.6571284
    				],
    				[
    					-79.4342503,
    					43.6570366
    				],
    				[
    					-79.433951,
    					43.6562427
    				],
    				[
    					-79.4335856,
    					43.6552949
    				],
    				[
    					-79.4335564,
    					43.6552219
    				],
    				[
    					-79.4335235,
    					43.6551444
    				],
    				[
    					-79.4333485,
    					43.6546822
    				],
    				[
    					-79.4333097,
    					43.6545736
    				],
    				[
    					-79.4331817,
    					43.6542388
    				],
    				[
    					-79.4330472,
    					43.6538695
    				],
    				[
    					-79.4329523,
    					43.6536176
    				]
    			]
    		},
    		id: "way/220917052"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220917053",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4354967,
    					43.6602767
    				],
    				[
    					-79.435363,
    					43.659955
    				],
    				[
    					-79.4353298,
    					43.6598693
    				]
    			]
    		},
    		id: "way/220917053"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220917054",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4353298,
    					43.6598693
    				],
    				[
    					-79.435299,
    					43.6597897
    				],
    				[
    					-79.4349866,
    					43.6589547
    				],
    				[
    					-79.4347486,
    					43.6583345
    				]
    			]
    		},
    		id: "way/220917054"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220920359",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4427281,
    					43.6583512
    				],
    				[
    					-79.4425855,
    					43.6583813
    				],
    				[
    					-79.4416592,
    					43.6585759
    				]
    			]
    		},
    		id: "way/220920359"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220920361",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4416592,
    					43.6585759
    				],
    				[
    					-79.4408457,
    					43.6587465
    				],
    				[
    					-79.4407366,
    					43.6587678
    				],
    				[
    					-79.4403674,
    					43.6588414
    				],
    				[
    					-79.4397262,
    					43.658979
    				],
    				[
    					-79.4392449,
    					43.6590694
    				],
    				[
    					-79.4391445,
    					43.6590882
    				],
    				[
    					-79.4390594,
    					43.6591057
    				],
    				[
    					-79.4386532,
    					43.6591891
    				],
    				[
    					-79.4375936,
    					43.6594014
    				],
    				[
    					-79.4375231,
    					43.6594144
    				],
    				[
    					-79.4364439,
    					43.6596308
    				]
    			]
    		},
    		id: "way/220920361"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220920375",
    			hgv: "no",
    			"hgv:conditional": "no @ (19:00-7:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4430296,
    					43.6592273
    				],
    				[
    					-79.4429911,
    					43.6591244
    				],
    				[
    					-79.4428564,
    					43.6587794
    				]
    			]
    		},
    		id: "way/220920375"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220921559",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3974078,
    					43.6485371
    				],
    				[
    					-79.3965724,
    					43.6487084
    				],
    				[
    					-79.396467,
    					43.6487299
    				]
    			]
    		},
    		id: "way/220921559"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220921560",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3961085,
    					43.6478428
    				],
    				[
    					-79.3960709,
    					43.6477644
    				],
    				[
    					-79.3960314,
    					43.6476782
    				],
    				[
    					-79.3959066,
    					43.6473683
    				]
    			]
    		},
    		id: "way/220921560"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220923295",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.411474,
    					43.6456852
    				],
    				[
    					-79.4112547,
    					43.6457297
    				],
    				[
    					-79.4109411,
    					43.6457922
    				],
    				[
    					-79.410772,
    					43.6458261
    				],
    				[
    					-79.4100173,
    					43.6459804
    				],
    				[
    					-79.4099277,
    					43.6459994
    				],
    				[
    					-79.4098258,
    					43.6460211
    				],
    				[
    					-79.4095571,
    					43.6460731
    				],
    				[
    					-79.4085636,
    					43.6462748
    				],
    				[
    					-79.4076926,
    					43.6464517
    				],
    				[
    					-79.4073088,
    					43.6465292
    				],
    				[
    					-79.4066884,
    					43.6466548
    				],
    				[
    					-79.4065714,
    					43.6466777
    				],
    				[
    					-79.4064726,
    					43.6466977
    				],
    				[
    					-79.4058363,
    					43.6468261
    				],
    				[
    					-79.4051992,
    					43.6469539
    				]
    			]
    		},
    		id: "way/220923295"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220923296",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4150518,
    					43.6449562
    				],
    				[
    					-79.4139611,
    					43.6451805
    				]
    			]
    		},
    		id: "way/220923296"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220923297",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt",
    			"turn:lanes:forward": "none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4174836,
    					43.6444541
    				],
    				[
    					-79.4172699,
    					43.6445077
    				],
    				[
    					-79.4170426,
    					43.6445572
    				],
    				[
    					-79.4165657,
    					43.644653
    				],
    				[
    					-79.4163731,
    					43.6446923
    				],
    				[
    					-79.4162831,
    					43.64471
    				]
    			]
    		},
    		id: "way/220923297"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220923298",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.413191,
    					43.6453347
    				],
    				[
    					-79.4130934,
    					43.645356
    				],
    				[
    					-79.412283,
    					43.6455204
    				],
    				[
    					-79.411474,
    					43.6456852
    				]
    			]
    		},
    		id: "way/220923298"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220923299",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4139611,
    					43.6451805
    				],
    				[
    					-79.4133029,
    					43.6453136
    				],
    				[
    					-79.413191,
    					43.6453347
    				]
    			]
    		},
    		id: "way/220923299"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220955235",
    			"cycleway:right": "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4037195,
    					43.6464618
    				],
    				[
    					-79.4036855,
    					43.6463863
    				],
    				[
    					-79.4034907,
    					43.6459061
    				],
    				[
    					-79.4033309,
    					43.6455121
    				]
    			]
    		},
    		id: "way/220955235"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220955236",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "50",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4051992,
    					43.6469539
    				],
    				[
    					-79.4043864,
    					43.64712
    				],
    				[
    					-79.4041289,
    					43.6471777
    				],
    				[
    					-79.4040125,
    					43.647201
    				],
    				[
    					-79.4039923,
    					43.6472051
    				]
    			]
    		},
    		id: "way/220955236"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/220955237",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4019962,
    					43.6476107
    				],
    				[
    					-79.401547,
    					43.6476986
    				],
    				[
    					-79.4014183,
    					43.6477238
    				],
    				[
    					-79.4013116,
    					43.647745
    				],
    				[
    					-79.400944,
    					43.6478181
    				],
    				[
    					-79.4005874,
    					43.6478906
    				],
    				[
    					-79.4001457,
    					43.6479811
    				],
    				[
    					-79.3997777,
    					43.6480553
    				],
    				[
    					-79.3996628,
    					43.6480802
    				],
    				[
    					-79.3995717,
    					43.6480988
    				],
    				[
    					-79.3983856,
    					43.6483415
    				],
    				[
    					-79.398163,
    					43.6483853
    				],
    				[
    					-79.3974078,
    					43.6485371
    				]
    			]
    		},
    		id: "way/220955237"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/221091439",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4235922,
    					43.6432352
    				],
    				[
    					-79.4224647,
    					43.6434619
    				],
    				[
    					-79.4223723,
    					43.6434812
    				],
    				[
    					-79.4222802,
    					43.6434997
    				],
    				[
    					-79.4211719,
    					43.6437237
    				],
    				[
    					-79.4199938,
    					43.6439589
    				],
    				[
    					-79.4198649,
    					43.6439831
    				],
    				[
    					-79.4197409,
    					43.644003
    				],
    				[
    					-79.4195638,
    					43.6440282
    				]
    			]
    		},
    		id: "way/221091439"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/222151618",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.391433,
    					43.6543068
    				],
    				[
    					-79.3914127,
    					43.6543099
    				],
    				[
    					-79.3913759,
    					43.6543147
    				],
    				[
    					-79.3913594,
    					43.6543176
    				],
    				[
    					-79.3913392,
    					43.6543212
    				],
    				[
    					-79.3912357,
    					43.6543438
    				],
    				[
    					-79.3905934,
    					43.6544908
    				],
    				[
    					-79.3905484,
    					43.6544968
    				],
    				[
    					-79.3905148,
    					43.6544985
    				],
    				[
    					-79.3904723,
    					43.6544995
    				],
    				[
    					-79.3904255,
    					43.654497
    				],
    				[
    					-79.3903581,
    					43.6544923
    				],
    				[
    					-79.3903124,
    					43.6544866
    				],
    				[
    					-79.3902594,
    					43.6544812
    				],
    				[
    					-79.3902284,
    					43.6544799
    				],
    				[
    					-79.3901933,
    					43.6544808
    				],
    				[
    					-79.3901613,
    					43.6544834
    				],
    				[
    					-79.3901293,
    					43.6544876
    				],
    				[
    					-79.3900839,
    					43.6544942
    				],
    				[
    					-79.3897759,
    					43.6545606
    				],
    				[
    					-79.3892034,
    					43.6546832
    				],
    				[
    					-79.3889257,
    					43.6547428
    				],
    				[
    					-79.388644,
    					43.6548016
    				],
    				[
    					-79.388605,
    					43.6548063
    				],
    				[
    					-79.3885421,
    					43.6548113
    				],
    				[
    					-79.3884748,
    					43.6548125
    				]
    			]
    		},
    		id: "way/222151618"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/222151619",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3937353,
    					43.6538366
    				],
    				[
    					-79.3917345,
    					43.6542503
    				],
    				[
    					-79.391527,
    					43.6542932
    				]
    			]
    		},
    		id: "way/222151619"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/225299890",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Bloor Street West",
    			old_ref: "5",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3983126,
    					43.6678404
    				],
    				[
    					-79.3974981,
    					43.6680129
    				],
    				[
    					-79.3973948,
    					43.6680394
    				]
    			]
    		},
    		id: "way/225299890"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/229683187",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Queen's Park Crescent West",
    			note: "Solid white lines on approach to intersection. Unclear if this prohibits turning from the u-turn ramp to southbound Queen's Park to westbound College.",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3922058,
    					43.6613928
    				],
    				[
    					-79.3921125,
    					43.6612225
    				],
    				[
    					-79.3920526,
    					43.6611479
    				],
    				[
    					-79.3918572,
    					43.6609867
    				],
    				[
    					-79.3917718,
    					43.6609287
    				],
    				[
    					-79.3915993,
    					43.6608296
    				],
    				[
    					-79.3914569,
    					43.6607588
    				],
    				[
    					-79.3912347,
    					43.6606757
    				]
    			]
    		},
    		id: "way/229683187"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/232591811",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Spadina Avenue",
    			offpeaklanes: "3",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3946473,
    					43.6448391
    				],
    				[
    					-79.3947442,
    					43.645109
    				],
    				[
    					-79.3947842,
    					43.6452189
    				],
    				[
    					-79.3948543,
    					43.6454078
    				],
    				[
    					-79.3948806,
    					43.6454631
    				],
    				[
    					-79.3948888,
    					43.6454809
    				],
    				[
    					-79.3948918,
    					43.6454874
    				],
    				[
    					-79.3948932,
    					43.6454905
    				]
    			]
    		},
    		id: "way/232591811"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/232591812",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3948932,
    					43.6454905
    				],
    				[
    					-79.3948983,
    					43.6455015
    				],
    				[
    					-79.3949012,
    					43.6455077
    				],
    				[
    					-79.3949111,
    					43.6455293
    				],
    				[
    					-79.3949397,
    					43.645585
    				],
    				[
    					-79.3949898,
    					43.6457096
    				],
    				[
    					-79.3951015,
    					43.6459761
    				],
    				[
    					-79.3952182,
    					43.6462449
    				]
    			]
    		},
    		id: "way/232591812"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/232593626",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:advisory": "25",
    			name: "Spadina Crescent",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4002292,
    					43.6591858
    				],
    				[
    					-79.400195,
    					43.6592086
    				],
    				[
    					-79.4000893,
    					43.6592754
    				],
    				[
    					-79.4000348,
    					43.6593204
    				],
    				[
    					-79.399984,
    					43.6593736
    				],
    				[
    					-79.3999336,
    					43.6594423
    				],
    				[
    					-79.3998885,
    					43.6595248
    				],
    				[
    					-79.3998731,
    					43.6595784
    				],
    				[
    					-79.3998588,
    					43.6596603
    				],
    				[
    					-79.3998569,
    					43.659703
    				],
    				[
    					-79.3998626,
    					43.6597694
    				],
    				[
    					-79.3998872,
    					43.6598302
    				],
    				[
    					-79.3999353,
    					43.6599387
    				],
    				[
    					-79.4000169,
    					43.6600347
    				],
    				[
    					-79.4000679,
    					43.6600842
    				],
    				[
    					-79.4001308,
    					43.6601271
    				],
    				[
    					-79.4001932,
    					43.6601631
    				],
    				[
    					-79.4002612,
    					43.6601932
    				],
    				[
    					-79.4003846,
    					43.6602408
    				],
    				[
    					-79.4004891,
    					43.6602768
    				],
    				[
    					-79.4005635,
    					43.6602974
    				],
    				[
    					-79.4006029,
    					43.6603115
    				]
    			]
    		},
    		id: "way/232593626"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/232906759",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Lower Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3917817,
    					43.6377686
    				],
    				[
    					-79.3918082,
    					43.6378308
    				],
    				[
    					-79.3920286,
    					43.638348
    				],
    				[
    					-79.3920507,
    					43.6383876
    				],
    				[
    					-79.3920828,
    					43.6384431
    				],
    				[
    					-79.3921002,
    					43.638473
    				],
    				[
    					-79.3921328,
    					43.6385407
    				]
    			]
    		},
    		id: "way/232906759"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/234365457",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Bloor Street West",
    			old_ref: "5",
    			"parking:condition:right": "no_stopping",
    			"parking:condition:right:time_interval": "Mo-Fr 07:30-09:30",
    			"parking:lane:right": "no_parking",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4030894,
    					43.6668199
    				],
    				[
    					-79.402679,
    					43.6669125
    				],
    				[
    					-79.401604,
    					43.667147
    				],
    				[
    					-79.401515,
    					43.6671653
    				],
    				[
    					-79.4014084,
    					43.6671886
    				],
    				[
    					-79.4005525,
    					43.6673555
    				],
    				[
    					-79.3999132,
    					43.6674884
    				],
    				[
    					-79.3998167,
    					43.6675107
    				]
    			]
    		},
    		id: "way/234365457"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/234733017",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:forward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.390562,
    					43.6694841
    				],
    				[
    					-79.3896308,
    					43.6696895
    				],
    				[
    					-79.3894689,
    					43.6697241
    				]
    			]
    		},
    		id: "way/234733017"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/239374129",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4439861,
    					43.6580854
    				],
    				[
    					-79.4428877,
    					43.6583164
    				],
    				[
    					-79.4427281,
    					43.6583512
    				]
    			]
    		},
    		id: "way/239374129"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/240852334",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			name: "Front Street West",
    			sidewalk: "both",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3905643,
    					43.6435419
    				],
    				[
    					-79.3899508,
    					43.6436914
    				]
    			]
    		},
    		id: "way/240852334"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/240852335",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			name: "Front Street West",
    			sidewalk: "both",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3893112,
    					43.6438307
    				],
    				[
    					-79.3887717,
    					43.6439577
    				],
    				[
    					-79.3886554,
    					43.6439841
    				]
    			]
    		},
    		id: "way/240852335"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/242973006",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park Crescent East",
    			note: "Left lane Queen's Park Southbound/Hoskin Ave",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3911404,
    					43.6648629
    				],
    				[
    					-79.3912421,
    					43.6651031
    				],
    				[
    					-79.3913965,
    					43.6654756
    				],
    				[
    					-79.3914655,
    					43.6655987
    				],
    				[
    					-79.3915525,
    					43.6657069
    				],
    				[
    					-79.3916111,
    					43.6657633
    				],
    				[
    					-79.3917073,
    					43.6658378
    				],
    				[
    					-79.3917516,
    					43.665867
    				],
    				[
    					-79.3918763,
    					43.6659368
    				],
    				[
    					-79.3919479,
    					43.6659686
    				],
    				[
    					-79.3920457,
    					43.6659995
    				],
    				[
    					-79.3921691,
    					43.6660322
    				],
    				[
    					-79.3923463,
    					43.666059
    				],
    				[
    					-79.3924596,
    					43.6660668
    				],
    				[
    					-79.392493,
    					43.6660672
    				]
    			]
    		},
    		id: "way/242973006"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/244093699",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3943861,
    					43.6693588
    				],
    				[
    					-79.3943593,
    					43.6692862
    				],
    				[
    					-79.3941753,
    					43.6688124
    				],
    				[
    					-79.3941295,
    					43.6687016
    				]
    			]
    		},
    		id: "way/244093699"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/244248087",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Queen's Park",
    			old_ref: "11A",
    			surface: "asphalt",
    			"turn:lanes:forward": "none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3939413,
    					43.668237
    				],
    				[
    					-79.3940904,
    					43.6686046
    				],
    				[
    					-79.3941295,
    					43.6687016
    				]
    			]
    		},
    		id: "way/244248087"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/246541249",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4593086,
    					43.6744349
    				],
    				[
    					-79.4599098,
    					43.6742945
    				],
    				[
    					-79.4600226,
    					43.6742781
    				]
    			]
    		},
    		id: "way/246541249"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/246541253",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.459962,
    					43.6741413
    				],
    				[
    					-79.4598542,
    					43.6741586
    				],
    				[
    					-79.4594612,
    					43.674246
    				],
    				[
    					-79.4592002,
    					43.67432
    				],
    				[
    					-79.4589386,
    					43.674385
    				],
    				[
    					-79.4582877,
    					43.6745292
    				],
    				[
    					-79.4577041,
    					43.6746473
    				],
    				[
    					-79.4576017,
    					43.6746661
    				],
    				[
    					-79.4574938,
    					43.6746823
    				],
    				[
    					-79.4566149,
    					43.6748831
    				],
    				[
    					-79.4561105,
    					43.6749924
    				]
    			]
    		},
    		id: "way/246541253"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/249143333",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4423718,
    					43.6781691
    				],
    				[
    					-79.442963,
    					43.6780507
    				],
    				[
    					-79.4430846,
    					43.6780214
    				]
    			]
    		},
    		id: "way/249143333"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/249143334",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4387327,
    					43.6788338
    				],
    				[
    					-79.438491,
    					43.6788808
    				],
    				[
    					-79.4380415,
    					43.6789778
    				],
    				[
    					-79.4376605,
    					43.6790823
    				],
    				[
    					-79.4367798,
    					43.6792807
    				]
    			]
    		},
    		id: "way/249143334"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/249143335",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4396419,
    					43.6786367
    				],
    				[
    					-79.4388311,
    					43.6788139
    				],
    				[
    					-79.4387327,
    					43.6788338
    				]
    			]
    		},
    		id: "way/249143335"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/250909644",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4516607,
    					43.6564884
    				],
    				[
    					-79.4522774,
    					43.6563604
    				],
    				[
    					-79.4524285,
    					43.6563293
    				],
    				[
    					-79.4524425,
    					43.6563264
    				]
    			]
    		},
    		id: "way/250909644"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/250909645",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4522458,
    					43.6555495
    				],
    				[
    					-79.4521417,
    					43.6551386
    				],
    				[
    					-79.4521141,
    					43.655032
    				],
    				[
    					-79.4520606,
    					43.6548291
    				],
    				[
    					-79.4519466,
    					43.6543879
    				]
    			]
    		},
    		id: "way/250909645"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/251386507",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Spadina Road",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4052902,
    					43.6703042
    				],
    				[
    					-79.404778,
    					43.6690296
    				],
    				[
    					-79.4047557,
    					43.668979
    				]
    			]
    		},
    		id: "way/251386507"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/252080341",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3997064,
    					43.657419
    				],
    				[
    					-79.3997252,
    					43.6574636
    				],
    				[
    					-79.3998826,
    					43.6578364
    				],
    				[
    					-79.3998961,
    					43.6578738
    				],
    				[
    					-79.399911,
    					43.657916
    				],
    				[
    					-79.3999165,
    					43.6579316
    				]
    			]
    		},
    		id: "way/252080341"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/252080342",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4003665,
    					43.6584913
    				],
    				[
    					-79.400201,
    					43.658073
    				],
    				[
    					-79.4001776,
    					43.6580156
    				],
    				[
    					-79.4001616,
    					43.657974
    				],
    				[
    					-79.4001602,
    					43.6579702
    				],
    				[
    					-79.4001546,
    					43.6579539
    				]
    			]
    		},
    		id: "way/252080342"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/256259848",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3977327,
    					43.6775853
    				],
    				[
    					-79.3975786,
    					43.6772071
    				]
    			]
    		},
    		id: "way/256259848"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/256259849",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3973841,
    					43.6766912
    				],
    				[
    					-79.3972497,
    					43.6763676
    				]
    			]
    		},
    		id: "way/256259849"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/256426438",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3911105,
    					43.6734362
    				],
    				[
    					-79.39107,
    					43.6733888
    				],
    				[
    					-79.3910214,
    					43.6733362
    				]
    			]
    		},
    		id: "way/256426438"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/259669509",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4280953,
    					43.6495343
    				],
    				[
    					-79.4267744,
    					43.6494958
    				]
    			]
    		},
    		id: "way/259669509"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/259669510",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4159629,
    					43.6502861
    				],
    				[
    					-79.4158879,
    					43.650302
    				],
    				[
    					-79.4149337,
    					43.6504926
    				],
    				[
    					-79.4140419,
    					43.6506725
    				],
    				[
    					-79.4139713,
    					43.6506878
    				],
    				[
    					-79.4139012,
    					43.6507022
    				],
    				[
    					-79.4138351,
    					43.6507154
    				],
    				[
    					-79.4135051,
    					43.6507822
    				],
    				[
    					-79.4133902,
    					43.6508054
    				],
    				[
    					-79.4128027,
    					43.6509244
    				],
    				[
    					-79.4121946,
    					43.6510454
    				],
    				[
    					-79.411589,
    					43.6511691
    				],
    				[
    					-79.4113875,
    					43.6512094
    				],
    				[
    					-79.4111245,
    					43.6512632
    				],
    				[
    					-79.4110182,
    					43.6512835
    				],
    				[
    					-79.410909,
    					43.6513061
    				],
    				[
    					-79.4108458,
    					43.6513184
    				],
    				[
    					-79.4103215,
    					43.6514251
    				],
    				[
    					-79.4097068,
    					43.6515482
    				],
    				[
    					-79.4090879,
    					43.6516762
    				],
    				[
    					-79.408476,
    					43.6518015
    				],
    				[
    					-79.4084014,
    					43.6518159
    				],
    				[
    					-79.4077876,
    					43.6519415
    				],
    				[
    					-79.4072353,
    					43.6520538
    				],
    				[
    					-79.4066031,
    					43.6521756
    				],
    				[
    					-79.4064248,
    					43.6522126
    				],
    				[
    					-79.4061372,
    					43.652278
    				],
    				[
    					-79.4061235,
    					43.6522808
    				],
    				[
    					-79.4061112,
    					43.6522833
    				],
    				[
    					-79.4060328,
    					43.6522994
    				],
    				[
    					-79.4060113,
    					43.6523038
    				],
    				[
    					-79.4059943,
    					43.6523075
    				],
    				[
    					-79.4058993,
    					43.6523277
    				],
    				[
    					-79.4058883,
    					43.65233
    				],
    				[
    					-79.4055879,
    					43.6523896
    				],
    				[
    					-79.4055397,
    					43.6523966
    				],
    				[
    					-79.4054997,
    					43.6523968
    				],
    				[
    					-79.4054551,
    					43.6523959
    				],
    				[
    					-79.4054068,
    					43.6523903
    				],
    				[
    					-79.4053681,
    					43.6523809
    				],
    				[
    					-79.4053066,
    					43.6523616
    				],
    				[
    					-79.4052472,
    					43.6523366
    				],
    				[
    					-79.4049852,
    					43.6522193
    				]
    			]
    		},
    		id: "way/259669510"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/259669710",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4298086,
    					43.6495843
    				],
    				[
    					-79.4296697,
    					43.6495804
    				],
    				[
    					-79.4280953,
    					43.6495343
    				]
    			]
    		},
    		id: "way/259669710"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/261943373",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			note: "Left turn lane is really u turn lane",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3969301,
    					43.650424
    				],
    				[
    					-79.3969559,
    					43.6504957
    				],
    				[
    					-79.3971047,
    					43.6508531
    				],
    				[
    					-79.3971245,
    					43.6509108
    				]
    			]
    		},
    		id: "way/261943373"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/262307480",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4017726,
    					43.6625341
    				],
    				[
    					-79.4019553,
    					43.663004
    				],
    				[
    					-79.4019942,
    					43.663091
    				]
    			]
    		},
    		id: "way/262307480"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/263506114",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3957571,
    					43.6587321
    				],
    				[
    					-79.3956865,
    					43.6587412
    				],
    				[
    					-79.3955775,
    					43.6587583
    				],
    				[
    					-79.3954602,
    					43.6587782
    				],
    				[
    					-79.3952819,
    					43.6588154
    				],
    				[
    					-79.3949526,
    					43.658885
    				],
    				[
    					-79.3946815,
    					43.6589437
    				],
    				[
    					-79.394055,
    					43.6590787
    				],
    				[
    					-79.3935979,
    					43.6591782
    				],
    				[
    					-79.3935013,
    					43.6591993
    				],
    				[
    					-79.393416,
    					43.6592173
    				],
    				[
    					-79.3933992,
    					43.6592209
    				],
    				[
    					-79.3930818,
    					43.6592894
    				],
    				[
    					-79.3917963,
    					43.6595623
    				],
    				[
    					-79.3912771,
    					43.6596723
    				],
    				[
    					-79.3907187,
    					43.6597969
    				],
    				[
    					-79.3905908,
    					43.6598263
    				]
    			]
    		},
    		id: "way/263506114"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/263506115",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3970034,
    					43.6584942
    				],
    				[
    					-79.3962384,
    					43.6586464
    				],
    				[
    					-79.396206,
    					43.6586535
    				],
    				[
    					-79.3959848,
    					43.6586959
    				]
    			]
    		},
    		id: "way/263506115"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/265973706",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.411829,
    					43.6736881
    				],
    				[
    					-79.4104978,
    					43.6739637
    				]
    			]
    		},
    		id: "way/265973706"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/269738823",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt",
    			"turn:lanes:forward": "left;through||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3946144,
    					43.6699282
    				],
    				[
    					-79.3944781,
    					43.6695958
    				]
    			]
    		},
    		id: "way/269738823"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/272209190",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.441004,
    					43.6353655
    				],
    				[
    					-79.439244,
    					43.6345913
    				],
    				[
    					-79.4384388,
    					43.6342446
    				],
    				[
    					-79.4380914,
    					43.6340875
    				]
    			]
    		},
    		id: "way/272209190"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/272209191",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.441004,
    					43.6353655
    				],
    				[
    					-79.4411477,
    					43.6354824
    				],
    				[
    					-79.441765,
    					43.635741
    				],
    				[
    					-79.4420982,
    					43.6358489
    				]
    			]
    		},
    		id: "way/272209191"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/272209192",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			"parking:lane:left": "no_stopping",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4379442,
    					43.6340194
    				],
    				[
    					-79.4377914,
    					43.6338981
    				],
    				[
    					-79.4376431,
    					43.6337954
    				],
    				[
    					-79.4375052,
    					43.6337109
    				],
    				[
    					-79.4374037,
    					43.6336439
    				],
    				[
    					-79.4372905,
    					43.6335649
    				],
    				[
    					-79.4370768,
    					43.6334049
    				],
    				[
    					-79.4365485,
    					43.6329781
    				],
    				[
    					-79.4365315,
    					43.6329611
    				],
    				[
    					-79.4363569,
    					43.6328437
    				],
    				[
    					-79.4361903,
    					43.6327465
    				],
    				[
    					-79.4360045,
    					43.6326559
    				],
    				[
    					-79.4357196,
    					43.6325316
    				],
    				[
    					-79.4354412,
    					43.6324267
    				],
    				[
    					-79.4351248,
    					43.6323152
    				],
    				[
    					-79.4347333,
    					43.6321972
    				],
    				[
    					-79.4343966,
    					43.6321157
    				],
    				[
    					-79.4337618,
    					43.632011
    				]
    			]
    		},
    		id: "way/272209192"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/273616351",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4525885,
    					43.6568714
    				],
    				[
    					-79.4525694,
    					43.6567987
    				],
    				[
    					-79.4525588,
    					43.6567567
    				]
    			]
    		},
    		id: "way/273616351"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/273616352",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4526586,
    					43.6571362
    				],
    				[
    					-79.4526254,
    					43.657011
    				],
    				[
    					-79.4525885,
    					43.6568714
    				]
    			]
    		},
    		id: "way/273616352"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/273616353",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4524425,
    					43.6563264
    				],
    				[
    					-79.452418,
    					43.6562277
    				],
    				[
    					-79.4523333,
    					43.6558894
    				],
    				[
    					-79.4522458,
    					43.6555495
    				]
    			]
    		},
    		id: "way/273616353"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/274571697",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4505399,
    					43.6762155
    				],
    				[
    					-79.4505261,
    					43.6762186
    				],
    				[
    					-79.4504287,
    					43.6762394
    				],
    				[
    					-79.4493877,
    					43.6764772
    				]
    			]
    		},
    		id: "way/274571697"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/274571698",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4481098,
    					43.6767743
    				],
    				[
    					-79.4474931,
    					43.6768972
    				],
    				[
    					-79.4473937,
    					43.6769195
    				]
    			]
    		},
    		id: "way/274571698"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/274572003",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4503755,
    					43.6758354
    				],
    				[
    					-79.449171,
    					43.6728564
    				],
    				[
    					-79.4491312,
    					43.6727572
    				],
    				[
    					-79.4490947,
    					43.6726654
    				],
    				[
    					-79.4490773,
    					43.6726257
    				],
    				[
    					-79.4490491,
    					43.6725956
    				],
    				[
    					-79.4489942,
    					43.6725822
    				],
    				[
    					-79.4488976,
    					43.6725781
    				],
    				[
    					-79.4488037,
    					43.6725704
    				],
    				[
    					-79.4487351,
    					43.6725486
    				],
    				[
    					-79.4486897,
    					43.6725248
    				],
    				[
    					-79.4486369,
    					43.6724853
    				],
    				[
    					-79.4485993,
    					43.6724465
    				],
    				[
    					-79.4485703,
    					43.6723919
    				],
    				[
    					-79.4482972,
    					43.6717591
    				],
    				[
    					-79.4482677,
    					43.6716592
    				],
    				[
    					-79.4482648,
    					43.6716078
    				],
    				[
    					-79.4482786,
    					43.6715638
    				]
    			]
    		},
    		id: "way/274572003"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/274572008",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.449848,
    					43.6765
    				],
    				[
    					-79.4500914,
    					43.6764636
    				],
    				[
    					-79.4504847,
    					43.6763784
    				],
    				[
    					-79.4506001,
    					43.6763519
    				]
    			]
    		},
    		id: "way/274572008"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/274572010",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4547904,
    					43.6754355
    				],
    				[
    					-79.4549082,
    					43.6754109
    				],
    				[
    					-79.4559174,
    					43.6751823
    				]
    			]
    		},
    		id: "way/274572010"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/274572013",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4547401,
    					43.6752928
    				],
    				[
    					-79.4546179,
    					43.6753158
    				],
    				[
    					-79.4541449,
    					43.6754209
    				],
    				[
    					-79.4535119,
    					43.6755727
    				],
    				[
    					-79.4511781,
    					43.6760882
    				]
    			]
    		},
    		id: "way/274572013"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/274572015",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4506001,
    					43.6763519
    				],
    				[
    					-79.4507069,
    					43.6763276
    				],
    				[
    					-79.4511824,
    					43.676225
    				],
    				[
    					-79.451649,
    					43.6761119
    				],
    				[
    					-79.4521293,
    					43.6760044
    				],
    				[
    					-79.4534967,
    					43.6757088
    				],
    				[
    					-79.4539297,
    					43.6756163
    				]
    			]
    		},
    		id: "way/274572015"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/277877819",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3999165,
    					43.6579316
    				],
    				[
    					-79.3998673,
    					43.6579318
    				],
    				[
    					-79.3998144,
    					43.6579383
    				],
    				[
    					-79.399658,
    					43.6579662
    				],
    				[
    					-79.398963,
    					43.6581045
    				],
    				[
    					-79.398246,
    					43.6582482
    				],
    				[
    					-79.3981663,
    					43.6582629
    				],
    				[
    					-79.3980977,
    					43.6582776
    				],
    				[
    					-79.3970034,
    					43.6584942
    				]
    			]
    		},
    		id: "way/277877819"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/278877435",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Yonge Street",
    			old_ref: "11",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3892377,
    					43.6762622
    				],
    				[
    					-79.3894898,
    					43.6768745
    				],
    				[
    					-79.389527,
    					43.67696
    				],
    				[
    					-79.3895698,
    					43.6770574
    				],
    				[
    					-79.3896967,
    					43.6773782
    				],
    				[
    					-79.3898882,
    					43.6778425
    				],
    				[
    					-79.3899896,
    					43.6781103
    				],
    				[
    					-79.390032,
    					43.6782031
    				],
    				[
    					-79.3900655,
    					43.6782843
    				],
    				[
    					-79.3903897,
    					43.6790714
    				],
    				[
    					-79.3904088,
    					43.6791178
    				],
    				[
    					-79.3904464,
    					43.6792117
    				],
    				[
    					-79.3907147,
    					43.6798799
    				],
    				[
    					-79.3908586,
    					43.6802663
    				],
    				[
    					-79.3909196,
    					43.6804302
    				],
    				[
    					-79.390948,
    					43.6805064
    				]
    			]
    		},
    		id: "way/278877435"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/278877442",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Yonge Street",
    			old_ref: "11",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3889507,
    					43.6755867
    				],
    				[
    					-79.389077,
    					43.6758839
    				],
    				[
    					-79.3892377,
    					43.6762622
    				]
    			]
    		},
    		id: "way/278877442"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/279188366",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			maxspeed: "60",
    			name: "The Queensway",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4595764,
    					43.6396103
    				],
    				[
    					-79.4598009,
    					43.6395771
    				],
    				[
    					-79.4599017,
    					43.6395652
    				],
    				[
    					-79.4607827,
    					43.6394199
    				],
    				[
    					-79.4611995,
    					43.6393399
    				],
    				[
    					-79.4616047,
    					43.6392501
    				],
    				[
    					-79.4620058,
    					43.6391558
    				],
    				[
    					-79.4624041,
    					43.6390519
    				],
    				[
    					-79.4632226,
    					43.6388137
    				],
    				[
    					-79.4642709,
    					43.638488
    				],
    				[
    					-79.465275,
    					43.6382006
    				],
    				[
    					-79.4664175,
    					43.6379105
    				],
    				[
    					-79.4665408,
    					43.637885
    				]
    			]
    		},
    		id: "way/279188366"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/279188367",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "3",
    			maxspeed: "60",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4609213,
    					43.639205
    				],
    				[
    					-79.4602381,
    					43.6393267
    				],
    				[
    					-79.4597422,
    					43.6394032
    				],
    				[
    					-79.4596739,
    					43.639414
    				],
    				[
    					-79.459421,
    					43.6394517
    				]
    			]
    		},
    		id: "way/279188367"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/279188369",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "3",
    			maxspeed: "60",
    			name: "The Queensway",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4579299,
    					43.6397666
    				],
    				[
    					-79.4583549,
    					43.6397337
    				],
    				[
    					-79.458943,
    					43.6396875
    				],
    				[
    					-79.459314,
    					43.6396447
    				],
    				[
    					-79.4595764,
    					43.6396103
    				]
    			]
    		},
    		id: "way/279188369"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/279188372",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			maxspeed: "60",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.459421,
    					43.6394517
    				],
    				[
    					-79.4592147,
    					43.6394733
    				],
    				[
    					-79.458974,
    					43.6395026
    				],
    				[
    					-79.4584929,
    					43.6395524
    				],
    				[
    					-79.4580444,
    					43.6395834
    				],
    				[
    					-79.4576083,
    					43.6396078
    				],
    				[
    					-79.4572312,
    					43.6396191
    				],
    				[
    					-79.4565385,
    					43.6396193
    				],
    				[
    					-79.4541661,
    					43.639624
    				]
    			]
    		},
    		id: "way/279188372"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/279192514",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.459166,
    					43.6379593
    				],
    				[
    					-79.4596663,
    					43.6378466
    				],
    				[
    					-79.4599145,
    					43.6378006
    				],
    				[
    					-79.4600936,
    					43.6377682
    				],
    				[
    					-79.4603404,
    					43.6377402
    				],
    				[
    					-79.4605861,
    					43.6377292
    				],
    				[
    					-79.4611674,
    					43.6377349
    				],
    				[
    					-79.461346,
    					43.637729
    				],
    				[
    					-79.4616036,
    					43.6377095
    				],
    				[
    					-79.46181,
    					43.6376897
    				],
    				[
    					-79.4620325,
    					43.6376523
    				],
    				[
    					-79.4622207,
    					43.6376107
    				],
    				[
    					-79.462432,
    					43.6375602
    				],
    				[
    					-79.4626238,
    					43.6375028
    				],
    				[
    					-79.4628653,
    					43.6374172
    				],
    				[
    					-79.4630749,
    					43.6373288
    				]
    			]
    		},
    		id: "way/279192514"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/280025734",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3947943,
    					43.6750905
    				],
    				[
    					-79.3945131,
    					43.6751475
    				],
    				[
    					-79.3942881,
    					43.6751769
    				],
    				[
    					-79.3940715,
    					43.6751777
    				],
    				[
    					-79.3939468,
    					43.6751687
    				],
    				[
    					-79.3938293,
    					43.6751497
    				],
    				[
    					-79.3938081,
    					43.6751435
    				],
    				[
    					-79.393611,
    					43.6750933
    				]
    			]
    		},
    		id: "way/280025734"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/280655992",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4104978,
    					43.6739637
    				],
    				[
    					-79.4095922,
    					43.6741512
    				],
    				[
    					-79.4093431,
    					43.6742473
    				]
    			]
    		},
    		id: "way/280655992"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/280655993",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			name: "Dupont Street",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes:backward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4070608,
    					43.6748668
    				],
    				[
    					-79.4069628,
    					43.6748893
    				],
    				[
    					-79.406476,
    					43.6749839
    				]
    			]
    		},
    		id: "way/280655993"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/280655994",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			name: "Dupont Street",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes:forward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4076741,
    					43.6747418
    				],
    				[
    					-79.4071738,
    					43.674845
    				],
    				[
    					-79.4070608,
    					43.6748668
    				]
    			]
    		},
    		id: "way/280655994"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/280655995",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4093431,
    					43.6742473
    				],
    				[
    					-79.4090737,
    					43.6744032
    				],
    				[
    					-79.4087644,
    					43.6745175
    				],
    				[
    					-79.4082452,
    					43.6746209
    				]
    			]
    		},
    		id: "way/280655995"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/282526915",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			"parking:condition:right": "no_stopping",
    			"parking:condition:right:2": "ticket",
    			"parking:condition:right:2:time_interval": "Mo-Fr 09:00-21:00; Sa 08:00-21:00; Su 13:00-21:00",
    			"parking:condition:right:time_interval": "Mo-Fr 07:00-09:00",
    			"parking:lane:right": "parallel",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4366482,
    					43.6405896
    				],
    				[
    					-79.4365439,
    					43.6406114
    				],
    				[
    					-79.4359496,
    					43.6407323
    				],
    				[
    					-79.4354209,
    					43.6408412
    				],
    				[
    					-79.4346106,
    					43.6410028
    				],
    				[
    					-79.4345033,
    					43.641025
    				],
    				[
    					-79.4344368,
    					43.6410389
    				],
    				[
    					-79.4342221,
    					43.6410845
    				],
    				[
    					-79.4341382,
    					43.6411024
    				],
    				[
    					-79.433709,
    					43.6411895
    				],
    				[
    					-79.4331219,
    					43.6413085
    				],
    				[
    					-79.4324148,
    					43.6414533
    				],
    				[
    					-79.4323405,
    					43.6414673
    				],
    				[
    					-79.4322654,
    					43.6414819
    				],
    				[
    					-79.4315775,
    					43.6416218
    				],
    				[
    					-79.4302328,
    					43.6418922
    				],
    				[
    					-79.4300912,
    					43.6419201
    				],
    				[
    					-79.4296983,
    					43.641998
    				],
    				[
    					-79.4287844,
    					43.642185
    				],
    				[
    					-79.4286129,
    					43.6422201
    				]
    			]
    		},
    		id: "way/282526915"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/282526916",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4372577,
    					43.6404653
    				],
    				[
    					-79.4367646,
    					43.6405659
    				],
    				[
    					-79.4366482,
    					43.6405896
    				]
    			]
    		},
    		id: "way/282526916"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/283881280",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.463273,
    					43.6654009
    				],
    				[
    					-79.4622718,
    					43.6653841
    				],
    				[
    					-79.4619743,
    					43.6653629
    				],
    				[
    					-79.4616981,
    					43.6653263
    				],
    				[
    					-79.4613607,
    					43.6652557
    				],
    				[
    					-79.4610712,
    					43.6651803
    				],
    				[
    					-79.4609846,
    					43.6651572
    				],
    				[
    					-79.4606242,
    					43.6650599
    				],
    				[
    					-79.4602827,
    					43.6649699
    				],
    				[
    					-79.4599432,
    					43.6648817
    				],
    				[
    					-79.4594321,
    					43.6647425
    				],
    				[
    					-79.4592589,
    					43.6646906
    				]
    			]
    		},
    		id: "way/283881280"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/285248539",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3970285,
    					43.6531611
    				],
    				[
    					-79.3962233,
    					43.6533252
    				],
    				[
    					-79.3961436,
    					43.6533414
    				],
    				[
    					-79.3960694,
    					43.6533566
    				],
    				[
    					-79.3955503,
    					43.6534641
    				],
    				[
    					-79.3945349,
    					43.6536684
    				],
    				[
    					-79.3939334,
    					43.6537945
    				]
    			]
    		},
    		id: "way/285248539"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/285742338",
    			bicycle: "yes",
    			foot: "yes",
    			highway: "secondary",
    			horse: "yes",
    			lanes: "3",
    			"lanes:backward": "1",
    			"lanes:forward": "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bay Street",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3906718,
    					43.6730501
    				],
    				[
    					-79.3906163,
    					43.6731197
    				]
    			]
    		},
    		id: "way/285742338"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/285742339",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3901601,
    					43.6729915
    				],
    				[
    					-79.3903199,
    					43.673036
    				],
    				[
    					-79.3904732,
    					43.6730737
    				],
    				[
    					-79.3905094,
    					43.6730827
    				],
    				[
    					-79.3906163,
    					43.6731197
    				]
    			]
    		},
    		id: "way/285742339"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/285742340",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			oneway: "yes",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3906163,
    					43.6731197
    				],
    				[
    					-79.3906957,
    					43.6731568
    				],
    				[
    					-79.3907833,
    					43.6732037
    				],
    				[
    					-79.390944,
    					43.6733184
    				],
    				[
    					-79.3910214,
    					43.6733362
    				]
    			]
    		},
    		id: "way/285742340"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/285742341",
    			"bicycle:lanes": "yes|designated|yes",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			"motor_vehicle:lanes": "yes|no|yes",
    			name: "Davenport Road",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "through|through|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3910214,
    					43.6733362
    				],
    				[
    					-79.3909986,
    					43.6732589
    				],
    				[
    					-79.3908729,
    					43.6731618
    				],
    				[
    					-79.3908474,
    					43.6731452
    				],
    				[
    					-79.3907511,
    					43.6730889
    				]
    			]
    		},
    		id: "way/285742341"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/296783426",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4058065,
    					43.6517801
    				],
    				[
    					-79.4056515,
    					43.6513982
    				],
    				[
    					-79.4056191,
    					43.6513204
    				],
    				[
    					-79.405599,
    					43.6512667
    				],
    				[
    					-79.4049921,
    					43.6497559
    				],
    				[
    					-79.4048951,
    					43.6495129
    				],
    				[
    					-79.4047168,
    					43.6490665
    				],
    				[
    					-79.4047031,
    					43.6490324
    				],
    				[
    					-79.4046804,
    					43.648977
    				]
    			]
    		},
    		id: "way/296783426"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/296783427",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4077058,
    					43.6564736
    				],
    				[
    					-79.4077006,
    					43.6564604
    				],
    				[
    					-79.4076766,
    					43.6563999
    				],
    				[
    					-79.4076617,
    					43.6563599
    				],
    				[
    					-79.4075312,
    					43.6560348
    				],
    				[
    					-79.4068505,
    					43.6543575
    				],
    				[
    					-79.4068248,
    					43.654295
    				]
    			]
    		},
    		id: "way/296783427"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/296783428",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.405093,
    					43.6569789
    				],
    				[
    					-79.4050183,
    					43.6569939
    				],
    				[
    					-79.4044973,
    					43.657097
    				],
    				[
    					-79.4040308,
    					43.6571876
    				],
    				[
    					-79.403757,
    					43.6572397
    				],
    				[
    					-79.4032394,
    					43.6573411
    				],
    				[
    					-79.4031624,
    					43.6573562
    				],
    				[
    					-79.4030822,
    					43.6573719
    				],
    				[
    					-79.402924,
    					43.6574028
    				],
    				[
    					-79.4027712,
    					43.6574338
    				],
    				[
    					-79.4023227,
    					43.6575258
    				],
    				[
    					-79.4018902,
    					43.6576151
    				]
    			]
    		},
    		id: "way/296783428"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/297550080",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Spadina Road",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4060065,
    					43.6721868
    				],
    				[
    					-79.4059755,
    					43.6721082
    				],
    				[
    					-79.4054281,
    					43.6706571
    				],
    				[
    					-79.4052902,
    					43.6703042
    				]
    			]
    		},
    		id: "way/297550080"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/298213456",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxheight: "4",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4451442,
    					43.6578389
    				],
    				[
    					-79.4451977,
    					43.6578468
    				],
    				[
    					-79.4453117,
    					43.6578216
    				],
    				[
    					-79.4453504,
    					43.6577913
    				]
    			]
    		},
    		id: "way/298213456"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/298213457",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4451442,
    					43.6578389
    				],
    				[
    					-79.4439861,
    					43.6580854
    				]
    			]
    		},
    		id: "way/298213457"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/298931955",
    			bicycle: "yes",
    			cycleway: "lane",
    			foot: "yes",
    			highway: "secondary",
    			horse: "yes",
    			lanes: "1",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bay Street",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3907511,
    					43.6730889
    				],
    				[
    					-79.3907965,
    					43.6730147
    				],
    				[
    					-79.3908106,
    					43.6729836
    				],
    				[
    					-79.3908294,
    					43.6728985
    				],
    				[
    					-79.3908295,
    					43.6727911
    				],
    				[
    					-79.3907815,
    					43.6726561
    				],
    				[
    					-79.3907028,
    					43.6725823
    				]
    			]
    		},
    		id: "way/298931955"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/301176835",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Front Street West",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3912375,
    					43.6434192
    				],
    				[
    					-79.3911267,
    					43.6434413
    				],
    				[
    					-79.3905643,
    					43.6435419
    				]
    			]
    		},
    		id: "way/301176835"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/302152089",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3925136,
    					43.6394687
    				],
    				[
    					-79.3925898,
    					43.639744
    				],
    				[
    					-79.3926776,
    					43.6400385
    				]
    			]
    		},
    		id: "way/302152089"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/302152090",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3925051,
    					43.6389265
    				],
    				[
    					-79.3924746,
    					43.6388318
    				],
    				[
    					-79.3924201,
    					43.6386947
    				],
    				[
    					-79.3923668,
    					43.6385638
    				]
    			]
    		},
    		id: "way/302152090"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/302152532",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3959066,
    					43.6473683
    				],
    				[
    					-79.3956838,
    					43.6468095
    				],
    				[
    					-79.3956542,
    					43.6467324
    				]
    			]
    		},
    		id: "way/302152532"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/302358018",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4281541,
    					43.6614375
    				],
    				[
    					-79.4280066,
    					43.6614683
    				],
    				[
    					-79.4268171,
    					43.6617307
    				]
    			]
    		},
    		id: "way/302358018"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/302358019",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4304168,
    					43.6609428
    				],
    				[
    					-79.4302323,
    					43.6609821
    				],
    				[
    					-79.4295065,
    					43.6611418
    				],
    				[
    					-79.4293963,
    					43.6611664
    				]
    			]
    		},
    		id: "way/302358019"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/314653269",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3960637,
    					43.6482548
    				],
    				[
    					-79.3961021,
    					43.6483571
    				],
    				[
    					-79.396226,
    					43.6486945
    				],
    				[
    					-79.3962442,
    					43.648737
    				],
    				[
    					-79.3962536,
    					43.6487592
    				],
    				[
    					-79.3962585,
    					43.6487705
    				],
    				[
    					-79.39626,
    					43.6487741
    				]
    			]
    		},
    		id: "way/314653269"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/315236541",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4510756,
    					43.676109
    				],
    				[
    					-79.4506523,
    					43.6761942
    				],
    				[
    					-79.4506051,
    					43.6762037
    				],
    				[
    					-79.4505399,
    					43.6762155
    				]
    			]
    		},
    		id: "way/315236541"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/319337222",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4018217,
    					43.6753168
    				],
    				[
    					-79.401351,
    					43.6750101
    				],
    				[
    					-79.4008463,
    					43.6746738
    				],
    				[
    					-79.4005819,
    					43.6745394
    				],
    				[
    					-79.4003572,
    					43.6744684
    				],
    				[
    					-79.4001376,
    					43.6744148
    				],
    				[
    					-79.3999175,
    					43.6743849
    				],
    				[
    					-79.399819,
    					43.6743775
    				]
    			]
    		},
    		id: "way/319337222"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/329385932",
    			bicycle: "no",
    			bridge: "yes",
    			foot: "no",
    			highway: "secondary",
    			lanes: "4",
    			layer: "2",
    			maxspeed: "50",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.392054,
    					43.639088
    				],
    				[
    					-79.3929094,
    					43.6389525
    				]
    			]
    		},
    		id: "way/329385932"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/334797593",
    			highway: "secondary",
    			lanes: "4",
    			"lanes:backward": "2",
    			"lanes:forward": "2",
    			lit: "yes",
    			name: "Front Street West",
    			sidewalk: "left",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|through;right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3945826,
    					43.6425536
    				],
    				[
    					-79.3941238,
    					43.6426764
    				],
    				[
    					-79.3940177,
    					43.6427059
    				]
    			]
    		},
    		id: "way/334797593"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/334951826",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4535292,
    					43.6383781
    				],
    				[
    					-79.4536645,
    					43.6383694
    				],
    				[
    					-79.4537672,
    					43.6383628
    				],
    				[
    					-79.4540104,
    					43.6383506
    				],
    				[
    					-79.4544389,
    					43.6383485
    				]
    			]
    		},
    		id: "way/334951826"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/334951827",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4380914,
    					43.6340875
    				],
    				[
    					-79.4379442,
    					43.6340194
    				]
    			]
    		},
    		id: "way/334951827"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/334951829",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3979325,
    					43.6370812
    				],
    				[
    					-79.3983094,
    					43.6369453
    				],
    				[
    					-79.3984073,
    					43.636907
    				],
    				[
    					-79.3986091,
    					43.6368327
    				],
    				[
    					-79.3992923,
    					43.6365951
    				],
    				[
    					-79.3995215,
    					43.6365184
    				]
    			]
    		},
    		id: "way/334951829"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/335622217",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4308685,
    					43.6528914
    				],
    				[
    					-79.4307581,
    					43.6529109
    				],
    				[
    					-79.4306925,
    					43.6529195
    				],
    				[
    					-79.43063,
    					43.652925
    				],
    				[
    					-79.4305804,
    					43.6529264
    				],
    				[
    					-79.4304838,
    					43.6529255
    				],
    				[
    					-79.430428,
    					43.6529199
    				],
    				[
    					-79.4303416,
    					43.6529085
    				],
    				[
    					-79.4302518,
    					43.6528905
    				],
    				[
    					-79.4301512,
    					43.6528731
    				],
    				[
    					-79.4300687,
    					43.6528633
    				],
    				[
    					-79.4299943,
    					43.6528594
    				],
    				[
    					-79.4299277,
    					43.6528645
    				],
    				[
    					-79.4298065,
    					43.6528857
    				],
    				[
    					-79.4297144,
    					43.6529051
    				],
    				[
    					-79.4296377,
    					43.6529212
    				]
    			]
    		},
    		id: "way/335622217"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/352705215",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4430139,
    					43.6506646
    				],
    				[
    					-79.4428531,
    					43.6506313
    				],
    				[
    					-79.4427508,
    					43.6506083
    				],
    				[
    					-79.4422876,
    					43.6505029
    				]
    			]
    		},
    		id: "way/352705215"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/352910385",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "2",
    			"lanes:forward": "3",
    			lit: "yes",
    			name: "Front Street West",
    			sidewalk: "both",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3893611,
    					43.6438198
    				],
    				[
    					-79.3899508,
    					43.6436914
    				]
    			]
    		},
    		id: "way/352910385"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/354354330",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "1",
    			"lanes:forward": "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			"parking:condition:left:1": "fee",
    			"parking:condition:left:1:time_interval": "Mo-Fr 09:30-15:30, 18:30-21:00; Sa 08:00-21:00; Su 13:00-21:00",
    			"parking:condition:left:2": "no_stopping",
    			"parking:condition:left:2:time_interval": "Mo-Fr 07:30-09:30, 15:30-18:30",
    			"parking:lane:left": "parallel",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3948382,
    					43.6685556
    				],
    				[
    					-79.3943069,
    					43.6686661
    				],
    				[
    					-79.3941295,
    					43.6687016
    				]
    			]
    		},
    		id: "way/354354330"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/354354332",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3934625,
    					43.6688412
    				],
    				[
    					-79.3923082,
    					43.669097
    				],
    				[
    					-79.3917669,
    					43.6692137
    				],
    				[
    					-79.3909723,
    					43.669385
    				],
    				[
    					-79.3909554,
    					43.6693891
    				],
    				[
    					-79.390562,
    					43.6694841
    				]
    			]
    		},
    		id: "way/354354332"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/359211121",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4363526,
    					43.6518005
    				],
    				[
    					-79.4364591,
    					43.6517837
    				],
    				[
    					-79.4365241,
    					43.6517732
    				],
    				[
    					-79.4368841,
    					43.6517037
    				]
    			]
    		},
    		id: "way/359211121"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/359211122",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4363526,
    					43.6518005
    				],
    				[
    					-79.4362147,
    					43.6518195
    				],
    				[
    					-79.4360293,
    					43.6518523
    				],
    				[
    					-79.4358294,
    					43.6518916
    				],
    				[
    					-79.4354271,
    					43.6519721
    				],
    				[
    					-79.435111,
    					43.6520363
    				],
    				[
    					-79.4346205,
    					43.6521358
    				],
    				[
    					-79.4345476,
    					43.6521504
    				]
    			]
    		},
    		id: "way/359211122"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/365865819",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4331395,
    					43.6497301
    				],
    				[
    					-79.4323546,
    					43.6496801
    				],
    				[
    					-79.4319577,
    					43.6496558
    				],
    				[
    					-79.4317565,
    					43.6496451
    				],
    				[
    					-79.4315606,
    					43.649637
    				],
    				[
    					-79.4314381,
    					43.6496315
    				]
    			]
    		},
    		id: "way/365865819"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/366893779",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4589259,
    					43.6377329
    				],
    				[
    					-79.4584136,
    					43.6378297
    				],
    				[
    					-79.4579095,
    					43.6379309
    				],
    				[
    					-79.4576731,
    					43.6379653
    				],
    				[
    					-79.4573944,
    					43.638004
    				],
    				[
    					-79.4570985,
    					43.6380381
    				],
    				[
    					-79.4568503,
    					43.6380612
    				],
    				[
    					-79.4565237,
    					43.6380909
    				],
    				[
    					-79.456216,
    					43.6381092
    				],
    				[
    					-79.4558029,
    					43.6381181
    				],
    				[
    					-79.4554408,
    					43.6381144
    				],
    				[
    					-79.4552258,
    					43.6381109
    				],
    				[
    					-79.4549892,
    					43.6380998
    				],
    				[
    					-79.4545577,
    					43.6380725
    				]
    			]
    		},
    		id: "way/366893779"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/366893780",
    			highway: "secondary",
    			lanes: "5",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4603651,
    					43.6374782
    				],
    				[
    					-79.460054,
    					43.6375133
    				],
    				[
    					-79.4599466,
    					43.6375314
    				],
    				[
    					-79.4598135,
    					43.6375538
    				],
    				[
    					-79.4595697,
    					43.6376065
    				],
    				[
    					-79.4590906,
    					43.6376997
    				]
    			]
    		},
    		id: "way/366893780"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/367536576",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "right",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3971342,
    					43.6373149
    				],
    				[
    					-79.3969739,
    					43.6373708
    				],
    				[
    					-79.3960241,
    					43.6376982
    				],
    				[
    					-79.3959119,
    					43.6377357
    				],
    				[
    					-79.3956855,
    					43.6378114
    				],
    				[
    					-79.3954759,
    					43.6378815
    				],
    				[
    					-79.3952953,
    					43.637921
    				],
    				[
    					-79.3950566,
    					43.6379679
    				],
    				[
    					-79.3946237,
    					43.6380327
    				],
    				[
    					-79.3943882,
    					43.6380478
    				],
    				[
    					-79.3941626,
    					43.6380629
    				],
    				[
    					-79.3939642,
    					43.6380909
    				],
    				[
    					-79.3935402,
    					43.6381702
    				]
    			]
    		},
    		id: "way/367536576"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/367991974",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4375778,
    					43.6515641
    				],
    				[
    					-79.4368841,
    					43.6517037
    				]
    			]
    		},
    		id: "way/367991974"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/368706003",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:forward": "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bay Street",
    			surface: "asphalt",
    			"turn:lanes:forward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3896296,
    					43.6701053
    				],
    				[
    					-79.3895151,
    					43.6698357
    				],
    				[
    					-79.3894689,
    					43.6697241
    				]
    			]
    		},
    		id: "way/368706003"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/371443899",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4464042,
    					43.6370466
    				],
    				[
    					-79.4461025,
    					43.6370702
    				],
    				[
    					-79.4459435,
    					43.6370712
    				],
    				[
    					-79.4458134,
    					43.6370678
    				],
    				[
    					-79.445655,
    					43.63705
    				],
    				[
    					-79.445523,
    					43.637023
    				],
    				[
    					-79.445333,
    					43.6369714
    				],
    				[
    					-79.4451721,
    					43.6369133
    				],
    				[
    					-79.4438598,
    					43.6363434
    				],
    				[
    					-79.4433701,
    					43.6361305
    				],
    				[
    					-79.4433108,
    					43.6361063
    				],
    				[
    					-79.4432448,
    					43.6360815
    				],
    				[
    					-79.4429216,
    					43.6359692
    				]
    			]
    		},
    		id: "way/371443899"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/371443900",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4471829,
    					43.6370189
    				],
    				[
    					-79.446843,
    					43.6370146
    				],
    				[
    					-79.4467902,
    					43.6370162
    				],
    				[
    					-79.4464042,
    					43.6370466
    				]
    			]
    		},
    		id: "way/371443900"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/371443902",
    			highway: "secondary",
    			lanes: "1",
    			name: "Parkside Drive",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "merge_to_right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4524228,
    					43.6379573
    				],
    				[
    					-79.4520935,
    					43.6378574
    				],
    				[
    					-79.4518282,
    					43.637775
    				]
    			]
    		},
    		id: "way/371443902"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/407154121",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queens Quay West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3897472,
    					43.6382092
    				],
    				[
    					-79.3900555,
    					43.6381372
    				]
    			]
    		},
    		id: "way/407154121"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/409178221",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "|||right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4576658,
    					43.6382281
    				],
    				[
    					-79.4578852,
    					43.638194
    				],
    				[
    					-79.4582684,
    					43.638128
    				],
    				[
    					-79.4588266,
    					43.6380236
    				],
    				[
    					-79.4590074,
    					43.6379924
    				]
    			]
    		},
    		id: "way/409178221"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/409178222",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4544389,
    					43.6383485
    				],
    				[
    					-79.4554188,
    					43.6383845
    				],
    				[
    					-79.4558977,
    					43.6383798
    				],
    				[
    					-79.456275,
    					43.6383698
    				],
    				[
    					-79.456527,
    					43.6383524
    				],
    				[
    					-79.4568087,
    					43.6383335
    				],
    				[
    					-79.4571613,
    					43.6382973
    				],
    				[
    					-79.4574592,
    					43.6382563
    				],
    				[
    					-79.4576658,
    					43.6382281
    				]
    			]
    		},
    		id: "way/409178222"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/418378155",
    			"cycleway:right": "shared_lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4406962,
    					43.6502333
    				],
    				[
    					-79.4401235,
    					43.6501947
    				],
    				[
    					-79.4398855,
    					43.6501791
    				],
    				[
    					-79.4397252,
    					43.6501675
    				]
    			]
    		},
    		id: "way/418378155"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/431398853",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4379058,
    					43.6403382
    				],
    				[
    					-79.4374457,
    					43.6404279
    				],
    				[
    					-79.4372577,
    					43.6404653
    				]
    			]
    		},
    		id: "way/431398853"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/432298981",
    			"embedded_rails:lanes": "||tram|tram|",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt",
    			"turn:lanes:backward": "||right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4030469,
    					43.6448155
    				],
    				[
    					-79.4029332,
    					43.6445438
    				],
    				[
    					-79.4028328,
    					43.6442907
    				],
    				[
    					-79.4027199,
    					43.644011
    				],
    				[
    					-79.4027143,
    					43.6439966
    				],
    				[
    					-79.4026898,
    					43.6439342
    				],
    				[
    					-79.4026843,
    					43.64392
    				]
    			]
    		},
    		id: "way/432298981"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/433367926",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4247137,
    					43.6494381
    				],
    				[
    					-79.4246107,
    					43.6494367
    				],
    				[
    					-79.4239545,
    					43.6494171
    				],
    				[
    					-79.4238241,
    					43.6494147
    				],
    				[
    					-79.4236761,
    					43.6494099
    				],
    				[
    					-79.4232043,
    					43.6493963
    				],
    				[
    					-79.4226992,
    					43.6493826
    				],
    				[
    					-79.4217787,
    					43.6493579
    				],
    				[
    					-79.4208879,
    					43.6493326
    				],
    				[
    					-79.4208211,
    					43.6493317
    				],
    				[
    					-79.4207551,
    					43.6493335
    				],
    				[
    					-79.4207025,
    					43.6493385
    				],
    				[
    					-79.4206512,
    					43.6493456
    				],
    				[
    					-79.4202003,
    					43.6494356
    				],
    				[
    					-79.4195215,
    					43.6495692
    				],
    				[
    					-79.4189093,
    					43.649695
    				],
    				[
    					-79.4188356,
    					43.6497089
    				],
    				[
    					-79.4183527,
    					43.6498059
    				],
    				[
    					-79.418252,
    					43.6498254
    				]
    			]
    		},
    		id: "way/433367926"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/433367930",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.418252,
    					43.6498254
    				],
    				[
    					-79.41815,
    					43.6498475
    				],
    				[
    					-79.4176018,
    					43.6499566
    				],
    				[
    					-79.4170484,
    					43.6500669
    				]
    			]
    		},
    		id: "way/433367930"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/433369381",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4170484,
    					43.6500669
    				],
    				[
    					-79.4168087,
    					43.6501157
    				],
    				[
    					-79.4160419,
    					43.65027
    				],
    				[
    					-79.4159629,
    					43.6502861
    				]
    			]
    		},
    		id: "way/433369381"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/433858543",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Parkside Drive",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4600026,
    					43.6547121
    				],
    				[
    					-79.4599598,
    					43.6545746
    				],
    				[
    					-79.4598693,
    					43.654343
    				],
    				[
    					-79.4596557,
    					43.653889
    				],
    				[
    					-79.4593058,
    					43.6530483
    				],
    				[
    					-79.4590405,
    					43.6523882
    				],
    				[
    					-79.4587682,
    					43.6517462
    				],
    				[
    					-79.4584949,
    					43.6511002
    				]
    			]
    		},
    		id: "way/433858543"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435130631",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4467366,
    					43.6674799
    				],
    				[
    					-79.4464827,
    					43.6668157
    				],
    				[
    					-79.4464511,
    					43.6667349
    				]
    			]
    		},
    		id: "way/435130631"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435131379",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			offpeaklanes: "2",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4464511,
    					43.6667349
    				],
    				[
    					-79.4463382,
    					43.6667577
    				],
    				[
    					-79.4453139,
    					43.6669746
    				],
    				[
    					-79.4443149,
    					43.6671871
    				],
    				[
    					-79.4441664,
    					43.6672399
    				]
    			]
    		},
    		id: "way/435131379"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435131960",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			offpeaklanes: "2",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4438099,
    					43.6675629
    				],
    				[
    					-79.4437105,
    					43.667667
    				],
    				[
    					-79.4436555,
    					43.667714
    				],
    				[
    					-79.4435887,
    					43.6677573
    				],
    				[
    					-79.4435194,
    					43.667795
    				],
    				[
    					-79.4434456,
    					43.6678246
    				],
    				[
    					-79.4433685,
    					43.6678474
    				],
    				[
    					-79.4432705,
    					43.6678743
    				],
    				[
    					-79.4419918,
    					43.6681228
    				],
    				[
    					-79.4405436,
    					43.6684035
    				],
    				[
    					-79.4403034,
    					43.6684493
    				],
    				[
    					-79.4400863,
    					43.6684863
    				],
    				[
    					-79.4399701,
    					43.6685003
    				],
    				[
    					-79.4398638,
    					43.6685045
    				],
    				[
    					-79.4397007,
    					43.6685045
    				]
    			]
    		},
    		id: "way/435131960"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435298981",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Bathurst Street",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3996615,
    					43.6366958
    				],
    				[
    					-79.399695,
    					43.6367383
    				]
    			]
    		},
    		id: "way/435298981"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435311744",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4429216,
    					43.6359692
    				],
    				[
    					-79.4420882,
    					43.6357156
    				],
    				[
    					-79.4412199,
    					43.6354069
    				],
    				[
    					-79.441004,
    					43.6353655
    				]
    			]
    		},
    		id: "way/435311744"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435445186",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4502434,
    					43.6567686
    				],
    				[
    					-79.4512183,
    					43.6565605
    				],
    				[
    					-79.4516607,
    					43.6564884
    				]
    			]
    		},
    		id: "way/435445186"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435464173",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "50",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4513172,
    					43.6394305
    				],
    				[
    					-79.4522485,
    					43.6397184
    				]
    			]
    		},
    		id: "way/435464173"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435464174",
    			cycleway: "shared_lane",
    			"embedded_rails:lanes": "tram||",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "50",
    			name: "The Queensway",
    			note: "Left turn lane is on streetcar track, streetcars go straight",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt",
    			"turn:lanes": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4522397,
    					43.6395618
    				],
    				[
    					-79.4520418,
    					43.6395032
    				],
    				[
    					-79.4519218,
    					43.6394617
    				],
    				[
    					-79.4517732,
    					43.6394133
    				],
    				[
    					-79.4516412,
    					43.6393707
    				],
    				[
    					-79.4513402,
    					43.6392805
    				]
    			]
    		},
    		id: "way/435464174"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435608649",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4076975,
    					43.6429085
    				],
    				[
    					-79.4075986,
    					43.6429285
    				],
    				[
    					-79.4066487,
    					43.643121
    				],
    				[
    					-79.4053629,
    					43.6433797
    				],
    				[
    					-79.4052613,
    					43.6434006
    				]
    			]
    		},
    		id: "way/435608649"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435608887",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4052613,
    					43.6434006
    				],
    				[
    					-79.4051662,
    					43.6434203
    				],
    				[
    					-79.4038318,
    					43.6436892
    				],
    				[
    					-79.4030611,
    					43.6438449
    				],
    				[
    					-79.4028475,
    					43.643888
    				],
    				[
    					-79.4027892,
    					43.6438995
    				],
    				[
    					-79.4027029,
    					43.6439164
    				],
    				[
    					-79.4026843,
    					43.64392
    				]
    			]
    		},
    		id: "way/435608887"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435619991",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4113198,
    					43.6421764
    				],
    				[
    					-79.4107224,
    					43.6422972
    				]
    			]
    		},
    		id: "way/435619991"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/435639472",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4524667,
    					43.6564244
    				],
    				[
    					-79.4524425,
    					43.6563264
    				]
    			]
    		},
    		id: "way/435639472"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/436567440",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxheight: "4",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.45761,
    					43.6643258
    				],
    				[
    					-79.4569624,
    					43.6644742
    				]
    			]
    		},
    		id: "way/436567440"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/436567441",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4565684,
    					43.6645551
    				],
    				[
    					-79.4562334,
    					43.6646291
    				],
    				[
    					-79.4561324,
    					43.6646587
    				],
    				[
    					-79.4558362,
    					43.6647496
    				],
    				[
    					-79.4554904,
    					43.6648555
    				]
    			]
    		},
    		id: "way/436567441"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/436903584",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4246198,
    					43.6622098
    				],
    				[
    					-79.424405,
    					43.6622567
    				],
    				[
    					-79.4233386,
    					43.6624918
    				],
    				[
    					-79.4232488,
    					43.6625113
    				]
    			]
    		},
    		id: "way/436903584"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/437089885",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "|||right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4500659,
    					43.6381497
    				],
    				[
    					-79.4517198,
    					43.6384214
    				],
    				[
    					-79.4522887,
    					43.6384761
    				]
    			]
    		},
    		id: "way/437089885"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/437216079",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4539297,
    					43.6756163
    				],
    				[
    					-79.4546717,
    					43.6754548
    				],
    				[
    					-79.4547904,
    					43.6754355
    				]
    			]
    		},
    		id: "way/437216079"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/437216380",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4088221,
    					43.6426853
    				],
    				[
    					-79.408634,
    					43.6427189
    				],
    				[
    					-79.407774,
    					43.6428939
    				],
    				[
    					-79.4076975,
    					43.6429085
    				]
    			]
    		},
    		id: "way/437216380"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/437978077",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4064783,
    					43.6567112
    				],
    				[
    					-79.4058249,
    					43.6568364
    				],
    				[
    					-79.4052723,
    					43.6569435
    				],
    				[
    					-79.405162,
    					43.656965
    				]
    			]
    		},
    		id: "way/437978077"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/439147292",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4367798,
    					43.6792807
    				],
    				[
    					-79.4359659,
    					43.6794669
    				],
    				[
    					-79.4358138,
    					43.6794955
    				]
    			]
    		},
    		id: "way/439147292"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/439351904",
    			highway: "secondary",
    			lanes: "5",
    			lit: "yes",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4143281,
    					43.6731379
    				],
    				[
    					-79.4144301,
    					43.6731179
    				],
    				[
    					-79.41491,
    					43.6730053
    				]
    			]
    		},
    		id: "way/439351904"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/439373456",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.406476,
    					43.6749839
    				],
    				[
    					-79.4059438,
    					43.6750806
    				]
    			]
    		},
    		id: "way/439373456"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/439373457",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4082452,
    					43.6746209
    				],
    				[
    					-79.4076741,
    					43.6747418
    				]
    			]
    		},
    		id: "way/439373457"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/440970980",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4484615,
    					43.6663163
    				],
    				[
    					-79.4473636,
    					43.6665421
    				]
    			]
    		},
    		id: "way/440970980"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/444662976",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4392185,
    					43.668913
    				],
    				[
    					-79.4390811,
    					43.6686001
    				],
    				[
    					-79.4390182,
    					43.6684583
    				]
    			]
    		},
    		id: "way/444662976"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/444662978",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxheight: "4.2",
    			name: "Dufferin Street",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4392185,
    					43.668913
    				],
    				[
    					-79.4392882,
    					43.6690811
    				]
    			]
    		},
    		id: "way/444662978"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/444741638",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "University Avenue",
    			old_ref: "11A",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3905908,
    					43.6598263
    				],
    				[
    					-79.3905854,
    					43.6598123
    				],
    				[
    					-79.3905521,
    					43.6597268
    				]
    			]
    		},
    		id: "way/444741638"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/444855980",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			offpeaklanes: "2",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3951312,
    					43.6454485
    				],
    				[
    					-79.3951255,
    					43.6454357
    				],
    				[
    					-79.3951118,
    					43.6454044
    				],
    				[
    					-79.3950924,
    					43.6453605
    				]
    			]
    		},
    		id: "way/444855980"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445630628",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.425961,
    					43.6427535
    				],
    				[
    					-79.4247623,
    					43.6429968
    				]
    			]
    		},
    		id: "way/445630628"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445639474",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4035997,
    					43.6755537
    				],
    				[
    					-79.4032427,
    					43.6756502
    				]
    			]
    		},
    		id: "way/445639474"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445639665",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4032427,
    					43.6756502
    				],
    				[
    					-79.4029309,
    					43.6757249
    				]
    			]
    		},
    		id: "way/445639665"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445667897",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3929814,
    					43.6747573
    				],
    				[
    					-79.3929082,
    					43.6747125
    				]
    			]
    		},
    		id: "way/445667897"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445668742",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3919427,
    					43.6741716
    				],
    				[
    					-79.3918324,
    					43.6741055
    				]
    			]
    		},
    		id: "way/445668742"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445862066",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3987369,
    					43.6544449
    				],
    				[
    					-79.3987144,
    					43.654381
    				]
    			]
    		},
    		id: "way/445862066"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445862067",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3985462,
    					43.6544857
    				],
    				[
    					-79.3987227,
    					43.6549271
    				]
    			]
    		},
    		id: "way/445862067"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445862068",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3987144,
    					43.654381
    				],
    				[
    					-79.3986873,
    					43.654317
    				],
    				[
    					-79.3985077,
    					43.6538905
    				],
    				[
    					-79.3983662,
    					43.6535064
    				],
    				[
    					-79.3983051,
    					43.6533407
    				],
    				[
    					-79.398173,
    					43.6530253
    				],
    				[
    					-79.3981519,
    					43.6529658
    				],
    				[
    					-79.3981382,
    					43.6529274
    				],
    				[
    					-79.3981331,
    					43.6529133
    				]
    			]
    		},
    		id: "way/445862068"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445865881",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4039839,
    					43.6517753
    				],
    				[
    					-79.4039487,
    					43.6517668
    				],
    				[
    					-79.4039137,
    					43.6517578
    				],
    				[
    					-79.4038739,
    					43.6517513
    				],
    				[
    					-79.403824,
    					43.6517463
    				],
    				[
    					-79.403799,
    					43.651745
    				],
    				[
    					-79.4037623,
    					43.6517445
    				],
    				[
    					-79.4037161,
    					43.6517468
    				],
    				[
    					-79.4036617,
    					43.651754
    				],
    				[
    					-79.4035794,
    					43.6517685
    				],
    				[
    					-79.4028153,
    					43.6519257
    				]
    			]
    		},
    		id: "way/445865881"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/445865882",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4049852,
    					43.6522193
    				],
    				[
    					-79.4047277,
    					43.6521044
    				]
    			]
    		},
    		id: "way/445865882"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446074000",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4419863,
    					43.6781185
    				],
    				[
    					-79.4414514,
    					43.6782328
    				]
    			]
    		},
    		id: "way/446074000"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446074002",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4414514,
    					43.6782328
    				],
    				[
    					-79.4409546,
    					43.6783341
    				],
    				[
    					-79.4408521,
    					43.6783526
    				]
    			]
    		},
    		id: "way/446074002"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446074004",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4402226,
    					43.6786326
    				],
    				[
    					-79.4407677,
    					43.6785154
    				],
    				[
    					-79.440859,
    					43.6784987
    				]
    			]
    		},
    		id: "way/446074004"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446074007",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.440859,
    					43.6784987
    				],
    				[
    					-79.4410029,
    					43.6784743
    				],
    				[
    					-79.4413293,
    					43.6784087
    				],
    				[
    					-79.4415821,
    					43.678339
    				],
    				[
    					-79.4419561,
    					43.6782576
    				],
    				[
    					-79.4423718,
    					43.6781691
    				]
    			]
    		},
    		id: "way/446074007"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446104174",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4569624,
    					43.6644742
    				],
    				[
    					-79.4565684,
    					43.6645551
    				]
    			]
    		},
    		id: "way/446104174"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446283227",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Parkside Drive",
    			sidewalk: "left",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4577741,
    					43.6486499
    				],
    				[
    					-79.4577701,
    					43.6486361
    				],
    				[
    					-79.4577195,
    					43.6485136
    				],
    				[
    					-79.4576326,
    					43.6482886
    				]
    			]
    		},
    		id: "way/446283227"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446283228",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Parkside Drive",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4584949,
    					43.6511002
    				],
    				[
    					-79.4584646,
    					43.651025
    				],
    				[
    					-79.4583137,
    					43.6506485
    				],
    				[
    					-79.4582012,
    					43.6502133
    				],
    				[
    					-79.4578923,
    					43.6489931
    				]
    			]
    		},
    		id: "way/446283228"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327329",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4129459,
    					43.6696122
    				],
    				[
    					-79.4124404,
    					43.6683233
    				],
    				[
    					-79.4123834,
    					43.6681773
    				],
    				[
    					-79.4123696,
    					43.6681293
    				]
    			]
    		},
    		id: "way/446327329"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327336",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4294337,
    					43.652965
    				],
    				[
    					-79.4288034,
    					43.6530977
    				],
    				[
    					-79.4281796,
    					43.6532294
    				]
    			]
    		},
    		id: "way/446327336"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327339",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4190094,
    					43.6551547
    				],
    				[
    					-79.4189383,
    					43.6551656
    				],
    				[
    					-79.4188229,
    					43.6551834
    				],
    				[
    					-79.418677,
    					43.6551999
    				],
    				[
    					-79.4185285,
    					43.6552144
    				],
    				[
    					-79.4184092,
    					43.6552236
    				],
    				[
    					-79.4183149,
    					43.6552285
    				],
    				[
    					-79.4181946,
    					43.6552329
    				],
    				[
    					-79.4180759,
    					43.6552353
    				],
    				[
    					-79.4179713,
    					43.6552363
    				],
    				[
    					-79.4178727,
    					43.6552341
    				],
    				[
    					-79.4177299,
    					43.6552295
    				],
    				[
    					-79.4176066,
    					43.6552217
    				],
    				[
    					-79.4174798,
    					43.6552125
    				],
    				[
    					-79.417357,
    					43.6551988
    				],
    				[
    					-79.417154,
    					43.6551738
    				],
    				[
    					-79.4166638,
    					43.6551013
    				],
    				[
    					-79.4162304,
    					43.6550378
    				],
    				[
    					-79.4157321,
    					43.6549649
    				],
    				[
    					-79.4155916,
    					43.6549448
    				],
    				[
    					-79.4155051,
    					43.6549388
    				],
    				[
    					-79.415393,
    					43.654936
    				],
    				[
    					-79.4152676,
    					43.6549415
    				],
    				[
    					-79.415212,
    					43.6549461
    				],
    				[
    					-79.4151556,
    					43.6549539
    				],
    				[
    					-79.4150257,
    					43.6549779
    				],
    				[
    					-79.4139386,
    					43.6551959
    				],
    				[
    					-79.4138612,
    					43.6552114
    				],
    				[
    					-79.4137901,
    					43.6552259
    				],
    				[
    					-79.4132412,
    					43.6553372
    				],
    				[
    					-79.4126146,
    					43.6554634
    				]
    			]
    		},
    		id: "way/446327339"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327341",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.431686,
    					43.652726
    				],
    				[
    					-79.4311492,
    					43.6528378
    				],
    				[
    					-79.4310673,
    					43.6528549
    				]
    			]
    		},
    		id: "way/446327341"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327343",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4281796,
    					43.6532294
    				],
    				[
    					-79.4277112,
    					43.6533289
    				]
    			]
    		},
    		id: "way/446327343"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327345",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4310673,
    					43.6528549
    				],
    				[
    					-79.4309754,
    					43.6528719
    				],
    				[
    					-79.4308685,
    					43.6528914
    				]
    			]
    		},
    		id: "way/446327345"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327347",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4226846,
    					43.654389
    				],
    				[
    					-79.4225882,
    					43.6544106
    				],
    				[
    					-79.4223596,
    					43.654459
    				],
    				[
    					-79.421449,
    					43.6546517
    				]
    			]
    		},
    		id: "way/446327347"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327349",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4296377,
    					43.6529212
    				],
    				[
    					-79.4295232,
    					43.6529454
    				],
    				[
    					-79.4294337,
    					43.652965
    				]
    			]
    		},
    		id: "way/446327349"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327351",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.432546,
    					43.6525556
    				],
    				[
    					-79.4324457,
    					43.652575
    				],
    				[
    					-79.4322125,
    					43.6526218
    				],
    				[
    					-79.431686,
    					43.652726
    				]
    			]
    		},
    		id: "way/446327351"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327353",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.421449,
    					43.6546517
    				],
    				[
    					-79.4203406,
    					43.6548817
    				],
    				[
    					-79.4202531,
    					43.6549004
    				],
    				[
    					-79.4201773,
    					43.6549163
    				],
    				[
    					-79.4194233,
    					43.6550742
    				],
    				[
    					-79.4192118,
    					43.6551174
    				],
    				[
    					-79.4190971,
    					43.6551391
    				],
    				[
    					-79.4190094,
    					43.6551547
    				]
    			]
    		},
    		id: "way/446327353"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327355",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4263871,
    					43.6536104
    				],
    				[
    					-79.4263041,
    					43.6536268
    				],
    				[
    					-79.4257376,
    					43.6537449
    				],
    				[
    					-79.4251802,
    					43.6538625
    				],
    				[
    					-79.4239169,
    					43.654128
    				]
    			]
    		},
    		id: "way/446327355"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327364",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4417088,
    					43.6747355
    				],
    				[
    					-79.4415558,
    					43.6743798
    				],
    				[
    					-79.4413952,
    					43.6740064
    				]
    			]
    		},
    		id: "way/446327364"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327367",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4366594,
    					43.6629764
    				],
    				[
    					-79.4354967,
    					43.6602767
    				]
    			]
    		},
    		id: "way/446327367"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327369",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4381027,
    					43.6664268
    				],
    				[
    					-79.4378554,
    					43.6658505
    				]
    			]
    		},
    		id: "way/446327369"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327370",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4370086,
    					43.6638378
    				],
    				[
    					-79.4368214,
    					43.6634059
    				],
    				[
    					-79.4366837,
    					43.6630319
    				],
    				[
    					-79.4366594,
    					43.6629764
    				]
    			]
    		},
    		id: "way/446327370"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327372",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4413952,
    					43.6740064
    				],
    				[
    					-79.4410934,
    					43.6732606
    				],
    				[
    					-79.4410081,
    					43.6730669
    				],
    				[
    					-79.4409717,
    					43.6729827
    				]
    			]
    		},
    		id: "way/446327372"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327373",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4312851,
    					43.6492358
    				],
    				[
    					-79.4313988,
    					43.649549
    				],
    				[
    					-79.4314307,
    					43.6496198
    				],
    				[
    					-79.4314381,
    					43.6496315
    				]
    			]
    		},
    		id: "way/446327373"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327375",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.432546,
    					43.6525556
    				],
    				[
    					-79.4325401,
    					43.6525409
    				],
    				[
    					-79.4325165,
    					43.652482
    				],
    				[
    					-79.4324893,
    					43.6524075
    				],
    				[
    					-79.4322282,
    					43.6517297
    				],
    				[
    					-79.432021,
    					43.651187
    				]
    			]
    		},
    		id: "way/446327375"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327377",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4390182,
    					43.6684583
    				],
    				[
    					-79.4389523,
    					43.6683242
    				],
    				[
    					-79.4386793,
    					43.6676829
    				]
    			]
    		},
    		id: "way/446327377"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327380",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4526876,
    					43.657249
    				],
    				[
    					-79.4526586,
    					43.6571362
    				]
    			]
    		},
    		id: "way/446327380"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327386",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4356031,
    					43.6498897
    				],
    				[
    					-79.4354816,
    					43.6498821
    				],
    				[
    					-79.43489,
    					43.649845
    				],
    				[
    					-79.4341942,
    					43.6497996
    				]
    			]
    		},
    		id: "way/446327386"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327387",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4527604,
    					43.6575368
    				],
    				[
    					-79.4527298,
    					43.6574122
    				],
    				[
    					-79.4527043,
    					43.657314
    				],
    				[
    					-79.4526876,
    					43.657249
    				]
    			]
    		},
    		id: "way/446327387"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327389",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4308902,
    					43.6496169
    				],
    				[
    					-79.4300712,
    					43.6495919
    				]
    			]
    		},
    		id: "way/446327389"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327391",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4341942,
    					43.6497996
    				],
    				[
    					-79.4339968,
    					43.6497873
    				],
    				[
    					-79.4338093,
    					43.649775
    				],
    				[
    					-79.4336573,
    					43.6497649
    				]
    			]
    		},
    		id: "way/446327391"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327393",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4369801,
    					43.6499802
    				],
    				[
    					-79.4365588,
    					43.6499522
    				],
    				[
    					-79.4362573,
    					43.6499322
    				],
    				[
    					-79.4357235,
    					43.649895
    				],
    				[
    					-79.4356031,
    					43.6498897
    				]
    			]
    		},
    		id: "way/446327393"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327395",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4396036,
    					43.6501592
    				],
    				[
    					-79.438299,
    					43.6500689
    				]
    			]
    		},
    		id: "way/446327395"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327396",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4300712,
    					43.6495919
    				],
    				[
    					-79.4299465,
    					43.6495873
    				],
    				[
    					-79.4298086,
    					43.6495843
    				]
    			]
    		},
    		id: "way/446327396"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327398",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.438299,
    					43.6500689
    				],
    				[
    					-79.4378293,
    					43.6500373
    				],
    				[
    					-79.4369801,
    					43.6499802
    				]
    			]
    		},
    		id: "way/446327398"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327400",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4258114,
    					43.6494686
    				],
    				[
    					-79.4250254,
    					43.6494471
    				],
    				[
    					-79.4248237,
    					43.6494411
    				],
    				[
    					-79.4247137,
    					43.6494381
    				]
    			]
    		},
    		id: "way/446327400"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327403",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4267744,
    					43.6494958
    				],
    				[
    					-79.4266945,
    					43.6494932
    				],
    				[
    					-79.4258114,
    					43.6494686
    				]
    			]
    		},
    		id: "way/446327403"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327404",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4390182,
    					43.6684583
    				],
    				[
    					-79.4388666,
    					43.6684575
    				],
    				[
    					-79.4387314,
    					43.6684757
    				],
    				[
    					-79.4385518,
    					43.6685032
    				],
    				[
    					-79.4381046,
    					43.6685934
    				],
    				[
    					-79.4377466,
    					43.6686666
    				],
    				[
    					-79.4372772,
    					43.6687639
    				],
    				[
    					-79.4369818,
    					43.6688243
    				],
    				[
    					-79.4364961,
    					43.6689252
    				],
    				[
    					-79.4364197,
    					43.6689412
    				],
    				[
    					-79.4358026,
    					43.6690667
    				]
    			]
    		},
    		id: "way/446327404"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327405",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4140533,
    					43.673197
    				],
    				[
    					-79.4133797,
    					43.6733314
    				]
    			]
    		},
    		id: "way/446327405"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327406",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4358026,
    					43.6690667
    				],
    				[
    					-79.4351892,
    					43.6691912
    				]
    			]
    		},
    		id: "way/446327406"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327407",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4167116,
    					43.6725993
    				],
    				[
    					-79.4169918,
    					43.6725407
    				],
    				[
    					-79.4173022,
    					43.6724757
    				]
    			]
    		},
    		id: "way/446327407"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327408",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.41491,
    					43.6730053
    				],
    				[
    					-79.4161427,
    					43.6727257
    				],
    				[
    					-79.4167116,
    					43.6725993
    				]
    			]
    		},
    		id: "way/446327408"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327411",
    			hgv: "no",
    			"hgv:conditional": "no @ (19:00-7:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.442719,
    					43.6584366
    				],
    				[
    					-79.4427147,
    					43.6584154
    				],
    				[
    					-79.442718,
    					43.6583824
    				],
    				[
    					-79.4427281,
    					43.6583512
    				]
    			]
    		},
    		id: "way/446327411"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327413",
    			hgv: "no",
    			"hgv:conditional": "no @ (19:00-7:00)",
    			highway: "secondary",
    			lanes: "4",
    			"lanes:backward": "2",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4428564,
    					43.6587794
    				],
    				[
    					-79.442719,
    					43.6584366
    				]
    			]
    		},
    		id: "way/446327413"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327415",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Ossington Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4242822,
    					43.6585518
    				],
    				[
    					-79.4242503,
    					43.6584619
    				],
    				[
    					-79.4238468,
    					43.6574139
    				],
    				[
    					-79.4237744,
    					43.6572206
    				],
    				[
    					-79.4237333,
    					43.6571109
    				],
    				[
    					-79.4236988,
    					43.6570238
    				],
    				[
    					-79.4236742,
    					43.6569616
    				]
    			]
    		},
    		id: "way/446327415"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446327416",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Ossington Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4226846,
    					43.654389
    				],
    				[
    					-79.422679,
    					43.6543751
    				],
    				[
    					-79.4226548,
    					43.6543166
    				],
    				[
    					-79.4226062,
    					43.6541874
    				],
    				[
    					-79.4225314,
    					43.6539899
    				]
    			]
    		},
    		id: "way/446327416"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446790437",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3959848,
    					43.6586959
    				],
    				[
    					-79.3958612,
    					43.6587171
    				],
    				[
    					-79.3957571,
    					43.6587321
    				]
    			]
    		},
    		id: "way/446790437"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446793024",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3939334,
    					43.6537945
    				],
    				[
    					-79.3938316,
    					43.6538163
    				]
    			]
    		},
    		id: "way/446793024"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446793025",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3938316,
    					43.6538163
    				],
    				[
    					-79.3937353,
    					43.6538366
    				]
    			]
    		},
    		id: "way/446793025"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446793526",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.391527,
    					43.6542932
    				],
    				[
    					-79.391499,
    					43.6542982
    				],
    				[
    					-79.3914922,
    					43.6542994
    				],
    				[
    					-79.3914518,
    					43.6543041
    				],
    				[
    					-79.391433,
    					43.6543068
    				]
    			]
    		},
    		id: "way/446793526"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/446840095",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Parkside Drive",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4578923,
    					43.6489931
    				],
    				[
    					-79.4578158,
    					43.6487748
    				],
    				[
    					-79.4577835,
    					43.648678
    				],
    				[
    					-79.4577741,
    					43.6486499
    				]
    			]
    		},
    		id: "way/446840095"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/448023212",
    			"cycleway:right": "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4033309,
    					43.6455121
    				],
    				[
    					-79.4032393,
    					43.6452899
    				],
    				[
    					-79.4031968,
    					43.64519
    				]
    			]
    		},
    		id: "way/448023212"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/448168920",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4493877,
    					43.6764772
    				],
    				[
    					-79.4481098,
    					43.6767743
    				]
    			]
    		},
    		id: "way/448168920"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/448449967",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4243559,
    					43.6430785
    				],
    				[
    					-79.4242517,
    					43.6430996
    				],
    				[
    					-79.4235922,
    					43.6432352
    				]
    			]
    		},
    		id: "way/448449967"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/448449968",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4247623,
    					43.6429968
    				],
    				[
    					-79.4244623,
    					43.6430568
    				],
    				[
    					-79.4243559,
    					43.6430785
    				]
    			]
    		},
    		id: "way/448449968"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/449203092",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4569758,
    					43.6634162
    				],
    				[
    					-79.4568136,
    					43.6633209
    				],
    				[
    					-79.456705,
    					43.6632544
    				],
    				[
    					-79.4565864,
    					43.6631606
    				],
    				[
    					-79.4564734,
    					43.6630504
    				]
    			]
    		},
    		id: "way/449203092"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/451650374",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3974977,
    					43.6518441
    				],
    				[
    					-79.3975209,
    					43.651905
    				],
    				[
    					-79.3977085,
    					43.6523738
    				]
    			]
    		},
    		id: "way/451650374"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/455500807",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4585228,
    					43.6645002
    				],
    				[
    					-79.4584334,
    					43.6644742
    				],
    				[
    					-79.4579518,
    					43.6643342
    				],
    				[
    					-79.4578682,
    					43.6643138
    				],
    				[
    					-79.457787,
    					43.6643012
    				],
    				[
    					-79.4577069,
    					43.664313
    				],
    				[
    					-79.45761,
    					43.6643258
    				]
    			]
    		},
    		id: "way/455500807"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/456348789",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			offpeaklanes: "1",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4295222,
    					43.6702395
    				],
    				[
    					-79.4291326,
    					43.6700931
    				],
    				[
    					-79.4290119,
    					43.6700603
    				]
    			]
    		},
    		id: "way/456348789"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/456348790",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			"parking:condition:right": "no_stopping",
    			"parking:condition:right:time_interval": "Mo-Fr 07:00-09:00",
    			"parking:lane:right": "parallel",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4339299,
    					43.669447
    				],
    				[
    					-79.4328404,
    					43.6696725
    				],
    				[
    					-79.4327322,
    					43.6696944
    				],
    				[
    					-79.4326271,
    					43.6697159
    				],
    				[
    					-79.4315411,
    					43.6699387
    				],
    				[
    					-79.4303428,
    					43.6701817
    				],
    				[
    					-79.4297983,
    					43.6702902
    				],
    				[
    					-79.4297109,
    					43.670296
    				],
    				[
    					-79.4296437,
    					43.6702821
    				],
    				[
    					-79.4295222,
    					43.6702395
    				]
    			]
    		},
    		id: "way/456348790"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/456377196",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "50",
    			name: "King Street West",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4460871,
    					43.6387464
    				],
    				[
    					-79.4460828,
    					43.6387358
    				],
    				[
    					-79.4460547,
    					43.6386651
    				],
    				[
    					-79.4460474,
    					43.6386444
    				],
    				[
    					-79.4460274,
    					43.6386072
    				],
    				[
    					-79.4459642,
    					43.6385521
    				],
    				[
    					-79.4458817,
    					43.6385107
    				],
    				[
    					-79.4455095,
    					43.6383432
    				]
    			]
    		},
    		id: "way/456377196"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/456555951",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4409717,
    					43.6729827
    				],
    				[
    					-79.440934,
    					43.6728976
    				],
    				[
    					-79.4407652,
    					43.6725587
    				]
    			]
    		},
    		id: "way/456555951"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/456582648",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4386793,
    					43.6676829
    				],
    				[
    					-79.4386683,
    					43.6676587
    				],
    				[
    					-79.438517,
    					43.6673291
    				],
    				[
    					-79.4383697,
    					43.6670083
    				],
    				[
    					-79.4381027,
    					43.6664268
    				]
    			]
    		},
    		id: "way/456582648"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/456589363",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Ossington Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4228384,
    					43.6547843
    				],
    				[
    					-79.4227147,
    					43.654469
    				],
    				[
    					-79.4226891,
    					43.6544029
    				],
    				[
    					-79.4226846,
    					43.654389
    				]
    			]
    		},
    		id: "way/456589363"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/456589365",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4239169,
    					43.654128
    				],
    				[
    					-79.4234967,
    					43.6542165
    				],
    				[
    					-79.4227836,
    					43.6543655
    				],
    				[
    					-79.4226846,
    					43.654389
    				]
    			]
    		},
    		id: "way/456589365"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/457905342",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4327384,
    					43.6530588
    				],
    				[
    					-79.4326861,
    					43.6529249
    				],
    				[
    					-79.4325763,
    					43.6526351
    				],
    				[
    					-79.4325505,
    					43.6525679
    				],
    				[
    					-79.432546,
    					43.6525556
    				]
    			]
    		},
    		id: "way/457905342"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/457905343",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4345476,
    					43.6521504
    				],
    				[
    					-79.4331191,
    					43.65244
    				],
    				[
    					-79.4326457,
    					43.6525353
    				],
    				[
    					-79.432546,
    					43.6525556
    				]
    			]
    		},
    		id: "way/457905343"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/457905344",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.432021,
    					43.651187
    				],
    				[
    					-79.431915,
    					43.6509031
    				],
    				[
    					-79.4315746,
    					43.6500065
    				]
    			]
    		},
    		id: "way/457905344"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/458048652",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3961184,
    					43.6736246
    				],
    				[
    					-79.3960064,
    					43.6733551
    				]
    			]
    		},
    		id: "way/458048652"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/458048656",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3962963,
    					43.6740097
    				],
    				[
    					-79.3961184,
    					43.6736246
    				]
    			]
    		},
    		id: "way/458048656"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/458087114",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4138012,
    					43.6416779
    				],
    				[
    					-79.4127007,
    					43.6418998
    				]
    			]
    		},
    		id: "way/458087114"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/458226175",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4110612,
    					43.6647657
    				],
    				[
    					-79.4107075,
    					43.6638942
    				],
    				[
    					-79.4106812,
    					43.6638272
    				]
    			]
    		},
    		id: "way/458226175"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/458263065",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4090594,
    					43.6598205
    				],
    				[
    					-79.4090373,
    					43.6597656
    				],
    				[
    					-79.4081986,
    					43.6576847
    				],
    				[
    					-79.4079073,
    					43.6569608
    				],
    				[
    					-79.4077466,
    					43.6565789
    				],
    				[
    					-79.4077318,
    					43.6565407
    				],
    				[
    					-79.4077117,
    					43.6564889
    				],
    				[
    					-79.4077058,
    					43.6564736
    				]
    			]
    		},
    		id: "way/458263065"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/458263066",
    			cycleway: "lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4083428,
    					43.6563355
    				],
    				[
    					-79.4078241,
    					43.6564454
    				],
    				[
    					-79.4077278,
    					43.6564692
    				],
    				[
    					-79.4077058,
    					43.6564736
    				]
    			]
    		},
    		id: "way/458263066"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/458430191",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4101151,
    					43.6424202
    				],
    				[
    					-79.4100602,
    					43.6424321
    				],
    				[
    					-79.4091024,
    					43.6426255
    				],
    				[
    					-79.4088221,
    					43.6426853
    				]
    			]
    		},
    		id: "way/458430191"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/460937030",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Avenue Road",
    			old_ref: "11A",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3979583,
    					43.6781033
    				],
    				[
    					-79.3977327,
    					43.6775853
    				]
    			]
    		},
    		id: "way/460937030"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/461142434",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4336573,
    					43.6497649
    				],
    				[
    					-79.4335416,
    					43.6497572
    				],
    				[
    					-79.4331395,
    					43.6497301
    				]
    			]
    		},
    		id: "way/461142434"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/461150989",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4277112,
    					43.6533289
    				],
    				[
    					-79.4272474,
    					43.6534248
    				]
    			]
    		},
    		id: "way/461150989"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/462045606",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4315746,
    					43.6500065
    				],
    				[
    					-79.4314698,
    					43.6497184
    				],
    				[
    					-79.4314444,
    					43.6496489
    				],
    				[
    					-79.4314381,
    					43.6496315
    				]
    			]
    		},
    		id: "way/462045606"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/462050275",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4235521,
    					43.6397126
    				],
    				[
    					-79.4234154,
    					43.6397397
    				],
    				[
    					-79.4222676,
    					43.6399702
    				]
    			]
    		},
    		id: "way/462050275"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/462050276",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4248166,
    					43.6394586
    				],
    				[
    					-79.4237032,
    					43.6396825
    				],
    				[
    					-79.4235521,
    					43.6397126
    				]
    			]
    		},
    		id: "way/462050276"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/462103714",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4185731,
    					43.6407186
    				],
    				[
    					-79.4174701,
    					43.6409415
    				],
    				[
    					-79.4173315,
    					43.6409697
    				]
    			]
    		},
    		id: "way/462103714"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/486720815",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4571725,
    					43.6635301
    				],
    				[
    					-79.4569758,
    					43.6634162
    				]
    			]
    		},
    		id: "way/486720815"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/487435759",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "right",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3935402,
    					43.6381702
    				],
    				[
    					-79.3934036,
    					43.6382021
    				]
    			]
    		},
    		id: "way/487435759"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/493830469",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4060113,
    					43.6523038
    				],
    				[
    					-79.4060069,
    					43.652292
    				],
    				[
    					-79.4059826,
    					43.6522278
    				],
    				[
    					-79.405971,
    					43.6521971
    				],
    				[
    					-79.4058065,
    					43.6517801
    				]
    			]
    		},
    		id: "way/493830469"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/493830471",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4068248,
    					43.654295
    				],
    				[
    					-79.4067899,
    					43.6542109
    				],
    				[
    					-79.4062454,
    					43.6528696
    				],
    				[
    					-79.4060498,
    					43.6524054
    				],
    				[
    					-79.4060459,
    					43.6523951
    				],
    				[
    					-79.4060382,
    					43.6523747
    				],
    				[
    					-79.4060175,
    					43.6523201
    				],
    				[
    					-79.4060113,
    					43.6523038
    				]
    			]
    		},
    		id: "way/493830471"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/500297414",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4457231,
    					43.6648934
    				],
    				[
    					-79.4456955,
    					43.664819
    				],
    				[
    					-79.4455835,
    					43.6645326
    				],
    				[
    					-79.4449492,
    					43.6629241
    				],
    				[
    					-79.4448719,
    					43.6627731
    				],
    				[
    					-79.4448376,
    					43.6627158
    				],
    				[
    					-79.4447925,
    					43.6626592
    				],
    				[
    					-79.4447371,
    					43.6626062
    				],
    				[
    					-79.4444923,
    					43.6624144
    				],
    				[
    					-79.4443995,
    					43.6623473
    				],
    				[
    					-79.4443219,
    					43.6622739
    				],
    				[
    					-79.4442469,
    					43.6621866
    				],
    				[
    					-79.4441779,
    					43.6620881
    				],
    				[
    					-79.444102,
    					43.6619266
    				],
    				[
    					-79.4440276,
    					43.6617379
    				],
    				[
    					-79.4438895,
    					43.6613901
    				],
    				[
    					-79.4436122,
    					43.6606902
    				],
    				[
    					-79.4435891,
    					43.6606221
    				],
    				[
    					-79.4432963,
    					43.6598965
    				],
    				[
    					-79.4431438,
    					43.6595138
    				],
    				[
    					-79.4430296,
    					43.6592273
    				]
    			]
    		},
    		id: "way/500297414"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/500300647",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4431669,
    					43.6506994
    				],
    				[
    					-79.4430139,
    					43.6506646
    				]
    			]
    		},
    		id: "way/500300647"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/504884482",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4298465,
    					43.6454656
    				],
    				[
    					-79.4300138,
    					43.6459078
    				],
    				[
    					-79.4300376,
    					43.6459637
    				]
    			]
    		},
    		id: "way/504884482"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/504884486",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4300376,
    					43.6459637
    				],
    				[
    					-79.4303434,
    					43.6467691
    				],
    				[
    					-79.4303707,
    					43.6468394
    				],
    				[
    					-79.4303922,
    					43.6468975
    				],
    				[
    					-79.4306022,
    					43.6474646
    				],
    				[
    					-79.4306612,
    					43.6476156
    				],
    				[
    					-79.4306979,
    					43.6477093
    				],
    				[
    					-79.4312851,
    					43.6492358
    				]
    			]
    		},
    		id: "way/504884486"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/504884503",
    			highway: "secondary",
    			lanes: "3",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4590074,
    					43.6379924
    				],
    				[
    					-79.459166,
    					43.6379593
    				]
    			]
    		},
    		id: "way/504884503"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/504884508",
    			highway: "secondary",
    			lanes: "5",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4590906,
    					43.6376997
    				],
    				[
    					-79.4589259,
    					43.6377329
    				]
    			]
    		},
    		id: "way/504884508"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/504884513",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Ossington Avenue",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4236742,
    					43.6569616
    				],
    				[
    					-79.4236499,
    					43.6568987
    				],
    				[
    					-79.4236407,
    					43.656875
    				],
    				[
    					-79.4230843,
    					43.6554278
    				],
    				[
    					-79.42286,
    					43.6548424
    				],
    				[
    					-79.4228384,
    					43.6547843
    				]
    			]
    		},
    		id: "way/504884513"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/505422948",
    			embedded_rails: "tram",
    			foot: "no",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			name: "Bathurst Street",
    			note: "January 2020: Right lane only straight, left lane turn left",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3997923,
    					43.6366683
    				],
    				[
    					-79.3997761,
    					43.6366147
    				],
    				[
    					-79.3997675,
    					43.6365844
    				]
    			]
    		},
    		id: "way/505422948"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/507706187",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4329523,
    					43.6536176
    				],
    				[
    					-79.4329011,
    					43.6534858
    				]
    			]
    		},
    		id: "way/507706187"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/507706191",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4329011,
    					43.6534858
    				],
    				[
    					-79.4327384,
    					43.6530588
    				]
    			]
    		},
    		id: "way/507706191"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/511183610",
    			bicycle: "yes",
    			cycleway: "lane",
    			foot: "yes",
    			highway: "secondary",
    			horse: "yes",
    			lanes: "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bay Street",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3906957,
    					43.6731568
    				],
    				[
    					-79.3907511,
    					43.6730889
    				]
    			]
    		},
    		id: "way/511183610"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/511532422",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3992469,
    					43.6360774
    				],
    				[
    					-79.3989954,
    					43.6359666
    				],
    				[
    					-79.3985499,
    					43.6357735
    				],
    				[
    					-79.3985207,
    					43.6357609
    				],
    				[
    					-79.3983672,
    					43.6356912
    				]
    			]
    		},
    		id: "way/511532422"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/511532423",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3984951,
    					43.6359092
    				],
    				[
    					-79.3987727,
    					43.6360454
    				],
    				[
    					-79.3992067,
    					43.6362113
    				]
    			]
    		},
    		id: "way/511532423"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/511861347",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			"parking:condition:right": "no_stopping",
    			"parking:condition:right:2": "free",
    			"parking:condition:right:2:maxstay": "1 h",
    			"parking:condition:right:2:time_interval": "Mo-Fr 10:00-18:00; Sa 08:00-18:00",
    			"parking:condition:right:3": "residents",
    			"parking:condition:right:3:time_interval": "02:00-07:00",
    			"parking:condition:right:time_interval": "Mo-Fr 07:00-10:00",
    			"parking:lane:right": "parallel",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4396118,
    					43.6511538
    				],
    				[
    					-79.4387743,
    					43.6513216
    				],
    				[
    					-79.4382648,
    					43.651425
    				],
    				[
    					-79.4375778,
    					43.6515641
    				]
    			]
    		},
    		id: "way/511861347"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/512315976",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4397252,
    					43.6501675
    				],
    				[
    					-79.4396036,
    					43.6501592
    				]
    			]
    		},
    		id: "way/512315976"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/513335371",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "King Street West",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4422769,
    					43.6370383
    				],
    				[
    					-79.4420186,
    					43.6368871
    				],
    				[
    					-79.4417625,
    					43.6367274
    				],
    				[
    					-79.4416505,
    					43.6366631
    				],
    				[
    					-79.4415638,
    					43.6366221
    				],
    				[
    					-79.4414533,
    					43.6365773
    				],
    				[
    					-79.4413708,
    					43.6365501
    				],
    				[
    					-79.4412781,
    					43.6365244
    				]
    			]
    		},
    		id: "way/513335371"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/521697613",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Bloor Street West",
    			old_ref: "5",
    			"source:maxspeed": "ON:urban",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.399302,
    					43.6676217
    				],
    				[
    					-79.3983126,
    					43.6678404
    				]
    			]
    		},
    		id: "way/521697613"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/527270743",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			"parking:condition:right": "no_stopping",
    			"parking:condition:right:time_interval": "Mo-Fr 07:30-09:30",
    			"parking:lane:right": "no_parking",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4045152,
    					43.6665363
    				],
    				[
    					-79.4043276,
    					43.6665678
    				]
    			]
    		},
    		id: "way/527270743"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/527271900",
    			"cycleway:left": "lane",
    			"cycleway:right": "track",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "1",
    			"lanes:forward": "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4060268,
    					43.6662215
    				],
    				[
    					-79.4055484,
    					43.6663179
    				],
    				[
    					-79.4053307,
    					43.6663689
    				]
    			]
    		},
    		id: "way/527271900"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/538879477",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "1",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queens Quay West",
    			surface: "asphalt",
    			"turn:lanes:forward": "|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3914268,
    					43.6378405
    				],
    				[
    					-79.3916229,
    					43.6378008
    				],
    				[
    					-79.3916713,
    					43.637791
    				],
    				[
    					-79.3917817,
    					43.6377686
    				]
    			]
    		},
    		id: "way/538879477"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/538879481",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "1",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queens Quay West",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3900555,
    					43.6381372
    				],
    				[
    					-79.3905749,
    					43.6380263
    				],
    				[
    					-79.3906779,
    					43.6380043
    				]
    			]
    		},
    		id: "way/538879481"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/540084680",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4026843,
    					43.64392
    				],
    				[
    					-79.4026791,
    					43.6439069
    				],
    				[
    					-79.4026558,
    					43.6438485
    				],
    				[
    					-79.402645,
    					43.6438215
    				],
    				[
    					-79.4023892,
    					43.6431901
    				]
    			]
    		},
    		id: "way/540084680"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/542062073",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.393611,
    					43.6750933
    				],
    				[
    					-79.3934103,
    					43.674998
    				],
    				[
    					-79.3929814,
    					43.6747573
    				]
    			]
    		},
    		id: "way/542062073"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/542392068",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dupont Street",
    			"parking:condition:right": "no_stopping",
    			"parking:condition:right:time_interval": "Mo-Fr 07:00-09:00",
    			"parking:lane:right": "parallel",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4351892,
    					43.6691912
    				],
    				[
    					-79.4339299,
    					43.669447
    				]
    			]
    		},
    		id: "way/542392068"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/542393840",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:forward": "3",
    			lit: "yes",
    			name: "Dupont Street",
    			surface: "asphalt",
    			"turn:lanes:forward": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4397007,
    					43.6685045
    				],
    				[
    					-79.4391902,
    					43.6684645
    				],
    				[
    					-79.4390182,
    					43.6684583
    				]
    			]
    		},
    		id: "way/542393840"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/542393841",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:type": "sign",
    			name: "Dupont Street",
    			offpeaklanes: "2",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4441664,
    					43.6672399
    				],
    				[
    					-79.4440576,
    					43.6672948
    				],
    				[
    					-79.4440055,
    					43.6673476
    				],
    				[
    					-79.4438099,
    					43.6675629
    				]
    			]
    		},
    		id: "way/542393841"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/542395095",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4154788,
    					43.6310718
    				],
    				[
    					-79.4153506,
    					43.631091
    				],
    				[
    					-79.4151387,
    					43.6311302
    				],
    				[
    					-79.4148823,
    					43.6312289
    				]
    			]
    		},
    		id: "way/542395095"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/542398522",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			name: "Front Street West",
    			sidewalk: "both",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|left|through;right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3924962,
    					43.6431144
    				],
    				[
    					-79.3913602,
    					43.6433882
    				],
    				[
    					-79.3912375,
    					43.6434192
    				]
    			]
    		},
    		id: "way/542398522"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/542853490",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3925741,
    					43.674529
    				],
    				[
    					-79.3919427,
    					43.6741716
    				]
    			]
    		},
    		id: "way/542853490"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/547861653",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4028153,
    					43.6519257
    				],
    				[
    					-79.4023308,
    					43.6520248
    				],
    				[
    					-79.402247,
    					43.6520414
    				],
    				[
    					-79.4021707,
    					43.6520577
    				],
    				[
    					-79.4016486,
    					43.6521654
    				],
    				[
    					-79.4011128,
    					43.6522744
    				],
    				[
    					-79.4006896,
    					43.6523636
    				],
    				[
    					-79.3998273,
    					43.6525461
    				]
    			]
    		},
    		id: "way/547861653"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/547861654",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4047277,
    					43.6521044
    				],
    				[
    					-79.4043745,
    					43.6519442
    				],
    				[
    					-79.4040227,
    					43.6517879
    				],
    				[
    					-79.4039839,
    					43.6517753
    				]
    			]
    		},
    		id: "way/547861654"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/549370359",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Davenport Road",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.395959,
    					43.6748432
    				],
    				[
    					-79.3947943,
    					43.6750905
    				]
    			]
    		},
    		id: "way/549370359"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/552622284",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4067885,
    					43.6355425
    				],
    				[
    					-79.4070912,
    					43.6354818
    				],
    				[
    					-79.4074962,
    					43.6353101
    				]
    			]
    		},
    		id: "way/552622284"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/553282753",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dufferin Street",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4273517,
    					43.6389421
    				],
    				[
    					-79.4273466,
    					43.6389288
    				],
    				[
    					-79.4273231,
    					43.6388658
    				],
    				[
    					-79.427175,
    					43.6384651
    				],
    				[
    					-79.4268626,
    					43.6376612
    				],
    				[
    					-79.4267601,
    					43.6373933
    				],
    				[
    					-79.4266673,
    					43.6371526
    				],
    				[
    					-79.4266367,
    					43.6370732
    				],
    				[
    					-79.4265976,
    					43.6369724
    				],
    				[
    					-79.4263503,
    					43.6363208
    				],
    				[
    					-79.4260617,
    					43.635571
    				],
    				[
    					-79.4259694,
    					43.6353293
    				],
    				[
    					-79.425801,
    					43.6348829
    				]
    			]
    		},
    		id: "way/553282753"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/553562813",
    			"construction:cycleway:right": "track",
    			"cycleway:right": "no",
    			highway: "secondary",
    			lanes: "1",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Richmond Street West",
    			note: "November 14, 2019: watermain construction - road narrowed to 1 lane shared between cars and bikes.",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3932835,
    					43.648416
    				],
    				[
    					-79.3933796,
    					43.6483763
    				],
    				[
    					-79.3939452,
    					43.6482531
    				],
    				[
    					-79.3946788,
    					43.6480934
    				],
    				[
    					-79.3952348,
    					43.6479714
    				]
    			]
    		},
    		id: "way/553562813"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/553562816",
    			"cycleway:right": "track",
    			"embedded_rails:lanes": "|tram|tram",
    			highway: "secondary",
    			lanes: "3",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Adelaide Street West",
    			note: "3 lanes + bike lane, was formerly 4 lanes",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.39283,
    					43.6473153
    				],
    				[
    					-79.3927181,
    					43.6473376
    				],
    				[
    					-79.3921786,
    					43.6474524
    				],
    				[
    					-79.3915493,
    					43.647585
    				],
    				[
    					-79.3910778,
    					43.6476846
    				],
    				[
    					-79.3908966,
    					43.6477222
    				],
    				[
    					-79.3903647,
    					43.6478353
    				],
    				[
    					-79.3902564,
    					43.6478582
    				],
    				[
    					-79.3901672,
    					43.6478774
    				],
    				[
    					-79.3894575,
    					43.6480309
    				],
    				[
    					-79.3887534,
    					43.6481836
    				],
    				[
    					-79.3886478,
    					43.6482059
    				],
    				[
    					-79.3885414,
    					43.6482283
    				],
    				[
    					-79.3877202,
    					43.6484047
    				],
    				[
    					-79.3874821,
    					43.6484557
    				],
    				[
    					-79.386945,
    					43.6485716
    				],
    				[
    					-79.3866991,
    					43.6486246
    				],
    				[
    					-79.3865899,
    					43.6486472
    				]
    			]
    		},
    		id: "way/553562816"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/553564802",
    			"construction:cycleway:right": "track",
    			"cycleway:right": "no",
    			highway: "secondary",
    			lanes: "1",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Richmond Street West",
    			note: "December 10, 2019: watermain construction - road narrowed to 1 lane shared between cars and bikes. Sometimes there is a somewhat separate space for bikes, but not guaranteed nor maintained by contractor.",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3871068,
    					43.6499017
    				],
    				[
    					-79.3872112,
    					43.6498793
    				],
    				[
    					-79.3876882,
    					43.6497737
    				],
    				[
    					-79.3890342,
    					43.649479
    				],
    				[
    					-79.3891439,
    					43.6494561
    				],
    				[
    					-79.3892528,
    					43.6494345
    				],
    				[
    					-79.3901901,
    					43.6492346
    				],
    				[
    					-79.3906846,
    					43.6491292
    				],
    				[
    					-79.3907692,
    					43.6491089
    				]
    			]
    		},
    		id: "way/553564802"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/557114975",
    			bridge: "yes",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			layer: "1",
    			lcn: "yes",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4446331,
    					43.6510401
    				],
    				[
    					-79.4434484,
    					43.6507662
    				]
    			]
    		},
    		id: "way/557114975"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/662371574",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4195638,
    					43.6440282
    				],
    				[
    					-79.4194855,
    					43.6440389
    				],
    				[
    					-79.4193984,
    					43.6440526
    				],
    				[
    					-79.419177,
    					43.6440933
    				],
    				[
    					-79.4189516,
    					43.6441434
    				],
    				[
    					-79.4188487,
    					43.6441648
    				]
    			]
    		},
    		id: "way/662371574"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/667257322",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			oneway: "yes",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3982776,
    					43.6357001
    				],
    				[
    					-79.3982926,
    					43.6357677
    				],
    				[
    					-79.3983024,
    					43.6358087
    				]
    			]
    		},
    		id: "way/667257322"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/669650559",
    			bridge: "yes",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			layer: "1",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt",
    			"wikipedia:en": "Sir_Isaac_Brock_Bridge"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4011346,
    					43.6400792
    				],
    				[
    					-79.4013654,
    					43.6406398
    				]
    			]
    		},
    		id: "way/669650559"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/670052682",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Queens Quay West",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3908782,
    					43.6379602
    				],
    				[
    					-79.3909895,
    					43.6379324
    				],
    				[
    					-79.3910723,
    					43.6379165
    				]
    			]
    		},
    		id: "way/670052682"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/670070532",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4014083,
    					43.6407423
    				],
    				[
    					-79.4013654,
    					43.6406398
    				]
    			]
    		},
    		id: "way/670070532"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/670070533",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt",
    			"turn:lanes:forward": "left;through|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4021638,
    					43.6426459
    				],
    				[
    					-79.401902,
    					43.6419984
    				],
    				[
    					-79.4018704,
    					43.6419181
    				]
    			]
    		},
    		id: "way/670070533"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/670070534",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4023892,
    					43.6431901
    				],
    				[
    					-79.4021853,
    					43.6427001
    				],
    				[
    					-79.4021638,
    					43.6426459
    				]
    			]
    		},
    		id: "way/670070534"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/671763655",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			"maxspeed:advisory": "25",
    			name: "Spadina Crescent",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.401216,
    					43.6602073
    				],
    				[
    					-79.4012893,
    					43.6601588
    				],
    				[
    					-79.4013153,
    					43.660137
    				],
    				[
    					-79.4013853,
    					43.6600834
    				],
    				[
    					-79.4014512,
    					43.6600122
    				],
    				[
    					-79.4014989,
    					43.6599403
    				],
    				[
    					-79.40154,
    					43.6598521
    				],
    				[
    					-79.4015573,
    					43.6597867
    				],
    				[
    					-79.4015698,
    					43.6596816
    				],
    				[
    					-79.4015573,
    					43.6596013
    				],
    				[
    					-79.4015277,
    					43.6594997
    				],
    				[
    					-79.4014683,
    					43.6593993
    				],
    				[
    					-79.401415,
    					43.6593383
    				],
    				[
    					-79.4013287,
    					43.6592616
    				],
    				[
    					-79.4012329,
    					43.6592031
    				],
    				[
    					-79.4011391,
    					43.6591605
    				],
    				[
    					-79.4010306,
    					43.6591254
    				],
    				[
    					-79.4009147,
    					43.6590999
    				],
    				[
    					-79.400842,
    					43.6590878
    				],
    				[
    					-79.4007863,
    					43.6590786
    				],
    				[
    					-79.4007256,
    					43.659066
    				]
    			]
    		},
    		id: "way/671763655"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/675739578",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|through",
    			"turn:lanes:forward:note": "Left lane left turn only except streetcars"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4519466,
    					43.6543879
    				],
    				[
    					-79.4518323,
    					43.6539455
    				]
    			]
    		},
    		id: "way/675739578"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/675739581",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "both",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4524425,
    					43.6563264
    				],
    				[
    					-79.4524666,
    					43.6563217
    				],
    				[
    					-79.4525592,
    					43.6563034
    				],
    				[
    					-79.4531887,
    					43.6561657
    				]
    			]
    		},
    		id: "way/675739581"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/676048957",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			maxspeed: "40",
    			name: "Jameson Avenue",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4372577,
    					43.6404653
    				],
    				[
    					-79.4372525,
    					43.6404526
    				],
    				[
    					-79.4372262,
    					43.640388
    				],
    				[
    					-79.4371229,
    					43.6400978
    				]
    			]
    		},
    		id: "way/676048957"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/676048969",
    			"embedded_rails:lanes": "tram||",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			maxspeed: "50",
    			name: "The Queensway",
    			note: "Left turn lanes are on streetcar track, streetcars go straight",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt",
    			"turn:lanes": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4503006,
    					43.6390607
    				],
    				[
    					-79.4497132,
    					43.6389504
    				],
    				[
    					-79.4484637,
    					43.6387202
    				]
    			]
    		},
    		id: "way/676048969"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/676048971",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "50",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4513402,
    					43.6392805
    				],
    				[
    					-79.4511772,
    					43.6392395
    				],
    				[
    					-79.4509565,
    					43.6391839
    				],
    				[
    					-79.4503006,
    					43.6390607
    				]
    			]
    		},
    		id: "way/676048971"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/678037398",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "St. Clair Avenue West",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left|none|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4511781,
    					43.6760882
    				],
    				[
    					-79.4510756,
    					43.676109
    				]
    			]
    		},
    		id: "way/678037398"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/678037716",
    			hgv: "no",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4505399,
    					43.6762155
    				],
    				[
    					-79.4505295,
    					43.6761941
    				],
    				[
    					-79.4505147,
    					43.6761657
    				],
    				[
    					-79.4503755,
    					43.6758354
    				]
    			]
    		},
    		id: "way/678037716"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/679046740",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4130602,
    					43.6647401
    				],
    				[
    					-79.4124277,
    					43.6648768
    				],
    				[
    					-79.4118111,
    					43.665008
    				]
    			]
    		},
    		id: "way/679046740"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/679046741",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4136331,
    					43.6646094
    				],
    				[
    					-79.4135448,
    					43.664629
    				],
    				[
    					-79.4130602,
    					43.6647401
    				]
    			]
    		},
    		id: "way/679046741"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/679046742",
    			cycleway: "track",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			surface: "asphalt",
    			"turn:lanes:backward": "left|none"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4160234,
    					43.6640851
    				],
    				[
    					-79.4159161,
    					43.66411
    				],
    				[
    					-79.4154098,
    					43.6642206
    				]
    			]
    		},
    		id: "way/679046742"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/680230441",
    			"embedded_rails:lanes": "none|tram|none|none",
    			highway: "secondary",
    			lanes: "4",
    			"lanes:backward": "2",
    			"lanes:forward": "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			note: "January 2020: Right lane only straight, middle lane streetcar only, left lane turn left",
    			sidewalk: "separate",
    			surface: "asphalt",
    			"turn:lanes:forward": "left|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4000285,
    					43.6373594
    				],
    				[
    					-79.3998491,
    					43.6369174
    				]
    			]
    		},
    		id: "way/680230441"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/680230451",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt",
    			"turn:lanes:backward": "left;through|through;right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.403867,
    					43.6468308
    				],
    				[
    					-79.4037442,
    					43.6465286
    				],
    				[
    					-79.4037195,
    					43.6464618
    				]
    			]
    		},
    		id: "way/680230451"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/680230487",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bathurst Street",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4046804,
    					43.648977
    				],
    				[
    					-79.4046472,
    					43.6488933
    				],
    				[
    					-79.4046215,
    					43.6488274
    				]
    			]
    		},
    		id: "way/680230487"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/680587995",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Ossington Avenue",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4225314,
    					43.6539899
    				],
    				[
    					-79.4225019,
    					43.6539157
    				],
    				[
    					-79.4223434,
    					43.6535007
    				],
    				[
    					-79.4221807,
    					43.6530751
    				],
    				[
    					-79.422013,
    					43.6526393
    				],
    				[
    					-79.4218883,
    					43.6523214
    				],
    				[
    					-79.4217897,
    					43.6520613
    				],
    				[
    					-79.4217685,
    					43.6520054
    				],
    				[
    					-79.4217516,
    					43.6519619
    				],
    				[
    					-79.4215595,
    					43.6514624
    				],
    				[
    					-79.4213645,
    					43.6509608
    				],
    				[
    					-79.4212121,
    					43.6505609
    				],
    				[
    					-79.421065,
    					43.6501782
    				],
    				[
    					-79.4209042,
    					43.6497622
    				],
    				[
    					-79.4207827,
    					43.6494395
    				],
    				[
    					-79.4207725,
    					43.6494149
    				],
    				[
    					-79.420768,
    					43.6493937
    				],
    				[
    					-79.4207585,
    					43.6493492
    				],
    				[
    					-79.4207551,
    					43.6493335
    				]
    			]
    		},
    		id: "way/680587995"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/680812301",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "||right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3952182,
    					43.6462449
    				],
    				[
    					-79.3954077,
    					43.6466987
    				],
    				[
    					-79.3954221,
    					43.6467296
    				],
    				[
    					-79.3954439,
    					43.6467753
    				]
    			]
    		},
    		id: "way/680812301"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/680916769",
    			"cycleway:right": "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "Dundas Street West",
    			"name:zh": "登打士西街",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4409437,
    					43.6502495
    				],
    				[
    					-79.4406962,
    					43.6502333
    				]
    			]
    		},
    		id: "way/680916769"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/681692828",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "2",
    			maxspeed: "60",
    			name: "The Queensway",
    			oneway: "yes",
    			sidewalk: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4538494,
    					43.6396304
    				],
    				[
    					-79.4531025,
    					43.6396376
    				]
    			]
    		},
    		id: "way/681692828"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/682158381",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4124206,
    					43.641956
    				],
    				[
    					-79.4122258,
    					43.6419951
    				]
    			]
    		},
    		id: "way/682158381"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/682158382",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4127007,
    					43.6418998
    				],
    				[
    					-79.4124206,
    					43.641956
    				]
    			]
    		},
    		id: "way/682158382"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/683031973",
    			cycleway: "shared_lane",
    			embedded_rails: "tram",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4272474,
    					43.6534248
    				],
    				[
    					-79.4264797,
    					43.6535879
    				],
    				[
    					-79.4263871,
    					43.6536104
    				]
    			]
    		},
    		id: "way/683031973"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/683232008",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4488734,
    					43.6570616
    				],
    				[
    					-79.4495802,
    					43.6569104
    				]
    			]
    		},
    		id: "way/683232008"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/683232010",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			maxspeed: "40",
    			name: "Queen Street West",
    			"name:zh": "皇后西街",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4409231,
    					43.6397346
    				],
    				[
    					-79.4408138,
    					43.6397569
    				],
    				[
    					-79.4398542,
    					43.6399526
    				],
    				[
    					-79.439334,
    					43.6400537
    				],
    				[
    					-79.4390882,
    					43.6401011
    				],
    				[
    					-79.4379058,
    					43.6403382
    				]
    			]
    		},
    		id: "way/683232010"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/683720919",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.448024,
    					43.65724
    				],
    				[
    					-79.4488734,
    					43.6570616
    				]
    			]
    		},
    		id: "way/683720919"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/684635748",
    			highway: "secondary",
    			lanes: "5",
    			"lanes:backward": "3",
    			"lanes:forward": "2",
    			lit: "yes",
    			name: "Spadina Avenue",
    			surface: "asphalt",
    			"turn:lanes:backward": "left||through;right"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4038017,
    					43.6666633
    				],
    				[
    					-79.4037506,
    					43.6665757
    				],
    				[
    					-79.4035688,
    					43.6662862
    				]
    			]
    		},
    		id: "way/684635748"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/684639048",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "yes",
    			sidewalk: "right",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3934036,
    					43.6382021
    				],
    				[
    					-79.392686,
    					43.6383695
    				]
    			]
    		},
    		id: "way/684639048"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/690971697",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "3",
    			lit: "yes",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "left||"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3966891,
    					43.6493064
    				],
    				[
    					-79.3965046,
    					43.6488366
    				],
    				[
    					-79.3964852,
    					43.6487814
    				],
    				[
    					-79.3964722,
    					43.6487445
    				],
    				[
    					-79.396467,
    					43.6487299
    				]
    			]
    		},
    		id: "way/690971697"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/693813453",
    			cycleway: "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Spadina Avenue",
    			"name:zh": "士巴丹拿道",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4001546,
    					43.6579539
    				],
    				[
    					-79.4001523,
    					43.6579491
    				],
    				[
    					-79.4001492,
    					43.6579409
    				],
    				[
    					-79.400137,
    					43.6579033
    				]
    			]
    		},
    		id: "way/693813453"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/693813454",
    			"cycleway:left": "lane",
    			"embedded_rails:lanes": "|tram|tram",
    			highway: "secondary",
    			lanes: "3",
    			"lanes:backward": "2",
    			"lanes:forward": "1",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4012197,
    					43.657755
    				],
    				[
    					-79.4011841,
    					43.6577624
    				],
    				[
    					-79.4010283,
    					43.6577976
    				],
    				[
    					-79.4007912,
    					43.6578465
    				],
    				[
    					-79.4004105,
    					43.6579217
    				],
    				[
    					-79.4003124,
    					43.6579406
    				],
    				[
    					-79.4002651,
    					43.6579507
    				],
    				[
    					-79.4002335,
    					43.6579535
    				],
    				[
    					-79.4001983,
    					43.6579542
    				],
    				[
    					-79.4001687,
    					43.6579537
    				],
    				[
    					-79.4001546,
    					43.6579539
    				]
    			]
    		},
    		id: "way/693813454"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/695753527",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4018902,
    					43.6576151
    				],
    				[
    					-79.4017999,
    					43.6576348
    				],
    				[
    					-79.4012197,
    					43.657755
    				]
    			]
    		},
    		id: "way/695753527"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/706827801",
    			"cycleway:right": "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Richmond Street West",
    			note: "December 4, 2019: watermain construction complete. Bike lane + 2 car lanes + parking on most of left side",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4011086,
    					43.6469733
    				],
    				[
    					-79.4011924,
    					43.6469567
    				],
    				[
    					-79.402201,
    					43.6467566
    				],
    				[
    					-79.4028579,
    					43.6466297
    				]
    			]
    		},
    		id: "way/706827801"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/706827802",
    			"cycleway:right": "shared_lane",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Richmond Street West",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4028579,
    					43.6466297
    				],
    				[
    					-79.4031734,
    					43.6465691
    				],
    				[
    					-79.4035539,
    					43.6464937
    				],
    				[
    					-79.4036989,
    					43.6464658
    				],
    				[
    					-79.4037195,
    					43.6464618
    				]
    			]
    		},
    		id: "way/706827802"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/706827803",
    			"cycleway:right": "track",
    			highway: "secondary",
    			lanes: "2",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Richmond Street West",
    			note: "December 4, 2019: watermain construction complete",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3958796,
    					43.6478404
    				],
    				[
    					-79.3959746,
    					43.647839
    				],
    				[
    					-79.3960141,
    					43.6478392
    				],
    				[
    					-79.3961085,
    					43.6478428
    				],
    				[
    					-79.3962215,
    					43.647849
    				]
    			]
    		},
    		id: "way/706827803"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/712391519",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxheight: "3.8",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4495802,
    					43.6569104
    				],
    				[
    					-79.4502434,
    					43.6567686
    				]
    			]
    		},
    		id: "way/712391519"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/715189331",
    			"bicycle:lanes": "yes|designated",
    			cycleway: "lane",
    			highway: "secondary",
    			lanes: "1",
    			lit: "yes",
    			maxspeed: "40",
    			"motor_vehicle:lanes": "yes|no",
    			name: "Davenport Road",
    			oneway: "yes",
    			surface: "asphalt",
    			"turn:lanes": "through|through"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3907511,
    					43.6730889
    				],
    				[
    					-79.3906718,
    					43.6730501
    				]
    			]
    		},
    		id: "way/715189331"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/722283185",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "50",
    			name: "Parkside Drive",
    			sidewalk: "both",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.454823,
    					43.6414564
    				],
    				[
    					-79.4547553,
    					43.6412928
    				],
    				[
    					-79.4546621,
    					43.6410556
    				],
    				[
    					-79.4546383,
    					43.6409884
    				],
    				[
    					-79.4546043,
    					43.6409118
    				],
    				[
    					-79.4542319,
    					43.6400173
    				],
    				[
    					-79.4541675,
    					43.6398958
    				]
    			]
    		},
    		id: "way/722283185"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/742249899",
    			highway: "secondary",
    			lanes: "2",
    			lit: "yes",
    			maxheight: "4",
    			maxspeed: "40",
    			name: "Bloor Street West",
    			old_ref: "5",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4453504,
    					43.6577913
    				],
    				[
    					-79.4452983,
    					43.6577808
    				],
    				[
    					-79.4451749,
    					43.657808
    				],
    				[
    					-79.4451442,
    					43.6578389
    				]
    			]
    		},
    		id: "way/742249899"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/745505114",
    			"construction:cycleway:right": "track",
    			"cycleway:right": "no",
    			highway: "secondary",
    			lanes: "1",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Richmond Street West",
    			note: "November 14, 2019: watermain construction - road narrowed to 1 lane shared between cars and bikes.",
    			oneway: "yes",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3907692,
    					43.6491089
    				],
    				[
    					-79.3908756,
    					43.6490863
    				],
    				[
    					-79.39204,
    					43.6488346
    				],
    				[
    					-79.3924913,
    					43.6487454
    				],
    				[
    					-79.3925866,
    					43.6487268
    				],
    				[
    					-79.3926904,
    					43.6486868
    				],
    				[
    					-79.3931661,
    					43.6484667
    				],
    				[
    					-79.3932835,
    					43.648416
    				]
    			]
    		},
    		id: "way/745505114"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/760060363",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			name: "King Street West",
    			note: "Centre lane TTC, taxis only 7-9a 4-6p",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4222676,
    					43.6399702
    				],
    				[
    					-79.4213883,
    					43.640149
    				],
    				[
    					-79.4212564,
    					43.6401734
    				]
    			]
    		},
    		id: "way/760060363"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/761889504",
    			highway: "secondary",
    			lanes: "6",
    			lit: "yes",
    			maxspeed: "60",
    			name: "Lake Shore Boulevard West",
    			oneway: "no",
    			sidewalk: "separate",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.3995215,
    					43.6365184
    				],
    				[
    					-79.3996033,
    					43.6364885
    				],
    				[
    					-79.3996143,
    					43.6364845
    				],
    				[
    					-79.3996733,
    					43.636464
    				],
    				[
    					-79.3996881,
    					43.6364592
    				],
    				[
    					-79.3997044,
    					43.6364536
    				]
    			]
    		},
    		id: "way/761889504"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/767734407",
    			cycleway: "lane",
    			"embedded_rails:lanes": "|tram|tram|",
    			highway: "secondary",
    			lanes: "4",
    			lit: "yes",
    			maxspeed: "40",
    			name: "College Street",
    			"name:zh": "書院街",
    			oneway: "no",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.405162,
    					43.656965
    				],
    				[
    					-79.405093,
    					43.6569789
    				]
    			]
    		},
    		id: "way/767734407"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/772802466",
    			cycleway: "shared_lane",
    			"hgv:conditional": "no @ (19:00-07:00)",
    			highway: "secondary",
    			lanes: "4",
    			lcn: "yes",
    			lit: "yes",
    			maxspeed: "40",
    			name: "Lansdowne Avenue",
    			surface: "asphalt"
    		},
    		geometry: {
    			type: "LineString",
    			coordinates: [
    				[
    					-79.4464511,
    					43.6667349
    				],
    				[
    					-79.4464192,
    					43.6666572
    				],
    				[
    					-79.446318,
    					43.6663945
    				],
    				[
    					-79.4462727,
    					43.6662634
    				]
    			]
    		},
    		id: "way/772802466"
    	}
    ];
    var roads = {
    	type: type,
    	generator: generator,
    	copyright: copyright,
    	timestamp: timestamp,
    	features: features
    };

    var type$1 = "FeatureCollection";
    var generator$1 = "overpass-ide";
    var copyright$1 = "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.";
    var timestamp$1 = "2020-05-19T17:18:02Z";
    var features$1 = [
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4300643",
    			"addr:city": "Toronto",
    			"addr:housenumber": "750",
    			"addr:street": "Bloor Street West",
    			leisure: "park",
    			name: "Christie Pits Park",
    			wikidata: "Q2965849",
    			wikipedia: "en:Christie Pits"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4220146,
    						43.6658464
    					],
    					[
    						-79.4231558,
    						43.6655822
    					],
    					[
    						-79.422992,
    						43.6651725
    					],
    					[
    						-79.4227124,
    						43.6652599
    					],
    					[
    						-79.4226225,
    						43.6650872
    					],
    					[
    						-79.4229199,
    						43.6650352
    					],
    					[
    						-79.4228312,
    						43.6648198
    					],
    					[
    						-79.4226265,
    						43.6648627
    					],
    					[
    						-79.4225776,
    						43.6647361
    					],
    					[
    						-79.4227891,
    						43.6646919
    					],
    					[
    						-79.4227267,
    						43.6645386
    					],
    					[
    						-79.4224838,
    						43.6645846
    					],
    					[
    						-79.4223816,
    						43.6643083
    					],
    					[
    						-79.4226332,
    						43.6642537
    					],
    					[
    						-79.422188,
    						43.6632038
    					],
    					[
    						-79.4221074,
    						43.6632173
    					],
    					[
    						-79.4218135,
    						43.6632789
    					],
    					[
    						-79.421724,
    						43.6630604
    					],
    					[
    						-79.4216749,
    						43.6629403
    					],
    					[
    						-79.419043,
    						43.6635113
    					],
    					[
    						-79.4190661,
    						43.6637309
    					],
    					[
    						-79.4188934,
    						43.6642124
    					],
    					[
    						-79.4188475,
    						43.6643677
    					],
    					[
    						-79.4197115,
    						43.6664734
    					],
    					[
    						-79.4206282,
    						43.6662618
    					],
    					[
    						-79.4215637,
    						43.6660459
    					],
    					[
    						-79.4220146,
    						43.6658464
    					]
    				]
    			]
    		},
    		id: "way/4300643"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/4321327",
    			leisure: "park",
    			name: "Queen's Park (North)",
    			wikipedia: "en:Queen's Park (Toronto)"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3922202,
    						43.6659795
    					],
    					[
    						-79.3924332,
    						43.6660127
    					],
    					[
    						-79.3926179,
    						43.6660123
    					],
    					[
    						-79.3927594,
    						43.6660026
    					],
    					[
    						-79.3928847,
    						43.665982
    					],
    					[
    						-79.3930003,
    						43.665953
    					],
    					[
    						-79.3931099,
    						43.665917
    					],
    					[
    						-79.3933269,
    						43.6658068
    					],
    					[
    						-79.3935021,
    						43.6656663
    					],
    					[
    						-79.3936222,
    						43.6655472
    					],
    					[
    						-79.3937311,
    						43.6653904
    					],
    					[
    						-79.3937877,
    						43.6652628
    					],
    					[
    						-79.3938063,
    						43.6651833
    					],
    					[
    						-79.3938092,
    						43.6650829
    					],
    					[
    						-79.3938063,
    						43.6649821
    					],
    					[
    						-79.3937765,
    						43.6648822
    					],
    					[
    						-79.3934926,
    						43.6641311
    					],
    					[
    						-79.3934347,
    						43.6640298
    					],
    					[
    						-79.393356,
    						43.663933
    					],
    					[
    						-79.393092,
    						43.6636736
    					],
    					[
    						-79.3928036,
    						43.663381
    					],
    					[
    						-79.3927437,
    						43.663318
    					],
    					[
    						-79.3926248,
    						43.6632665
    					],
    					[
    						-79.3925023,
    						43.6632445
    					],
    					[
    						-79.3908559,
    						43.6636167
    					],
    					[
    						-79.3907809,
    						43.6636419
    					],
    					[
    						-79.390758,
    						43.6636758
    					],
    					[
    						-79.390758,
    						43.6637117
    					],
    					[
    						-79.3907835,
    						43.6637733
    					],
    					[
    						-79.3914527,
    						43.6654012
    					],
    					[
    						-79.3914931,
    						43.665508
    					],
    					[
    						-79.3915587,
    						43.6656049
    					],
    					[
    						-79.3916573,
    						43.6657139
    					],
    					[
    						-79.391777,
    						43.6658002
    					],
    					[
    						-79.3919817,
    						43.6659122
    					],
    					[
    						-79.3922202,
    						43.6659795
    					]
    				]
    			]
    		},
    		id: "way/4321327"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5686871",
    			leisure: "park",
    			name: "Grange Park",
    			wikidata: "Q5595673",
    			wikipedia: "en:Grange Park (Toronto)"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3929055,
    						43.6518465
    					],
    					[
    						-79.3921074,
    						43.6520201
    					],
    					[
    						-79.3919568,
    						43.6516684
    					],
    					[
    						-79.3919416,
    						43.651629
    					],
    					[
    						-79.3917723,
    						43.6512205
    					],
    					[
    						-79.3914856,
    						43.6512774
    					],
    					[
    						-79.391747,
    						43.6518546
    					],
    					[
    						-79.391816,
    						43.6520185
    					],
    					[
    						-79.3915415,
    						43.652079
    					],
    					[
    						-79.391557,
    						43.6521159
    					],
    					[
    						-79.3916233,
    						43.6522773
    					],
    					[
    						-79.3911581,
    						43.6523703
    					],
    					[
    						-79.3913206,
    						43.6527729
    					],
    					[
    						-79.3915008,
    						43.6528065
    					],
    					[
    						-79.391668,
    						43.6531965
    					],
    					[
    						-79.3921267,
    						43.6530937
    					],
    					[
    						-79.392228,
    						43.6529982
    					],
    					[
    						-79.3924598,
    						43.6529582
    					],
    					[
    						-79.3925877,
    						43.6529361
    					],
    					[
    						-79.3927757,
    						43.6529633
    					],
    					[
    						-79.3929918,
    						43.6529148
    					],
    					[
    						-79.393316,
    						43.652854
    					],
    					[
    						-79.3932155,
    						43.6526066
    					],
    					[
    						-79.3929055,
    						43.6518465
    					]
    				]
    			]
    		},
    		id: "way/5686871"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5941201",
    			"addr:city": "Toronto",
    			"addr:housenumber": "1053",
    			"addr:street": "Dundas Street West",
    			leisure: "park",
    			name: "Trinity Bellwoods Park",
    			wikidata: "Q3363926",
    			wikipedia: "en:Trinity Bellwoods Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4153895,
    						43.6473454
    					],
    					[
    						-79.4158893,
    						43.6472478
    					],
    					[
    						-79.4155124,
    						43.6462967
    					],
    					[
    						-79.4151564,
    						43.6453918
    					],
    					[
    						-79.4146889,
    						43.6454849
    					],
    					[
    						-79.414699,
    						43.6455102
    					],
    					[
    						-79.4143749,
    						43.6455759
    					],
    					[
    						-79.4142766,
    						43.6453151
    					],
    					[
    						-79.4142412,
    						43.6452168
    					],
    					[
    						-79.4117386,
    						43.6457218
    					],
    					[
    						-79.4116004,
    						43.6458833
    					],
    					[
    						-79.4119424,
    						43.6467295
    					],
    					[
    						-79.4124386,
    						43.6479426
    					],
    					[
    						-79.4129857,
    						43.6493487
    					],
    					[
    						-79.4131829,
    						43.6498562
    					],
    					[
    						-79.4132291,
    						43.6499868
    					],
    					[
    						-79.4138485,
    						43.6498627
    					],
    					[
    						-79.4139307,
    						43.6500872
    					],
    					[
    						-79.4156418,
    						43.6497815
    					],
    					[
    						-79.4158005,
    						43.6502273
    					],
    					[
    						-79.416889,
    						43.6500095
    					],
    					[
    						-79.4171479,
    						43.649961
    					],
    					[
    						-79.4180088,
    						43.6497888
    					],
    					[
    						-79.4180501,
    						43.6497459
    					],
    					[
    						-79.4177862,
    						43.6490556
    					],
    					[
    						-79.4177053,
    						43.6490055
    					],
    					[
    						-79.4172559,
    						43.649093
    					],
    					[
    						-79.4171336,
    						43.6491184
    					],
    					[
    						-79.4168683,
    						43.6490465
    					],
    					[
    						-79.4167093,
    						43.6490207
    					],
    					[
    						-79.4165886,
    						43.6490377
    					],
    					[
    						-79.4163424,
    						43.6489907
    					],
    					[
    						-79.4158798,
    						43.648832
    					],
    					[
    						-79.4157813,
    						43.6487956
    					],
    					[
    						-79.4156603,
    						43.6487602
    					],
    					[
    						-79.4154594,
    						43.6487262
    					],
    					[
    						-79.4153836,
    						43.6487034
    					],
    					[
    						-79.4153202,
    						43.6486657
    					],
    					[
    						-79.4152542,
    						43.6486034
    					],
    					[
    						-79.4152163,
    						43.6485289
    					],
    					[
    						-79.4151831,
    						43.6484802
    					],
    					[
    						-79.4151476,
    						43.6484603
    					],
    					[
    						-79.4151208,
    						43.6484603
    					],
    					[
    						-79.4150911,
    						43.6483821
    					],
    					[
    						-79.4151389,
    						43.6483909
    					],
    					[
    						-79.4153012,
    						43.6483928
    					],
    					[
    						-79.415448,
    						43.6483332
    					],
    					[
    						-79.4155828,
    						43.6482706
    					],
    					[
    						-79.4157381,
    						43.6482229
    					],
    					[
    						-79.4155661,
    						43.6477839
    					],
    					[
    						-79.4153895,
    						43.6473454
    					]
    				]
    			]
    		},
    		id: "way/5941201"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/5941460",
    			"addr:city": "Toronto",
    			"addr:housenumber": "155",
    			"addr:street": "Roxton Road",
    			leisure: "park",
    			name: "Fred Hamilton Playground",
    			"name:source": "City of Toronto website",
    			website: "https://www.toronto.ca/data/parks/prd/facilities/complex/72/index.html"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4195228,
    						43.6528579
    					],
    					[
    						-79.4200274,
    						43.6541508
    					],
    					[
    						-79.4205143,
    						43.654056
    					],
    					[
    						-79.4204133,
    						43.6538276
    					],
    					[
    						-79.4210373,
    						43.6536999
    					],
    					[
    						-79.4202235,
    						43.6515738
    					],
    					[
    						-79.4196825,
    						43.6516789
    					],
    					[
    						-79.4198904,
    						43.6522079
    					],
    					[
    						-79.4200999,
    						43.6527424
    					],
    					[
    						-79.4195228,
    						43.6528579
    					]
    				]
    			]
    		},
    		id: "way/5941460"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/6694662",
    			leisure: "park",
    			name: "St. Patrick's Square"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3908545,
    						43.6508751
    					],
    					[
    						-79.3907931,
    						43.6507768
    					],
    					[
    						-79.3907449,
    						43.6507002
    					],
    					[
    						-79.3907019,
    						43.6506201
    					],
    					[
    						-79.3906926,
    						43.6505689
    					],
    					[
    						-79.3906627,
    						43.6504947
    					],
    					[
    						-79.3906446,
    						43.6504811
    					],
    					[
    						-79.3906124,
    						43.6504746
    					],
    					[
    						-79.3905102,
    						43.6504974
    					],
    					[
    						-79.3904927,
    						43.6505088
    					],
    					[
    						-79.3904854,
    						43.650526
    					],
    					[
    						-79.3906044,
    						43.6508152
    					],
    					[
    						-79.3906258,
    						43.6508671
    					],
    					[
    						-79.3906507,
    						43.6508897
    					],
    					[
    						-79.3906654,
    						43.6509154
    					],
    					[
    						-79.3908545,
    						43.6508751
    					]
    				]
    			]
    		},
    		id: "way/6694662"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/7913126",
    			leisure: "park",
    			name: "Jean Sibelius Square"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4091777,
    						43.6710996
    					],
    					[
    						-79.4091609,
    						43.6710724
    					],
    					[
    						-79.4091354,
    						43.6710549
    					],
    					[
    						-79.4091093,
    						43.6710471
    					],
    					[
    						-79.4090764,
    						43.6710428
    					],
    					[
    						-79.4083153,
    						43.6712009
    					],
    					[
    						-79.4082791,
    						43.6712116
    					],
    					[
    						-79.408259,
    						43.6712232
    					],
    					[
    						-79.4082423,
    						43.6712416
    					],
    					[
    						-79.4082351,
    						43.6712567
    					],
    					[
    						-79.4084492,
    						43.6718047
    					],
    					[
    						-79.4084709,
    						43.6718406
    					],
    					[
    						-79.408485,
    						43.6718523
    					],
    					[
    						-79.4085024,
    						43.671861
    					],
    					[
    						-79.4085199,
    						43.6718658
    					],
    					[
    						-79.4085366,
    						43.6718668
    					],
    					[
    						-79.408593,
    						43.6718605
    					],
    					[
    						-79.4092111,
    						43.6717286
    					],
    					[
    						-79.4093037,
    						43.6717004
    					],
    					[
    						-79.4093359,
    						43.6716859
    					],
    					[
    						-79.4093576,
    						43.6716728
    					],
    					[
    						-79.4093735,
    						43.6716568
    					],
    					[
    						-79.4093802,
    						43.6716427
    					],
    					[
    						-79.4093822,
    						43.6716267
    					],
    					[
    						-79.4093792,
    						43.6716077
    					],
    					[
    						-79.4091777,
    						43.6710996
    					]
    				]
    			]
    		},
    		id: "way/7913126"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/7969155",
    			"addr:city": "Toronto",
    			"addr:housenumber": "25",
    			"addr:street": "Clarence Square",
    			leisure: "park",
    			name: "Clarence Square",
    			wikidata: "Q5126756",
    			wikipedia: "en:Clarence Square"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3931915,
    						43.6444456
    					],
    					[
    						-79.3932326,
    						43.6445405
    					],
    					[
    						-79.3933058,
    						43.6445767
    					],
    					[
    						-79.3933983,
    						43.6445767
    					],
    					[
    						-79.394366,
    						43.6443919
    					],
    					[
    						-79.3940458,
    						43.6436704
    					],
    					[
    						-79.3931285,
    						43.6438623
    					],
    					[
    						-79.3930752,
    						43.6438786
    					],
    					[
    						-79.3930426,
    						43.6438947
    					],
    					[
    						-79.393021,
    						43.6439134
    					],
    					[
    						-79.3930074,
    						43.6439541
    					],
    					[
    						-79.3930084,
    						43.6439905
    					],
    					[
    						-79.3931549,
    						43.6443547
    					],
    					[
    						-79.3931915,
    						43.6444456
    					]
    				]
    			]
    		},
    		id: "way/7969155"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8008958",
    			created_by: "JOSM",
    			leisure: "park",
    			name: "Aura Lee Playing Field",
    			note: "owned by University of Toronto; closed and locked at night"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4049502,
    						43.6657174
    					],
    					[
    						-79.4046598,
    						43.6649768
    					],
    					[
    						-79.4039909,
    						43.665113
    					],
    					[
    						-79.4042699,
    						43.6658654
    					],
    					[
    						-79.4049502,
    						43.6657174
    					]
    				]
    			]
    		},
    		id: "way/8008958"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8095895",
    			leisure: "park",
    			name: "Queen's Park (South)",
    			"name:ko": "퀸즈 파크 (남쪽)"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3911813,
    						43.6607113
    					],
    					[
    						-79.3910984,
    						43.6606902
    					],
    					[
    						-79.3910331,
    						43.6606808
    					],
    					[
    						-79.3909503,
    						43.660674
    					],
    					[
    						-79.3908675,
    						43.6606884
    					],
    					[
    						-79.3907692,
    						43.6607187
    					],
    					[
    						-79.3906803,
    						43.6607729
    					],
    					[
    						-79.390566,
    						43.6608521
    					],
    					[
    						-79.3903858,
    						43.6609956
    					],
    					[
    						-79.3902808,
    						43.6610999
    					],
    					[
    						-79.3901881,
    						43.661216
    					],
    					[
    						-79.3901215,
    						43.6613117
    					],
    					[
    						-79.3900663,
    						43.661409
    					],
    					[
    						-79.3900056,
    						43.6615448
    					],
    					[
    						-79.3899797,
    						43.6616219
    					],
    					[
    						-79.3899706,
    						43.6616957
    					],
    					[
    						-79.3899916,
    						43.6617331
    					],
    					[
    						-79.390027,
    						43.6617617
    					],
    					[
    						-79.3901646,
    						43.6618098
    					],
    					[
    						-79.3902962,
    						43.6618291
    					],
    					[
    						-79.3904535,
    						43.6618569
    					],
    					[
    						-79.3905512,
    						43.661869
    					],
    					[
    						-79.3906295,
    						43.6618749
    					],
    					[
    						-79.3907015,
    						43.6618766
    					],
    					[
    						-79.3907676,
    						43.6618755
    					],
    					[
    						-79.3908454,
    						43.66187
    					],
    					[
    						-79.3909834,
    						43.6618542
    					],
    					[
    						-79.3911293,
    						43.6618273
    					],
    					[
    						-79.3915934,
    						43.6617235
    					],
    					[
    						-79.3916701,
    						43.6617
    					],
    					[
    						-79.3917882,
    						43.6616537
    					],
    					[
    						-79.3918944,
    						43.6615965
    					],
    					[
    						-79.391997,
    						43.6615232
    					],
    					[
    						-79.3920866,
    						43.6614449
    					],
    					[
    						-79.392141,
    						43.6613546
    					],
    					[
    						-79.3920748,
    						43.6612536
    					],
    					[
    						-79.3920094,
    						43.6611755
    					],
    					[
    						-79.3919397,
    						43.6611034
    					],
    					[
    						-79.3918326,
    						43.661019
    					],
    					[
    						-79.3916987,
    						43.66093
    					],
    					[
    						-79.3914903,
    						43.6608161
    					],
    					[
    						-79.391304,
    						43.6607471
    					],
    					[
    						-79.3911813,
    						43.6607113
    					]
    				]
    			]
    		},
    		id: "way/8095895"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8103403",
    			"addr:city": "Toronto",
    			"addr:housenumber": "33",
    			"addr:street": "Walmer Road",
    			leisure: "park",
    			name: "Gwendolyn MacEwen Park",
    			"opendata:type": "106001"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4061695,
    						43.6685674
    					],
    					[
    						-79.4060473,
    						43.6687115
    					],
    					[
    						-79.4060076,
    						43.6687755
    					],
    					[
    						-79.4061066,
    						43.6688464
    					],
    					[
    						-79.4062383,
    						43.6689107
    					],
    					[
    						-79.4063167,
    						43.6689102
    					],
    					[
    						-79.4063882,
    						43.6688312
    					],
    					[
    						-79.4064322,
    						43.6686928
    					],
    					[
    						-79.4064445,
    						43.6685669
    					],
    					[
    						-79.4063769,
    						43.6684795
    					],
    					[
    						-79.4063183,
    						43.6684727
    					],
    					[
    						-79.406239,
    						43.6684911
    					],
    					[
    						-79.4061695,
    						43.6685674
    					]
    				]
    			]
    		},
    		id: "way/8103403"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8103407",
    			leisure: "park",
    			name: "St. Alban's Square"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4111761,
    						43.6685956
    					],
    					[
    						-79.4110906,
    						43.6683966
    					],
    					[
    						-79.4110639,
    						43.6683656
    					],
    					[
    						-79.4110051,
    						43.6683366
    					],
    					[
    						-79.4109543,
    						43.6683366
    					],
    					[
    						-79.4099389,
    						43.6685357
    					],
    					[
    						-79.4099096,
    						43.668555
    					],
    					[
    						-79.4098775,
    						43.668586
    					],
    					[
    						-79.4098661,
    						43.6686038
    					],
    					[
    						-79.4099683,
    						43.6688436
    					],
    					[
    						-79.4111761,
    						43.6685956
    					]
    				]
    			]
    		},
    		id: "way/8103407"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8111517",
    			leisure: "park",
    			name: "Vermont Square Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.414841,
    						43.670935
    					],
    					[
    						-79.4153926,
    						43.670813
    					],
    					[
    						-79.4155385,
    						43.6711592
    					],
    					[
    						-79.416049,
    						43.6710537
    					],
    					[
    						-79.4156273,
    						43.6698737
    					],
    					[
    						-79.4145332,
    						43.6701111
    					],
    					[
    						-79.414841,
    						43.670935
    					]
    				]
    			]
    		},
    		id: "way/8111517"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8119654",
    			created_by: "Potlatch 0.7b",
    			leisure: "park",
    			name: "Jesse Ketchum Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3930169,
    						43.6724177
    					],
    					[
    						-79.3929405,
    						43.6722402
    					],
    					[
    						-79.3928123,
    						43.6719515
    					],
    					[
    						-79.3925799,
    						43.671998
    					],
    					[
    						-79.3923254,
    						43.6720334
    					],
    					[
    						-79.3923215,
    						43.6720269
    					],
    					[
    						-79.3907697,
    						43.6723876
    					],
    					[
    						-79.3909261,
    						43.6728448
    					],
    					[
    						-79.3930169,
    						43.6724177
    					]
    				]
    			]
    		},
    		id: "way/8119654"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/8119664",
    			"addr:city": "Toronto",
    			"addr:housenumber": "10",
    			"addr:street": "Madison Avenue",
    			leisure: "park",
    			name: "Paul Martel Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4030087,
    						43.6674141
    					],
    					[
    						-79.4031444,
    						43.6677406
    					],
    					[
    						-79.4034177,
    						43.6676839
    					],
    					[
    						-79.4033836,
    						43.6676014
    					],
    					[
    						-79.4032877,
    						43.6673692
    					],
    					[
    						-79.403282,
    						43.6673554
    					],
    					[
    						-79.4030087,
    						43.6674141
    					]
    				]
    			]
    		},
    		id: "way/8119664"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/9153060",
    			leisure: "park",
    			name: "Dovercourt Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4321615,
    						43.6649811
    					],
    					[
    						-79.4325954,
    						43.6660226
    					],
    					[
    						-79.4326366,
    						43.6660379
    					],
    					[
    						-79.4348793,
    						43.6655472
    					],
    					[
    						-79.4349118,
    						43.6654644
    					],
    					[
    						-79.4344879,
    						43.6644305
    					],
    					[
    						-79.4344582,
    						43.6644112
    					],
    					[
    						-79.4321944,
    						43.664904
    					],
    					[
    						-79.4321615,
    						43.6649811
    					]
    				]
    			]
    		},
    		id: "way/9153060"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/9153079",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4305385,
    						43.661385
    					],
    					[
    						-79.4301409,
    						43.6614687
    					],
    					[
    						-79.4300757,
    						43.6614824
    					],
    					[
    						-79.430151,
    						43.661716
    					],
    					[
    						-79.4306246,
    						43.6616186
    					],
    					[
    						-79.4305385,
    						43.661385
    					]
    				]
    			]
    		},
    		id: "way/9153079"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/10742344",
    			leisure: "park",
    			name: "Wenderly Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4453547,
    						43.7106151
    					],
    					[
    						-79.4451774,
    						43.7106529
    					],
    					[
    						-79.4455827,
    						43.7116053
    					],
    					[
    						-79.4455219,
    						43.711726
    					],
    					[
    						-79.4456587,
    						43.7120335
    					],
    					[
    						-79.4457802,
    						43.7123299
    					],
    					[
    						-79.4459928,
    						43.7121378
    					],
    					[
    						-79.4462663,
    						43.7120445
    					],
    					[
    						-79.4464182,
    						43.7120335
    					],
    					[
    						-79.4465777,
    						43.712039
    					],
    					[
    						-79.4467371,
    						43.7120554
    					],
    					[
    						-79.4469346,
    						43.7121213
    					],
    					[
    						-79.4468663,
    						43.7121817
    					],
    					[
    						-79.4471245,
    						43.7125385
    					],
    					[
    						-79.4474587,
    						43.7123793
    					],
    					[
    						-79.4475422,
    						43.7125276
    					],
    					[
    						-79.4476561,
    						43.7126868
    					],
    					[
    						-79.4480435,
    						43.7123574
    					],
    					[
    						-79.4478004,
    						43.7122256
    					],
    					[
    						-79.4476258,
    						43.712017
    					],
    					[
    						-79.4475194,
    						43.7118303
    					],
    					[
    						-79.447603,
    						43.7117864
    					],
    					[
    						-79.4474283,
    						43.7115613
    					],
    					[
    						-79.4473296,
    						43.711468
    					],
    					[
    						-79.4472232,
    						43.7114186
    					],
    					[
    						-79.4453547,
    						43.7106151
    					]
    				]
    			]
    		},
    		id: "way/10742344"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/10742350",
    			"addr:city": "Toronto",
    			"addr:housenumber": "1",
    			"addr:street": "Elm Ridge Circle",
    			leisure: "park",
    			name: "Nicol MacNicol Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4334061,
    						43.7040398
    					],
    					[
    						-79.4333856,
    						43.7039361
    					],
    					[
    						-79.433331,
    						43.7038571
    					],
    					[
    						-79.4331842,
    						43.7037782
    					],
    					[
    						-79.4330313,
    						43.7037644
    					],
    					[
    						-79.4327955,
    						43.703791
    					],
    					[
    						-79.4326048,
    						43.7038381
    					],
    					[
    						-79.4324898,
    						43.7038911
    					],
    					[
    						-79.432392,
    						43.7039597
    					],
    					[
    						-79.4323212,
    						43.7040348
    					],
    					[
    						-79.4323063,
    						43.7041022
    					],
    					[
    						-79.4323,
    						43.704178
    					],
    					[
    						-79.4323555,
    						43.7042836
    					],
    					[
    						-79.4324212,
    						43.7043415
    					],
    					[
    						-79.432523,
    						43.7043829
    					],
    					[
    						-79.4326232,
    						43.7044079
    					],
    					[
    						-79.4327516,
    						43.7044152
    					],
    					[
    						-79.4329634,
    						43.7044089
    					],
    					[
    						-79.4331012,
    						43.7043696
    					],
    					[
    						-79.4331878,
    						43.7043256
    					],
    					[
    						-79.4332571,
    						43.7042832
    					],
    					[
    						-79.4333512,
    						43.7042059
    					],
    					[
    						-79.4333992,
    						43.7041261
    					],
    					[
    						-79.4334061,
    						43.7040398
    					]
    				]
    			]
    		},
    		id: "way/10742350"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/13799366",
    			"addr:city": "Toronto",
    			"addr:housenumber": "220",
    			"addr:street": "Davisville Avenue",
    			leisure: "park",
    			name: "June Rowlands Park",
    			source: "Contains public sector Datasets made available under the City of Toronto's Open Data License v2.0."
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3895498,
    						43.6998776
    					],
    					[
    						-79.3875611,
    						43.7002919
    					],
    					[
    						-79.3871765,
    						43.7003721
    					],
    					[
    						-79.3871328,
    						43.7004097
    					],
    					[
    						-79.3874534,
    						43.7011932
    					],
    					[
    						-79.3875961,
    						43.7015283
    					],
    					[
    						-79.3876388,
    						43.7015193
    					],
    					[
    						-79.3877265,
    						43.701501
    					],
    					[
    						-79.3896964,
    						43.7011113
    					],
    					[
    						-79.3897117,
    						43.7011063
    					],
    					[
    						-79.3897243,
    						43.7010984
    					],
    					[
    						-79.3897332,
    						43.7010881
    					],
    					[
    						-79.3897375,
    						43.7010763
    					],
    					[
    						-79.3897369,
    						43.7010642
    					],
    					[
    						-79.3897358,
    						43.7010606
    					],
    					[
    						-79.38969,
    						43.7009421
    					],
    					[
    						-79.3896878,
    						43.7009355
    					],
    					[
    						-79.3896812,
    						43.7009073
    					],
    					[
    						-79.3896796,
    						43.7008788
    					],
    					[
    						-79.3896822,
    						43.7008543
    					],
    					[
    						-79.3896898,
    						43.7008263
    					],
    					[
    						-79.3897021,
    						43.7007992
    					],
    					[
    						-79.3897191,
    						43.7007734
    					],
    					[
    						-79.3897404,
    						43.7007494
    					],
    					[
    						-79.3897657,
    						43.7007275
    					],
    					[
    						-79.3897943,
    						43.7007082
    					],
    					[
    						-79.3898128,
    						43.7006951
    					],
    					[
    						-79.3898273,
    						43.7006798
    					],
    					[
    						-79.3898375,
    						43.7006628
    					],
    					[
    						-79.3898429,
    						43.7006446
    					],
    					[
    						-79.3898434,
    						43.7006261
    					],
    					[
    						-79.3898387,
    						43.700607
    					],
    					[
    						-79.3895498,
    						43.6998776
    					]
    				]
    			]
    		},
    		id: "way/13799366"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/13867012",
    			leisure: "park",
    			name: "Margaret Fairley Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.405326,
    						43.6602128
    					],
    					[
    						-79.4053099,
    						43.6602515
    					],
    					[
    						-79.4052804,
    						43.6602768
    					],
    					[
    						-79.4053471,
    						43.6604569
    					],
    					[
    						-79.4053596,
    						43.660479
    					],
    					[
    						-79.4053807,
    						43.6604897
    					],
    					[
    						-79.4054062,
    						43.6604938
    					],
    					[
    						-79.4054291,
    						43.6604922
    					],
    					[
    						-79.4058973,
    						43.6603983
    					],
    					[
    						-79.4059268,
    						43.6603746
    					],
    					[
    						-79.4058313,
    						43.6601186
    					],
    					[
    						-79.405326,
    						43.6602128
    					]
    				]
    			]
    		},
    		id: "way/13867012"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/14344414",
    			"addr:housenumber": "1873",
    			"addr:street": "Bloor Street West",
    			leisure: "park",
    			name: "High Park",
    			wikipedia: "en:High Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4600368,
    						43.6544648
    					],
    					[
    						-79.4600538,
    						43.6544889
    					],
    					[
    						-79.4600702,
    						43.6545097
    					],
    					[
    						-79.4600907,
    						43.6545233
    					],
    					[
    						-79.4601262,
    						43.6545372
    					],
    					[
    						-79.4601541,
    						43.6545406
    					],
    					[
    						-79.4601863,
    						43.6545393
    					],
    					[
    						-79.4602358,
    						43.6545302
    					],
    					[
    						-79.4626616,
    						43.6540074
    					],
    					[
    						-79.4650869,
    						43.653473
    					],
    					[
    						-79.466589,
    						43.6531423
    					],
    					[
    						-79.468106,
    						43.6528324
    					],
    					[
    						-79.4686588,
    						43.6527086
    					],
    					[
    						-79.4700735,
    						43.6523918
    					],
    					[
    						-79.4700095,
    						43.6520934
    					],
    					[
    						-79.4698045,
    						43.6521238
    					],
    					[
    						-79.4696359,
    						43.6518273
    					],
    					[
    						-79.4695244,
    						43.6515975
    					],
    					[
    						-79.4694557,
    						43.6513057
    					],
    					[
    						-79.4694042,
    						43.6509703
    					],
    					[
    						-79.4694986,
    						43.6506598
    					],
    					[
    						-79.4698561,
    						43.6502585
    					],
    					[
    						-79.4699746,
    						43.6501522
    					],
    					[
    						-79.4700524,
    						43.6501007
    					],
    					[
    						-79.4701852,
    						43.6500396
    					],
    					[
    						-79.4703508,
    						43.6499974
    					],
    					[
    						-79.4706311,
    						43.649993
    					],
    					[
    						-79.4706311,
    						43.6499775
    					],
    					[
    						-79.470664,
    						43.649976
    					],
    					[
    						-79.4706874,
    						43.6499651
    					],
    					[
    						-79.4707176,
    						43.6499367
    					],
    					[
    						-79.4707411,
    						43.6499023
    					],
    					[
    						-79.4708001,
    						43.6496296
    					],
    					[
    						-79.4708766,
    						43.6493014
    					],
    					[
    						-79.4709221,
    						43.6491284
    					],
    					[
    						-79.4709775,
    						43.6489623
    					],
    					[
    						-79.4710012,
    						43.6488997
    					],
    					[
    						-79.4710927,
    						43.6486585
    					],
    					[
    						-79.4711313,
    						43.6485627
    					],
    					[
    						-79.4711488,
    						43.6484976
    					],
    					[
    						-79.4710517,
    						43.6484682
    					],
    					[
    						-79.4711294,
    						43.6482191
    					],
    					[
    						-79.4710779,
    						43.6477843
    					],
    					[
    						-79.4710522,
    						43.6473123
    					],
    					[
    						-79.4709577,
    						43.6470328
    					],
    					[
    						-79.470726,
    						43.6466353
    					],
    					[
    						-79.4706488,
    						43.6463683
    					],
    					[
    						-79.4706917,
    						43.6461944
    					],
    					[
    						-79.4707861,
    						43.6460763
    					],
    					[
    						-79.4709062,
    						43.645977
    					],
    					[
    						-79.4710436,
    						43.64589
    					],
    					[
    						-79.4708204,
    						43.6455112
    					],
    					[
    						-79.470623,
    						43.645182
    					],
    					[
    						-79.470211,
    						43.6447099
    					],
    					[
    						-79.4698934,
    						43.6442628
    					],
    					[
    						-79.470314,
    						43.644151
    					],
    					[
    						-79.4705629,
    						43.6440951
    					],
    					[
    						-79.4701767,
    						43.6435236
    					],
    					[
    						-79.4698419,
    						43.6430081
    					],
    					[
    						-79.4696359,
    						43.6429025
    					],
    					[
    						-79.4694214,
    						43.6427597
    					],
    					[
    						-79.4692926,
    						43.642592
    					],
    					[
    						-79.4683056,
    						43.6410143
    					],
    					[
    						-79.4680652,
    						43.6406789
    					],
    					[
    						-79.4677477,
    						43.6402689
    					],
    					[
    						-79.4672928,
    						43.6398652
    					],
    					[
    						-79.4668379,
    						43.6395732
    					],
    					[
    						-79.4666405,
    						43.6394738
    					],
    					[
    						-79.4666233,
    						43.6392999
    					],
    					[
    						-79.4669022,
    						43.6392188
    					],
    					[
    						-79.4672875,
    						43.6390826
    					],
    					[
    						-79.4674362,
    						43.6390301
    					],
    					[
    						-79.4673199,
    						43.6389282
    					],
    					[
    						-79.4672126,
    						43.6388253
    					],
    					[
    						-79.4670886,
    						43.6386987
    					],
    					[
    						-79.4669769,
    						43.6385763
    					],
    					[
    						-79.4668593,
    						43.6384288
    					],
    					[
    						-79.4667553,
    						43.6382784
    					],
    					[
    						-79.4666346,
    						43.6381061
    					],
    					[
    						-79.4665783,
    						43.6380328
    					],
    					[
    						-79.4665453,
    						43.6379974
    					],
    					[
    						-79.4664362,
    						43.6379596
    					],
    					[
    						-79.466005,
    						43.6380644
    					],
    					[
    						-79.4655644,
    						43.6381784
    					],
    					[
    						-79.4651359,
    						43.6382944
    					],
    					[
    						-79.4647161,
    						43.638411
    					],
    					[
    						-79.46388,
    						43.6386686
    					],
    					[
    						-79.4630544,
    						43.6389223
    					],
    					[
    						-79.4624698,
    						43.6390869
    					],
    					[
    						-79.4618797,
    						43.6392359
    					],
    					[
    						-79.4611345,
    						43.6394018
    					],
    					[
    						-79.4605272,
    						43.6395154
    					],
    					[
    						-79.459899,
    						43.6396181
    					],
    					[
    						-79.4598949,
    						43.6397066
    					],
    					[
    						-79.4598138,
    						43.6397027
    					],
    					[
    						-79.4595455,
    						43.6397279
    					],
    					[
    						-79.4594047,
    						43.6397376
    					],
    					[
    						-79.4592559,
    						43.6397575
    					],
    					[
    						-79.4592438,
    						43.6397148
    					],
    					[
    						-79.4590219,
    						43.6397367
    					],
    					[
    						-79.4585692,
    						43.6397803
    					],
    					[
    						-79.4581187,
    						43.6398105
    					],
    					[
    						-79.4577753,
    						43.6398284
    					],
    					[
    						-79.457341,
    						43.6398426
    					],
    					[
    						-79.4567956,
    						43.6398512
    					],
    					[
    						-79.4562412,
    						43.6398551
    					],
    					[
    						-79.4552641,
    						43.6398643
    					],
    					[
    						-79.4543101,
    						43.6398859
    					],
    					[
    						-79.4543957,
    						43.6401085
    					],
    					[
    						-79.4546569,
    						43.6407879
    					],
    					[
    						-79.4546948,
    						43.64088
    					],
    					[
    						-79.4547156,
    						43.6409042
    					],
    					[
    						-79.4547424,
    						43.6409188
    					],
    					[
    						-79.4547873,
    						43.6410343
    					],
    					[
    						-79.4547739,
    						43.6410474
    					],
    					[
    						-79.4547739,
    						43.6410644
    					],
    					[
    						-79.4549589,
    						43.6415733
    					],
    					[
    						-79.455424,
    						43.6426855
    					],
    					[
    						-79.4558407,
    						43.6436817
    					],
    					[
    						-79.455946,
    						43.6439336
    					],
    					[
    						-79.4563668,
    						43.6449691
    					],
    					[
    						-79.4565513,
    						43.6454078
    					],
    					[
    						-79.4571537,
    						43.6468402
    					],
    					[
    						-79.4576059,
    						43.6478962
    					],
    					[
    						-79.4579595,
    						43.6487219
    					],
    					[
    						-79.4582805,
    						43.6502002
    					],
    					[
    						-79.4584973,
    						43.6508468
    					],
    					[
    						-79.4585833,
    						43.6511031
    					],
    					[
    						-79.4593872,
    						43.6530367
    					],
    					[
    						-79.4597071,
    						43.6537483
    					],
    					[
    						-79.4600368,
    						43.6544648
    					]
    				]
    			]
    		},
    		id: "way/14344414"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/14345393",
    			leisure: "park",
    			name: "Riverdale Park East",
    			wikipedia: "en:Riverdale Park (Toronto)"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3562312,
    						43.6731711
    					],
    					[
    						-79.3573497,
    						43.6729108
    					],
    					[
    						-79.3579101,
    						43.6726529
    					],
    					[
    						-79.358159,
    						43.6729012
    					],
    					[
    						-79.3587427,
    						43.6726343
    					],
    					[
    						-79.3590345,
    						43.6725846
    					],
    					[
    						-79.3591322,
    						43.67258
    					],
    					[
    						-79.3591332,
    						43.6721909
    					],
    					[
    						-79.3588166,
    						43.6719018
    					],
    					[
    						-79.3585781,
    						43.6717434
    					],
    					[
    						-79.3583854,
    						43.6715627
    					],
    					[
    						-79.3579627,
    						43.6711401
    					],
    					[
    						-79.3576442,
    						43.6708222
    					],
    					[
    						-79.3572588,
    						43.6702454
    					],
    					[
    						-79.3571059,
    						43.6700009
    					],
    					[
    						-79.3569204,
    						43.6696555
    					],
    					[
    						-79.3570093,
    						43.6694733
    					],
    					[
    						-79.3568998,
    						43.6690299
    					],
    					[
    						-79.3565626,
    						43.667916
    					],
    					[
    						-79.3564167,
    						43.6674068
    					],
    					[
    						-79.3562536,
    						43.666817
    					],
    					[
    						-79.3560978,
    						43.6668588
    					],
    					[
    						-79.3558645,
    						43.6669505
    					],
    					[
    						-79.3553344,
    						43.6670761
    					],
    					[
    						-79.3550069,
    						43.6671419
    					],
    					[
    						-79.3549194,
    						43.6669323
    					],
    					[
    						-79.3534672,
    						43.6672142
    					],
    					[
    						-79.3535272,
    						43.6673507
    					],
    					[
    						-79.353552,
    						43.6674176
    					],
    					[
    						-79.3535648,
    						43.6674831
    					],
    					[
    						-79.3535621,
    						43.6675772
    					],
    					[
    						-79.3535395,
    						43.6676525
    					],
    					[
    						-79.3534919,
    						43.6677698
    					],
    					[
    						-79.3534503,
    						43.6678726
    					],
    					[
    						-79.3534135,
    						43.6679684
    					],
    					[
    						-79.35342,
    						43.6679688
    					],
    					[
    						-79.3534422,
    						43.6679731
    					],
    					[
    						-79.3534295,
    						43.6680076
    					],
    					[
    						-79.3534073,
    						43.6680033
    					],
    					[
    						-79.3534005,
    						43.6680026
    					],
    					[
    						-79.3533744,
    						43.668064
    					],
    					[
    						-79.353233,
    						43.6684246
    					],
    					[
    						-79.3532114,
    						43.6684833
    					],
    					[
    						-79.3531973,
    						43.6685376
    					],
    					[
    						-79.3531765,
    						43.6686627
    					],
    					[
    						-79.3531409,
    						43.6689064
    					],
    					[
    						-79.3531155,
    						43.6690959
    					],
    					[
    						-79.3531014,
    						43.6691987
    					],
    					[
    						-79.353098,
    						43.6692845
    					],
    					[
    						-79.3531109,
    						43.6693708
    					],
    					[
    						-79.3531396,
    						43.6694441
    					],
    					[
    						-79.3531688,
    						43.6695081
    					],
    					[
    						-79.353203,
    						43.6695644
    					],
    					[
    						-79.3532416,
    						43.6696197
    					],
    					[
    						-79.3533804,
    						43.6697686
    					],
    					[
    						-79.35343,
    						43.669821
    					],
    					[
    						-79.3534353,
    						43.6698175
    					],
    					[
    						-79.3534541,
    						43.6698082
    					],
    					[
    						-79.3534826,
    						43.6698386
    					],
    					[
    						-79.3534638,
    						43.6698479
    					],
    					[
    						-79.3534575,
    						43.6698508
    					],
    					[
    						-79.35365,
    						43.6700573
    					],
    					[
    						-79.3537874,
    						43.6702051
    					],
    					[
    						-79.3538672,
    						43.670289
    					],
    					[
    						-79.3538786,
    						43.6703206
    					],
    					[
    						-79.3539262,
    						43.6703715
    					],
    					[
    						-79.3540771,
    						43.670532
    					],
    					[
    						-79.3542225,
    						43.6706875
    					],
    					[
    						-79.3543547,
    						43.6708405
    					],
    					[
    						-79.3544271,
    						43.6709409
    					],
    					[
    						-79.3544975,
    						43.6710471
    					],
    					[
    						-79.354516,
    						43.6710759
    					],
    					[
    						-79.3545748,
    						43.6711784
    					],
    					[
    						-79.3546115,
    						43.6712377
    					],
    					[
    						-79.354712,
    						43.6714261
    					],
    					[
    						-79.3547671,
    						43.6715234
    					],
    					[
    						-79.3548844,
    						43.6717194
    					],
    					[
    						-79.3549716,
    						43.6718557
    					],
    					[
    						-79.3550632,
    						43.671988
    					],
    					[
    						-79.3551533,
    						43.6721093
    					],
    					[
    						-79.3552036,
    						43.6721721
    					],
    					[
    						-79.3552115,
    						43.6721707
    					],
    					[
    						-79.355229,
    						43.6721629
    					],
    					[
    						-79.355253,
    						43.6721913
    					],
    					[
    						-79.3552354,
    						43.6721991
    					],
    					[
    						-79.3552287,
    						43.6722027
    					],
    					[
    						-79.3554363,
    						43.6724411
    					],
    					[
    						-79.355618,
    						43.6726292
    					],
    					[
    						-79.3558093,
    						43.6728174
    					],
    					[
    						-79.3560297,
    						43.6730381
    					],
    					[
    						-79.3561605,
    						43.6731652
    					],
    					[
    						-79.3562312,
    						43.6731711
    					]
    				]
    			]
    		},
    		id: "way/14345393"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/14632720",
    			"addr:city": "Toronto",
    			"addr:housenumber": "420",
    			"addr:street": "Huron Street",
    			leisure: "park",
    			name: "Huron & Washington Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4011471,
    						43.6659731
    					],
    					[
    						-79.4012624,
    						43.6662339
    					],
    					[
    						-79.4016903,
    						43.6661441
    					],
    					[
    						-79.4015766,
    						43.6658824
    					],
    					[
    						-79.4011471,
    						43.6659731
    					]
    				]
    			]
    		},
    		id: "way/14632720"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/14801014",
    			"addr:city": "Toronto",
    			"addr:housenumber": "215",
    			"addr:street": "Avenue Road",
    			leisure: "park",
    			name: "Ramsden Park",
    			note: "1020 Yonge Street",
    			wikidata: "Q7290163",
    			"wikipedia:en": "Ramsden Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3948098,
    						43.6766244
    					],
    					[
    						-79.3949156,
    						43.676897
    					],
    					[
    						-79.3964656,
    						43.6765744
    					],
    					[
    						-79.3965498,
    						43.6767857
    					],
    					[
    						-79.3966201,
    						43.6767712
    					],
    					[
    						-79.3965336,
    						43.6765603
    					],
    					[
    						-79.3968986,
    						43.6764843
    					],
    					[
    						-79.3967896,
    						43.6761939
    					],
    					[
    						-79.396979,
    						43.676151
    					],
    					[
    						-79.396939,
    						43.6760428
    					],
    					[
    						-79.3967383,
    						43.6760816
    					],
    					[
    						-79.3966941,
    						43.6759833
    					],
    					[
    						-79.3964898,
    						43.6760264
    					],
    					[
    						-79.3963634,
    						43.6757056
    					],
    					[
    						-79.3946157,
    						43.6760443
    					],
    					[
    						-79.3944034,
    						43.6760228
    					],
    					[
    						-79.3937856,
    						43.6761309
    					],
    					[
    						-79.3937273,
    						43.6760016
    					],
    					[
    						-79.3931592,
    						43.6761183
    					],
    					[
    						-79.3930704,
    						43.6758485
    					],
    					[
    						-79.3926569,
    						43.6759308
    					],
    					[
    						-79.392575,
    						43.6756991
    					],
    					[
    						-79.392511,
    						43.6755559
    					],
    					[
    						-79.3923443,
    						43.6755201
    					],
    					[
    						-79.3914655,
    						43.6756633
    					],
    					[
    						-79.3916147,
    						43.6759618
    					],
    					[
    						-79.3904067,
    						43.6762147
    					],
    					[
    						-79.3902608,
    						43.6762147
    					],
    					[
    						-79.389969,
    						43.6761526
    					],
    					[
    						-79.3893682,
    						43.6762457
    					],
    					[
    						-79.3893682,
    						43.6762954
    					],
    					[
    						-79.3896257,
    						43.6769286
    					],
    					[
    						-79.3911516,
    						43.6766361
    					],
    					[
    						-79.3913165,
    						43.6769658
    					],
    					[
    						-79.391677,
    						43.6768975
    					],
    					[
    						-79.3918058,
    						43.6772141
    					],
    					[
    						-79.394508,
    						43.6766769
    					],
    					[
    						-79.3948098,
    						43.6766244
    					]
    				]
    			]
    		},
    		id: "way/14801014"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15703371",
    			leisure: "park",
    			name: "Dufferin Grove Park",
    			wikidata: "Q5312341",
    			wikipedia: "en:Dufferin Grove Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4332892,
    						43.6548077
    					],
    					[
    						-79.433282,
    						43.6547897
    					],
    					[
    						-79.4332579,
    						43.65477
    					],
    					[
    						-79.4332391,
    						43.6547608
    					],
    					[
    						-79.4332197,
    						43.6547569
    					],
    					[
    						-79.4331918,
    						43.6547598
    					],
    					[
    						-79.4327627,
    						43.6548479
    					],
    					[
    						-79.4320349,
    						43.654999
    					],
    					[
    						-79.4320026,
    						43.655008
    					],
    					[
    						-79.4319828,
    						43.6550167
    					],
    					[
    						-79.4319671,
    						43.6550286
    					],
    					[
    						-79.4319577,
    						43.6550434
    					],
    					[
    						-79.431956,
    						43.6550534
    					],
    					[
    						-79.4319597,
    						43.6550815
    					],
    					[
    						-79.4320777,
    						43.6553962
    					],
    					[
    						-79.4312355,
    						43.6555812
    					],
    					[
    						-79.4311413,
    						43.6556415
    					],
    					[
    						-79.4313543,
    						43.6561551
    					],
    					[
    						-79.4307938,
    						43.6562608
    					],
    					[
    						-79.4310679,
    						43.6569512
    					],
    					[
    						-79.4313379,
    						43.6576289
    					],
    					[
    						-79.4313502,
    						43.6576479
    					],
    					[
    						-79.4313636,
    						43.6576557
    					],
    					[
    						-79.431385,
    						43.657662
    					],
    					[
    						-79.4314038,
    						43.6576639
    					],
    					[
    						-79.4314367,
    						43.6576605
    					],
    					[
    						-79.4324237,
    						43.6574543
    					],
    					[
    						-79.4327067,
    						43.6573956
    					],
    					[
    						-79.4327939,
    						43.657384
    					],
    					[
    						-79.4328213,
    						43.6573927
    					],
    					[
    						-79.4328542,
    						43.6574742
    					],
    					[
    						-79.4335576,
    						43.6573243
    					],
    					[
    						-79.4335239,
    						43.6572313
    					],
    					[
    						-79.4338037,
    						43.6571705
    					],
    					[
    						-79.4338682,
    						43.657149
    					],
    					[
    						-79.4341218,
    						43.6570737
    					],
    					[
    						-79.4341364,
    						43.6570492
    					],
    					[
    						-79.4337132,
    						43.6559257
    					],
    					[
    						-79.4334926,
    						43.655342
    					],
    					[
    						-79.4334316,
    						43.6551834
    					],
    					[
    						-79.4334007,
    						43.6551397
    					],
    					[
    						-79.4333678,
    						43.6550587
    					],
    					[
    						-79.4333558,
    						43.6550592
    					],
    					[
    						-79.4333263,
    						43.654982
    					],
    					[
    						-79.4333504,
    						43.6549748
    					],
    					[
    						-79.4332892,
    						43.6548077
    					]
    				]
    			]
    		},
    		id: "way/15703371"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15707311",
    			leisure: "park",
    			name: "Cedarvale Park",
    			wikidata: "Q5057005",
    			wikipedia: "en:Cedarvale Park (Toronto)"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4167406,
    						43.6859623
    					],
    					[
    						-79.4157364,
    						43.6861733
    					],
    					[
    						-79.4158946,
    						43.686601
    					],
    					[
    						-79.4157917,
    						43.6866323
    					],
    					[
    						-79.4158425,
    						43.686676
    					],
    					[
    						-79.4159393,
    						43.6869495
    					],
    					[
    						-79.4161836,
    						43.6874852
    					],
    					[
    						-79.4164579,
    						43.6880821
    					],
    					[
    						-79.4164281,
    						43.6881137
    					],
    					[
    						-79.4163103,
    						43.6882786
    					],
    					[
    						-79.4162916,
    						43.6883061
    					],
    					[
    						-79.4161785,
    						43.6884643
    					],
    					[
    						-79.4153924,
    						43.6886421
    					],
    					[
    						-79.4154219,
    						43.6886974
    					],
    					[
    						-79.4153243,
    						43.6887276
    					],
    					[
    						-79.4154175,
    						43.6889272
    					],
    					[
    						-79.4148592,
    						43.6891004
    					],
    					[
    						-79.4143671,
    						43.6891721
    					],
    					[
    						-79.4145087,
    						43.6892428
    					],
    					[
    						-79.4146058,
    						43.6892821
    					],
    					[
    						-79.4147111,
    						43.6893199
    					],
    					[
    						-79.4146581,
    						43.6893747
    					],
    					[
    						-79.4144918,
    						43.6893166
    					],
    					[
    						-79.414412,
    						43.689279
    					],
    					[
    						-79.4143332,
    						43.6892341
    					],
    					[
    						-79.4143094,
    						43.6892222
    					],
    					[
    						-79.4142926,
    						43.6892196
    					],
    					[
    						-79.4142809,
    						43.6892203
    					],
    					[
    						-79.4142712,
    						43.6892244
    					],
    					[
    						-79.4142642,
    						43.6892334
    					],
    					[
    						-79.4142631,
    						43.6892409
    					],
    					[
    						-79.4142678,
    						43.6892489
    					],
    					[
    						-79.4142913,
    						43.6893073
    					],
    					[
    						-79.414408,
    						43.6896075
    					],
    					[
    						-79.4143134,
    						43.6896448
    					],
    					[
    						-79.4143246,
    						43.6897274
    					],
    					[
    						-79.4138577,
    						43.689829
    					],
    					[
    						-79.4138641,
    						43.6901071
    					],
    					[
    						-79.4134034,
    						43.6902046
    					],
    					[
    						-79.4135396,
    						43.6905307
    					],
    					[
    						-79.413686,
    						43.6908769
    					],
    					[
    						-79.4141832,
    						43.6908763
    					],
    					[
    						-79.4143081,
    						43.6905316
    					],
    					[
    						-79.4140875,
    						43.6904991
    					],
    					[
    						-79.4140747,
    						43.6904725
    					],
    					[
    						-79.4141847,
    						43.690255
    					],
    					[
    						-79.4142987,
    						43.6900448
    					],
    					[
    						-79.4144649,
    						43.6898579
    					],
    					[
    						-79.4148733,
    						43.689543
    					],
    					[
    						-79.4149558,
    						43.6896094
    					],
    					[
    						-79.4150839,
    						43.6895401
    					],
    					[
    						-79.4151015,
    						43.6893558
    					],
    					[
    						-79.4154695,
    						43.6891071
    					],
    					[
    						-79.415607,
    						43.6894163
    					],
    					[
    						-79.4157766,
    						43.6893747
    					],
    					[
    						-79.415912,
    						43.6894077
    					],
    					[
    						-79.4173627,
    						43.6891252
    					],
    					[
    						-79.4179787,
    						43.6890169
    					],
    					[
    						-79.4181745,
    						43.6894814
    					],
    					[
    						-79.41844,
    						43.690104
    					],
    					[
    						-79.4186885,
    						43.6906294
    					],
    					[
    						-79.4188042,
    						43.6908897
    					],
    					[
    						-79.4190661,
    						43.6910412
    					],
    					[
    						-79.419364,
    						43.6912143
    					],
    					[
    						-79.4195598,
    						43.6912444
    					],
    					[
    						-79.4201432,
    						43.6912
    					],
    					[
    						-79.4202934,
    						43.691193
    					],
    					[
    						-79.4213108,
    						43.6909683
    					],
    					[
    						-79.4216047,
    						43.6909281
    					],
    					[
    						-79.421734,
    						43.6912793
    					],
    					[
    						-79.422116,
    						43.691256
    					],
    					[
    						-79.4220838,
    						43.6910989
    					],
    					[
    						-79.4222018,
    						43.6910747
    					],
    					[
    						-79.4222595,
    						43.6912454
    					],
    					[
    						-79.4224902,
    						43.6912463
    					],
    					[
    						-79.4226813,
    						43.6912686
    					],
    					[
    						-79.4234611,
    						43.6914257
    					],
    					[
    						-79.4234893,
    						43.691545
    					],
    					[
    						-79.423956,
    						43.6916274
    					],
    					[
    						-79.4239815,
    						43.6914781
    					],
    					[
    						-79.4250008,
    						43.6915996
    					],
    					[
    						-79.4251517,
    						43.6915751
    					],
    					[
    						-79.4259368,
    						43.6914482
    					],
    					[
    						-79.4270839,
    						43.6914216
    					],
    					[
    						-79.4271894,
    						43.6914238
    					],
    					[
    						-79.427294,
    						43.6914412
    					],
    					[
    						-79.4274093,
    						43.6914994
    					],
    					[
    						-79.427408,
    						43.6915566
    					],
    					[
    						-79.4277164,
    						43.6915673
    					],
    					[
    						-79.428273,
    						43.6917021
    					],
    					[
    						-79.4282824,
    						43.6918073
    					],
    					[
    						-79.4282864,
    						43.6918514
    					],
    					[
    						-79.4282341,
    						43.6919387
    					],
    					[
    						-79.4283561,
    						43.6919998
    					],
    					[
    						-79.4283307,
    						43.6922122
    					],
    					[
    						-79.4280809,
    						43.6924362
    					],
    					[
    						-79.4281466,
    						43.6925021
    					],
    					[
    						-79.4282221,
    						43.6925778
    					],
    					[
    						-79.4283,
    						43.6926806
    					],
    					[
    						-79.4284723,
    						43.6929085
    					],
    					[
    						-79.4286245,
    						43.6928543
    					],
    					[
    						-79.4293107,
    						43.69261
    					],
    					[
    						-79.4293901,
    						43.6927852
    					],
    					[
    						-79.4293872,
    						43.6931177
    					],
    					[
    						-79.4295467,
    						43.693254
    					],
    					[
    						-79.4298592,
    						43.6935211
    					],
    					[
    						-79.4304343,
    						43.6938686
    					],
    					[
    						-79.4305355,
    						43.6939197
    					],
    					[
    						-79.4316016,
    						43.6944582
    					],
    					[
    						-79.4318832,
    						43.6946412
    					],
    					[
    						-79.4330943,
    						43.6952297
    					],
    					[
    						-79.433734,
    						43.695573
    					],
    					[
    						-79.4339877,
    						43.6955628
    					],
    					[
    						-79.4342704,
    						43.6954077
    					],
    					[
    						-79.4343606,
    						43.6954168
    					],
    					[
    						-79.4344793,
    						43.6954614
    					],
    					[
    						-79.4345963,
    						43.6957273
    					],
    					[
    						-79.4348613,
    						43.6956667
    					],
    					[
    						-79.4347285,
    						43.6953517
    					],
    					[
    						-79.4349553,
    						43.6952948
    					],
    					[
    						-79.4347687,
    						43.6951158
    					],
    					[
    						-79.4345728,
    						43.6951042
    					],
    					[
    						-79.4345051,
    						43.6950606
    					],
    					[
    						-79.4345608,
    						43.6950102
    					],
    					[
    						-79.4343723,
    						43.6949059
    					],
    					[
    						-79.4343321,
    						43.6949418
    					],
    					[
    						-79.4341785,
    						43.6948351
    					],
    					[
    						-79.4338689,
    						43.6945763
    					],
    					[
    						-79.4334912,
    						43.6943001
    					],
    					[
    						-79.4332361,
    						43.6937047
    					],
    					[
    						-79.4329119,
    						43.6929898
    					],
    					[
    						-79.4328118,
    						43.6929253
    					],
    					[
    						-79.4327918,
    						43.6928747
    					],
    					[
    						-79.432417,
    						43.6919261
    					],
    					[
    						-79.4330521,
    						43.691771
    					],
    					[
    						-79.4327092,
    						43.6911273
    					],
    					[
    						-79.4326943,
    						43.6910448
    					],
    					[
    						-79.4323239,
    						43.6911208
    					],
    					[
    						-79.4321776,
    						43.6910369
    					],
    					[
    						-79.4321206,
    						43.691047
    					],
    					[
    						-79.432065,
    						43.6909273
    					],
    					[
    						-79.4319637,
    						43.6909409
    					],
    					[
    						-79.4319272,
    						43.6907414
    					],
    					[
    						-79.431776,
    						43.6907906
    					],
    					[
    						-79.431434,
    						43.690793
    					],
    					[
    						-79.4314093,
    						43.6908087
    					],
    					[
    						-79.4313213,
    						43.6907969
    					],
    					[
    						-79.4312925,
    						43.6908992
    					],
    					[
    						-79.4310846,
    						43.6908468
    					],
    					[
    						-79.4309197,
    						43.6907794
    					],
    					[
    						-79.4306465,
    						43.6906209
    					],
    					[
    						-79.4302498,
    						43.6904148
    					],
    					[
    						-79.4301908,
    						43.6903367
    					],
    					[
    						-79.4298759,
    						43.6901898
    					],
    					[
    						-79.4291241,
    						43.6901542
    					],
    					[
    						-79.4287677,
    						43.6901582
    					],
    					[
    						-79.4281598,
    						43.6901946
    					],
    					[
    						-79.4281426,
    						43.690598
    					],
    					[
    						-79.4281282,
    						43.6907876
    					],
    					[
    						-79.428045,
    						43.6908274
    					],
    					[
    						-79.4278827,
    						43.6908419
    					],
    					[
    						-79.4275488,
    						43.6907469
    					],
    					[
    						-79.4275622,
    						43.6905588
    					],
    					[
    						-79.4273087,
    						43.6905549
    					],
    					[
    						-79.4273114,
    						43.6905772
    					],
    					[
    						-79.4271865,
    						43.6905679
    					],
    					[
    						-79.4271921,
    						43.6904793
    					],
    					[
    						-79.4268219,
    						43.6904463
    					],
    					[
    						-79.4267535,
    						43.6903784
    					],
    					[
    						-79.4260776,
    						43.6903338
    					],
    					[
    						-79.4260696,
    						43.6903842
    					],
    					[
    						-79.4257326,
    						43.6904304
    					],
    					[
    						-79.4256454,
    						43.6904329
    					],
    					[
    						-79.4252998,
    						43.6904628
    					],
    					[
    						-79.4252823,
    						43.6903959
    					],
    					[
    						-79.42484,
    						43.6904275
    					],
    					[
    						-79.4242781,
    						43.6903876
    					],
    					[
    						-79.4236537,
    						43.6901449
    					],
    					[
    						-79.4225741,
    						43.6896699
    					],
    					[
    						-79.422529,
    						43.6897045
    					],
    					[
    						-79.4223507,
    						43.6897171
    					],
    					[
    						-79.4219296,
    						43.6896094
    					],
    					[
    						-79.4219993,
    						43.689429
    					],
    					[
    						-79.4218671,
    						43.6893872
    					],
    					[
    						-79.4215809,
    						43.6894484
    					],
    					[
    						-79.4215702,
    						43.6894746
    					],
    					[
    						-79.4211299,
    						43.6895509
    					],
    					[
    						-79.4210022,
    						43.6895192
    					],
    					[
    						-79.4207923,
    						43.6896453
    					],
    					[
    						-79.4207279,
    						43.6896734
    					],
    					[
    						-79.4204839,
    						43.6896482
    					],
    					[
    						-79.4203283,
    						43.6895745
    					],
    					[
    						-79.4189005,
    						43.6890545
    					],
    					[
    						-79.4190102,
    						43.6888137
    					],
    					[
    						-79.4188488,
    						43.6887304
    					],
    					[
    						-79.418499,
    						43.6886377
    					],
    					[
    						-79.4181798,
    						43.6885243
    					],
    					[
    						-79.418031,
    						43.688342
    					],
    					[
    						-79.4177024,
    						43.6883837
    					],
    					[
    						-79.4175999,
    						43.6882837
    					],
    					[
    						-79.4176424,
    						43.6881647
    					],
    					[
    						-79.4177386,
    						43.6881257
    					],
    					[
    						-79.4177856,
    						43.6880093
    					],
    					[
    						-79.4175898,
    						43.6876757
    					],
    					[
    						-79.4174744,
    						43.687443
    					],
    					[
    						-79.4173738,
    						43.6872897
    					],
    					[
    						-79.4173104,
    						43.6870517
    					],
    					[
    						-79.4172867,
    						43.6869629
    					],
    					[
    						-79.4170533,
    						43.6867632
    					],
    					[
    						-79.4170144,
    						43.6866652
    					],
    					[
    						-79.4169742,
    						43.686575
    					],
    					[
    						-79.4169121,
    						43.6863781
    					],
    					[
    						-79.4168977,
    						43.6863432
    					],
    					[
    						-79.4167406,
    						43.6859623
    					]
    				]
    			]
    		},
    		id: "way/15707311"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15707476",
    			leisure: "park",
    			name: "Nordheimer Ravine"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4120241,
    						43.683241
    					],
    					[
    						-79.4122005,
    						43.6834003
    					],
    					[
    						-79.4122853,
    						43.6835833
    					],
    					[
    						-79.4122582,
    						43.6836161
    					],
    					[
    						-79.4122776,
    						43.6836947
    					],
    					[
    						-79.4124547,
    						43.6837029
    					],
    					[
    						-79.412515,
    						43.6836253
    					],
    					[
    						-79.4128286,
    						43.6835531
    					],
    					[
    						-79.4131541,
    						43.6836792
    					],
    					[
    						-79.4132921,
    						43.6836463
    					],
    					[
    						-79.4133458,
    						43.6836707
    					],
    					[
    						-79.4134871,
    						43.6839717
    					],
    					[
    						-79.4146407,
    						43.6837398
    					],
    					[
    						-79.4149719,
    						43.6836762
    					],
    					[
    						-79.415093,
    						43.6836309
    					],
    					[
    						-79.4150537,
    						43.6835948
    					],
    					[
    						-79.4150742,
    						43.68358
    					],
    					[
    						-79.4150983,
    						43.6835708
    					],
    					[
    						-79.4151339,
    						43.6835582
    					],
    					[
    						-79.4151744,
    						43.6835494
    					],
    					[
    						-79.4152106,
    						43.683546
    					],
    					[
    						-79.4152351,
    						43.6835465
    					],
    					[
    						-79.4152489,
    						43.6835843
    					],
    					[
    						-79.4153439,
    						43.6835665
    					],
    					[
    						-79.4153415,
    						43.6835604
    					],
    					[
    						-79.4154602,
    						43.6835359
    					],
    					[
    						-79.4154651,
    						43.6835482
    					],
    					[
    						-79.4156871,
    						43.6835029
    					],
    					[
    						-79.4157179,
    						43.6834791
    					],
    					[
    						-79.4157347,
    						43.6834592
    					],
    					[
    						-79.4157464,
    						43.6834367
    					],
    					[
    						-79.4157528,
    						43.6834177
    					],
    					[
    						-79.4157209,
    						43.6833688
    					],
    					[
    						-79.4157075,
    						43.6833247
    					],
    					[
    						-79.4157008,
    						43.6832607
    					],
    					[
    						-79.4157082,
    						43.6832039
    					],
    					[
    						-79.415731,
    						43.6831359
    					],
    					[
    						-79.4154654,
    						43.6831166
    					],
    					[
    						-79.4151033,
    						43.6829576
    					],
    					[
    						-79.4142064,
    						43.68273
    					],
    					[
    						-79.4136134,
    						43.6825357
    					],
    					[
    						-79.4128382,
    						43.6823622
    					],
    					[
    						-79.4121154,
    						43.6822006
    					],
    					[
    						-79.4120415,
    						43.6820976
    					],
    					[
    						-79.4117513,
    						43.6819814
    					],
    					[
    						-79.4116323,
    						43.6819575
    					],
    					[
    						-79.4112034,
    						43.6819803
    					],
    					[
    						-79.4107756,
    						43.6820053
    					],
    					[
    						-79.4106824,
    						43.6817773
    					],
    					[
    						-79.4101054,
    						43.6817843
    					],
    					[
    						-79.4100816,
    						43.6817836
    					],
    					[
    						-79.4100514,
    						43.6817942
    					],
    					[
    						-79.4100373,
    						43.6818112
    					],
    					[
    						-79.4100333,
    						43.681835
    					],
    					[
    						-79.4100873,
    						43.6819717
    					],
    					[
    						-79.4101419,
    						43.6820997
    					],
    					[
    						-79.4102126,
    						43.6822646
    					],
    					[
    						-79.4103289,
    						43.6825369
    					],
    					[
    						-79.4106221,
    						43.683251
    					],
    					[
    						-79.411407,
    						43.683145
    					],
    					[
    						-79.4115172,
    						43.683169
    					],
    					[
    						-79.4117077,
    						43.6832999
    					],
    					[
    						-79.4118136,
    						43.6832418
    					],
    					[
    						-79.4120241,
    						43.683241
    					]
    				]
    			]
    		},
    		id: "way/15707476"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15803457",
    			"addr:city": "Toronto",
    			"addr:housenumber": "44",
    			"addr:street": "Lisgar Street",
    			alt_name: "Lisgar Square",
    			leisure: "park",
    			name: "Lisgar Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4241011,
    						43.6426163
    					],
    					[
    						-79.4238593,
    						43.6420051
    					],
    					[
    						-79.4232343,
    						43.6421319
    					],
    					[
    						-79.4234815,
    						43.6427378
    					],
    					[
    						-79.4239199,
    						43.6426518
    					],
    					[
    						-79.4240573,
    						43.6430246
    					],
    					[
    						-79.424239,
    						43.6429895
    					],
    					[
    						-79.4241011,
    						43.6426163
    					]
    				]
    			]
    		},
    		id: "way/15803457"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15804193",
    			leisure: "park",
    			name: "Marian Engel Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.423632,
    						43.6741256
    					],
    					[
    						-79.4247432,
    						43.6739061
    					],
    					[
    						-79.4245915,
    						43.673479
    					],
    					[
    						-79.4234762,
    						43.6736956
    					],
    					[
    						-79.423632,
    						43.6741256
    					]
    				]
    			]
    		},
    		id: "way/15804193"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/15804201",
    			"addr:housenumber": "950",
    			"addr:street": "Davenport Road",
    			leisure: "park",
    			name: "Hillcrest Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4257739,
    						43.6763414
    					],
    					[
    						-79.4253135,
    						43.675204
    					],
    					[
    						-79.4252959,
    						43.6751944
    					],
    					[
    						-79.4252589,
    						43.6751897
    					],
    					[
    						-79.4252201,
    						43.6751895
    					],
    					[
    						-79.4233227,
    						43.6756059
    					],
    					[
    						-79.4232974,
    						43.6756284
    					],
    					[
    						-79.4232799,
    						43.6756508
    					],
    					[
    						-79.42327,
    						43.6756816
    					],
    					[
    						-79.4232725,
    						43.6757057
    					],
    					[
    						-79.423492,
    						43.6762342
    					],
    					[
    						-79.4236599,
    						43.6767767
    					],
    					[
    						-79.4236757,
    						43.6767987
    					],
    					[
    						-79.4237072,
    						43.6768089
    					],
    					[
    						-79.4237401,
    						43.6768055
    					],
    					[
    						-79.4247439,
    						43.676595
    					],
    					[
    						-79.4257095,
    						43.6763943
    					],
    					[
    						-79.4257282,
    						43.6763865
    					],
    					[
    						-79.4257443,
    						43.6763753
    					],
    					[
    						-79.4257537,
    						43.6763603
    					],
    					[
    						-79.4257571,
    						43.6763448
    					],
    					[
    						-79.4257739,
    						43.6763414
    					]
    				]
    			]
    		},
    		id: "way/15804201"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/19854532",
    			"addr:city": "Toronto",
    			"addr:housenumber": "45",
    			"addr:street": "Roxton Road",
    			leisure: "park",
    			name: "Roxton Road Parkette",
    			"name:source": "City of Toronto website"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4199386,
    						43.6508214
    					],
    					[
    						-79.4197978,
    						43.6504606
    					],
    					[
    						-79.4192753,
    						43.6505674
    					],
    					[
    						-79.4194161,
    						43.6509281
    					],
    					[
    						-79.4199386,
    						43.6508214
    					]
    				]
    			]
    		},
    		id: "way/19854532"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/19881730",
    			leisure: "park",
    			name: "Sorauren Park",
    			wikidata: "Q7563307",
    			"wikipedia:en": "Sorauren Avenue Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4429116,
    						43.6495539
    					],
    					[
    						-79.4439878,
    						43.6493402
    					],
    					[
    						-79.4445192,
    						43.6492346
    					],
    					[
    						-79.4442563,
    						43.6485284
    					],
    					[
    						-79.4439725,
    						43.6478088
    					],
    					[
    						-79.4438801,
    						43.647781
    					],
    					[
    						-79.4435569,
    						43.6478484
    					],
    					[
    						-79.4431924,
    						43.6479215
    					],
    					[
    						-79.4430634,
    						43.6479397
    					],
    					[
    						-79.442997,
    						43.6479547
    					],
    					[
    						-79.4429407,
    						43.647977
    					],
    					[
    						-79.4426977,
    						43.6480249
    					],
    					[
    						-79.4422618,
    						43.6481126
    					],
    					[
    						-79.4424118,
    						43.6485238
    					],
    					[
    						-79.4424463,
    						43.6486217
    					],
    					[
    						-79.4422841,
    						43.6486936
    					],
    					[
    						-79.4423361,
    						43.6489038
    					],
    					[
    						-79.442215,
    						43.6490054
    					],
    					[
    						-79.4425914,
    						43.6492878
    					],
    					[
    						-79.4429116,
    						43.6495539
    					]
    				]
    			]
    		},
    		id: "way/19881730"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/19881767",
    			"addr:city": "Toronto",
    			"addr:housenumber": "725",
    			"addr:street": "Logan Avenue",
    			leisure: "park",
    			name: "Withrow Park",
    			website: "https://www.toronto.ca/parks/parks_gardens/withrow.htm",
    			wikidata: "Q8028296",
    			wikipedia: "en:Withrow Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3488304,
    						43.6761062
    					],
    					[
    						-79.3488789,
    						43.6760914
    					],
    					[
    						-79.3488853,
    						43.6760785
    					],
    					[
    						-79.3488866,
    						43.6760618
    					],
    					[
    						-79.3487972,
    						43.675843
    					],
    					[
    						-79.3487415,
    						43.6757146
    					],
    					[
    						-79.3476343,
    						43.6731787
    					],
    					[
    						-79.3471489,
    						43.6719961
    					],
    					[
    						-79.3471177,
    						43.6719949
    					],
    					[
    						-79.3469577,
    						43.6720164
    					],
    					[
    						-79.34664,
    						43.672098
    					],
    					[
    						-79.3467904,
    						43.6724751
    					],
    					[
    						-79.3454371,
    						43.6727688
    					],
    					[
    						-79.3449887,
    						43.6728704
    					],
    					[
    						-79.3450927,
    						43.6731282
    					],
    					[
    						-79.3459161,
    						43.6750402
    					],
    					[
    						-79.3460329,
    						43.675272
    					],
    					[
    						-79.3465977,
    						43.6765877
    					],
    					[
    						-79.3466619,
    						43.6766054
    					],
    					[
    						-79.3477149,
    						43.6763712
    					],
    					[
    						-79.3480046,
    						43.6763089
    					],
    					[
    						-79.3483124,
    						43.6762241
    					],
    					[
    						-79.3488304,
    						43.6761062
    					]
    				]
    			]
    		},
    		id: "way/19881767"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/19930073",
    			leisure: "park",
    			name: "Wells Hill Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4169924,
    						43.68316
    					],
    					[
    						-79.4166791,
    						43.6823582
    					],
    					[
    						-79.4166369,
    						43.6822583
    					],
    					[
    						-79.4166134,
    						43.6822215
    					],
    					[
    						-79.4165873,
    						43.6821919
    					],
    					[
    						-79.4165538,
    						43.6821914
    					],
    					[
    						-79.4161856,
    						43.6822622
    					],
    					[
    						-79.4162542,
    						43.6824355
    					],
    					[
    						-79.4157125,
    						43.6825302
    					],
    					[
    						-79.4158027,
    						43.682559
    					],
    					[
    						-79.4158788,
    						43.6825928
    					],
    					[
    						-79.4159367,
    						43.6826452
    					],
    					[
    						-79.4159677,
    						43.6826817
    					],
    					[
    						-79.4160276,
    						43.6828265
    					],
    					[
    						-79.4160488,
    						43.6828815
    					],
    					[
    						-79.416051,
    						43.6829315
    					],
    					[
    						-79.4160388,
    						43.682976
    					],
    					[
    						-79.4160152,
    						43.683021
    					],
    					[
    						-79.4159717,
    						43.6830681
    					],
    					[
    						-79.4159167,
    						43.6831065
    					],
    					[
    						-79.4158834,
    						43.6831358
    					],
    					[
    						-79.415853,
    						43.6831739
    					],
    					[
    						-79.4158387,
    						43.6832157
    					],
    					[
    						-79.4158316,
    						43.6832587
    					],
    					[
    						-79.4158435,
    						43.6833235
    					],
    					[
    						-79.4158658,
    						43.6833664
    					],
    					[
    						-79.4159044,
    						43.6834057
    					],
    					[
    						-79.4159355,
    						43.6834299
    					],
    					[
    						-79.4159838,
    						43.6834537
    					],
    					[
    						-79.4160304,
    						43.6834629
    					],
    					[
    						-79.4169594,
    						43.6832791
    					],
    					[
    						-79.4169856,
    						43.6832675
    					],
    					[
    						-79.4169997,
    						43.6832548
    					],
    					[
    						-79.4170057,
    						43.6832369
    					],
    					[
    						-79.4169924,
    						43.68316
    					]
    				]
    			]
    		},
    		id: "way/19930073"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/20666267",
    			leisure: "park",
    			name: "St. Andrew's Playground",
    			wikidata: "Q7586885",
    			wikipedia: "en:St. Andrew's Market and Playground"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3994464,
    						43.6465857
    					],
    					[
    						-79.3992445,
    						43.6460716
    					],
    					[
    						-79.3982392,
    						43.6462805
    					],
    					[
    						-79.3984413,
    						43.6467845
    					],
    					[
    						-79.3994464,
    						43.6465857
    					]
    				]
    			]
    		},
    		id: "way/20666267"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22372301",
    			created_by: "JOSM",
    			leisure: "park",
    			name: "Lionel Conacher Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3937997,
    						43.680844
    					],
    					[
    						-79.3949761,
    						43.6806093
    					],
    					[
    						-79.3947775,
    						43.6800954
    					],
    					[
    						-79.3937262,
    						43.6803156
    					],
    					[
    						-79.3936711,
    						43.6803501
    					],
    					[
    						-79.3936308,
    						43.68039
    					],
    					[
    						-79.3936418,
    						43.6804431
    					],
    					[
    						-79.3936565,
    						43.6805387
    					],
    					[
    						-79.3937997,
    						43.680844
    					]
    				]
    			]
    		},
    		id: "way/22372301"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22480633",
    			leisure: "park",
    			name: "Poplar Plains Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4036533,
    						43.6803592
    					],
    					[
    						-79.4036542,
    						43.6802543
    					],
    					[
    						-79.4036737,
    						43.6801527
    					],
    					[
    						-79.4037019,
    						43.6800662
    					],
    					[
    						-79.4033057,
    						43.6799844
    					],
    					[
    						-79.4030773,
    						43.6799773
    					],
    					[
    						-79.4030012,
    						43.6800281
    					],
    					[
    						-79.402967,
    						43.6800126
    					],
    					[
    						-79.4028703,
    						43.6801494
    					],
    					[
    						-79.402725,
    						43.6803666
    					],
    					[
    						-79.4027146,
    						43.680402
    					],
    					[
    						-79.4031922,
    						43.6804145
    					],
    					[
    						-79.4036586,
    						43.6804059
    					],
    					[
    						-79.4036533,
    						43.6803592
    					]
    				]
    			]
    		},
    		id: "way/22480633"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22485784",
    			leisure: "park",
    			name: "Sir Winston Churchill Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4042181,
    						43.6800787
    					],
    					[
    						-79.4041284,
    						43.6802856
    					],
    					[
    						-79.4038109,
    						43.6802363
    					],
    					[
    						-79.4038052,
    						43.6802788
    					],
    					[
    						-79.4038019,
    						43.6803326
    					],
    					[
    						-79.4038193,
    						43.6804306
    					],
    					[
    						-79.4038434,
    						43.6805067
    					],
    					[
    						-79.4039386,
    						43.6806
    					],
    					[
    						-79.4039735,
    						43.6807143
    					],
    					[
    						-79.4039998,
    						43.6807869
    					],
    					[
    						-79.4046239,
    						43.6808482
    					],
    					[
    						-79.4058377,
    						43.6809616
    					],
    					[
    						-79.4062362,
    						43.681058
    					],
    					[
    						-79.406759,
    						43.6810882
    					],
    					[
    						-79.4068362,
    						43.6812271
    					],
    					[
    						-79.4069424,
    						43.6814183
    					],
    					[
    						-79.4071012,
    						43.6816278
    					],
    					[
    						-79.4073081,
    						43.6821722
    					],
    					[
    						-79.406624,
    						43.6823076
    					],
    					[
    						-79.4067335,
    						43.6824731
    					],
    					[
    						-79.4073811,
    						43.6823522
    					],
    					[
    						-79.4086785,
    						43.6850088
    					],
    					[
    						-79.4109364,
    						43.6845171
    					],
    					[
    						-79.4099855,
    						43.6821544
    					],
    					[
    						-79.4097443,
    						43.6815678
    					],
    					[
    						-79.4096451,
    						43.6814795
    					],
    					[
    						-79.4094683,
    						43.6810638
    					],
    					[
    						-79.4094291,
    						43.6810702
    					],
    					[
    						-79.4093969,
    						43.6810586
    					],
    					[
    						-79.4093849,
    						43.6810363
    					],
    					[
    						-79.4092722,
    						43.6810537
    					],
    					[
    						-79.4091475,
    						43.6810547
    					],
    					[
    						-79.4090711,
    						43.6810402
    					],
    					[
    						-79.4089249,
    						43.681077
    					],
    					[
    						-79.4086647,
    						43.6810285
    					],
    					[
    						-79.4081108,
    						43.6808412
    					],
    					[
    						-79.4081242,
    						43.6807667
    					],
    					[
    						-79.4078788,
    						43.680658
    					],
    					[
    						-79.4076656,
    						43.6806347
    					],
    					[
    						-79.4071707,
    						43.6805494
    					],
    					[
    						-79.4070607,
    						43.68053
    					],
    					[
    						-79.4069266,
    						43.6804175
    					],
    					[
    						-79.4066638,
    						43.6805213
    					],
    					[
    						-79.4060853,
    						43.6804678
    					],
    					[
    						-79.4054836,
    						43.6802943
    					],
    					[
    						-79.4047735,
    						43.6802465
    					],
    					[
    						-79.4045421,
    						43.6801566
    					],
    					[
    						-79.4044485,
    						43.6800773
    					],
    					[
    						-79.4042181,
    						43.6800787
    					]
    				]
    			]
    		},
    		id: "way/22485784"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22486452",
    			created_by: "JOSM",
    			leisure: "park",
    			name: "Pricefield Playground"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3884445,
    						43.6821643
    					],
    					[
    						-79.3893276,
    						43.6817892
    					],
    					[
    						-79.3889317,
    						43.6808604
    					],
    					[
    						-79.3880692,
    						43.6810258
    					],
    					[
    						-79.3881743,
    						43.6810571
    					],
    					[
    						-79.3882145,
    						43.6811018
    					],
    					[
    						-79.3884855,
    						43.6817093
    					],
    					[
    						-79.3884996,
    						43.6817591
    					],
    					[
    						-79.3884816,
    						43.6818111
    					],
    					[
    						-79.3884217,
    						43.6818634
    					],
    					[
    						-79.3883188,
    						43.6818929
    					],
    					[
    						-79.3884445,
    						43.6821643
    					]
    				]
    			]
    		},
    		id: "way/22486452"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22486743",
    			"addr:city": "North York",
    			"addr:housenumber": "251",
    			"addr:street": "Ferrand Drive",
    			leisure: "park",
    			"opendata:type": "106001"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3334606,
    						43.7202694
    					],
    					[
    						-79.3330057,
    						43.7192831
    					],
    					[
    						-79.3321045,
    						43.7195002
    					],
    					[
    						-79.3325594,
    						43.7204617
    					],
    					[
    						-79.3334606,
    						43.7202694
    					]
    				]
    			]
    		},
    		id: "way/22486743"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22688946",
    			"addr:city": "Toronto",
    			"addr:housenumber": "275",
    			"addr:street": "Avenue Road",
    			leisure: "park",
    			name: "Robertson Davies Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3980565,
    						43.6787432
    					],
    					[
    						-79.3978191,
    						43.6781714
    					],
    					[
    						-79.397118,
    						43.6785428
    					],
    					[
    						-79.3972655,
    						43.6789015
    					],
    					[
    						-79.3980565,
    						43.6787432
    					]
    				]
    			]
    		},
    		id: "way/22688946"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22688984",
    			created_by: "JOSM",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3988787,
    						43.6750241
    					],
    					[
    						-79.399776,
    						43.6748711
    					],
    					[
    						-79.3997581,
    						43.6744938
    					],
    					[
    						-79.3986555,
    						43.6744557
    					],
    					[
    						-79.3988787,
    						43.6750241
    					]
    				]
    			]
    		},
    		id: "way/22688984"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22694254",
    			leisure: "park",
    			name: "Roseneath Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4351014,
    						43.6821285
    					],
    					[
    						-79.4349994,
    						43.6818619
    					],
    					[
    						-79.4349008,
    						43.6818816
    					],
    					[
    						-79.4339951,
    						43.6820628
    					],
    					[
    						-79.4340971,
    						43.6823295
    					],
    					[
    						-79.4351014,
    						43.6821285
    					]
    				]
    			]
    		},
    		id: "way/22694254"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22694260",
    			created_by: "JOSM",
    			leisure: "park",
    			name: "Humewood Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.426781,
    						43.6832454
    					],
    					[
    						-79.425237,
    						43.6835245
    					],
    					[
    						-79.4254864,
    						43.6841042
    					],
    					[
    						-79.4267394,
    						43.6838852
    					],
    					[
    						-79.4268344,
    						43.6838294
    					],
    					[
    						-79.4269294,
    						43.6837736
    					],
    					[
    						-79.426971,
    						43.6837006
    					],
    					[
    						-79.426781,
    						43.6832454
    					]
    				]
    			]
    		},
    		id: "way/22694260"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22715610",
    			leisure: "park",
    			name: "Graham Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4309399,
    						43.6813713
    					],
    					[
    						-79.430889,
    						43.6812501
    					],
    					[
    						-79.4304067,
    						43.6813476
    					],
    					[
    						-79.4303665,
    						43.6812594
    					],
    					[
    						-79.4297006,
    						43.6813961
    					],
    					[
    						-79.4298665,
    						43.6818126
    					],
    					[
    						-79.4305336,
    						43.6816678
    					],
    					[
    						-79.4304712,
    						43.6815133
    					],
    					[
    						-79.4309592,
    						43.6814126
    					],
    					[
    						-79.4309399,
    						43.6813713
    					]
    				]
    			]
    		},
    		id: "way/22715610"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22715613",
    			"addr:housenumber": "27",
    			"addr:street": "Tichester Road",
    			leisure: "park",
    			name: "Tichester Park",
    			source: "local knowledge"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4184647,
    						43.6854653
    					],
    					[
    						-79.418339,
    						43.6851406
    					],
    					[
    						-79.4173761,
    						43.6853355
    					],
    					[
    						-79.4175017,
    						43.6856602
    					],
    					[
    						-79.4184647,
    						43.6854653
    					]
    				]
    			]
    		},
    		id: "way/22715613"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22788173",
    			"addr:city": "Toronto",
    			"addr:housenumber": "120",
    			"addr:street": "Roxton Road",
    			leisure: "park",
    			name: "George Ben Park",
    			"name:source": "City of Toronto website",
    			note: "Missing sign"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4205846,
    						43.6521508
    					],
    					[
    						-79.420841,
    						43.6528202
    					],
    					[
    						-79.4213925,
    						43.6526974
    					],
    					[
    						-79.4214112,
    						43.6527358
    					],
    					[
    						-79.4219006,
    						43.652636
    					],
    					[
    						-79.421629,
    						43.6519312
    					],
    					[
    						-79.4205846,
    						43.6521508
    					]
    				]
    			]
    		},
    		id: "way/22788173"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22788426",
    			created_by: "JOSM",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4048581,
    						43.6487056
    					],
    					[
    						-79.404819,
    						43.6485991
    					],
    					[
    						-79.4046759,
    						43.6486265
    					],
    					[
    						-79.404715,
    						43.6487331
    					],
    					[
    						-79.4048581,
    						43.6487056
    					]
    				]
    			]
    		},
    		id: "way/22788426"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22913944",
    			"addr:city": "Toronto",
    			"addr:housenumber": "420",
    			"addr:street": "Yonge Street",
    			alt_name: "Barbara Ann Scott Park",
    			leisure: "park",
    			name: "College Park",
    			note: "FIXME"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3845455,
    						43.6601491
    					],
    					[
    						-79.3841705,
    						43.65924
    					],
    					[
    						-79.383879,
    						43.659294
    					],
    					[
    						-79.3837751,
    						43.6592593
    					],
    					[
    						-79.3837192,
    						43.6591146
    					],
    					[
    						-79.3837594,
    						43.6590685
    					],
    					[
    						-79.3836844,
    						43.6588951
    					],
    					[
    						-79.3835081,
    						43.6589247
    					],
    					[
    						-79.3836713,
    						43.659338
    					],
    					[
    						-79.3832584,
    						43.6594295
    					],
    					[
    						-79.3833169,
    						43.6595573
    					],
    					[
    						-79.3831272,
    						43.6596047
    					],
    					[
    						-79.3833366,
    						43.6600547
    					],
    					[
    						-79.3835151,
    						43.6600271
    					],
    					[
    						-79.383703,
    						43.6601033
    					],
    					[
    						-79.3838876,
    						43.6600676
    					],
    					[
    						-79.3839995,
    						43.6601115
    					],
    					[
    						-79.3840569,
    						43.6602465
    					],
    					[
    						-79.3845455,
    						43.6601491
    					]
    				]
    			]
    		},
    		id: "way/22913944"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22952584",
    			"addr:city": "Toronto",
    			"addr:housenumber": "659",
    			"addr:street": "Queens Quay West",
    			leisure: "park",
    			name: "Little Norway Park",
    			wikidata: "Q6651191",
    			wikipedia: "en:Little Norway Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3983984,
    						43.6355382
    					],
    					[
    						-79.3995343,
    						43.634962
    					],
    					[
    						-79.3995444,
    						43.6349253
    					],
    					[
    						-79.3985799,
    						43.6339656
    					],
    					[
    						-79.3985762,
    						43.6338623
    					],
    					[
    						-79.3987051,
    						43.6337932
    					],
    					[
    						-79.3982193,
    						43.6333119
    					],
    					[
    						-79.3976232,
    						43.6336339
    					],
    					[
    						-79.3977083,
    						43.6337148
    					],
    					[
    						-79.397935,
    						43.6339852
    					],
    					[
    						-79.3978936,
    						43.6340541
    					],
    					[
    						-79.3978051,
    						43.6341217
    					],
    					[
    						-79.3976985,
    						43.6341632
    					],
    					[
    						-79.3975919,
    						43.6342166
    					],
    					[
    						-79.3975116,
    						43.6342629
    					],
    					[
    						-79.397446,
    						43.6343211
    					],
    					[
    						-79.3974319,
    						43.6343738
    					],
    					[
    						-79.3983984,
    						43.6355382
    					]
    				]
    			]
    		},
    		id: "way/22952584"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/22979116",
    			leisure: "park",
    			name: "Moss Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.372612,
    						43.6555491
    					],
    					[
    						-79.3719818,
    						43.6540933
    					],
    					[
    						-79.3696227,
    						43.6545968
    					],
    					[
    						-79.3697584,
    						43.6550704
    					],
    					[
    						-79.3701862,
    						43.6560642
    					],
    					[
    						-79.3702244,
    						43.6560572
    					],
    					[
    						-79.370698,
    						43.6559576
    					],
    					[
    						-79.3708158,
    						43.6559325
    					],
    					[
    						-79.3708418,
    						43.655927
    					],
    					[
    						-79.370854,
    						43.6559243
    					],
    					[
    						-79.3713152,
    						43.6558265
    					],
    					[
    						-79.3713293,
    						43.6558229
    					],
    					[
    						-79.3716419,
    						43.6557562
    					],
    					[
    						-79.3721722,
    						43.655643
    					],
    					[
    						-79.3722565,
    						43.655625
    					],
    					[
    						-79.3722857,
    						43.6556188
    					],
    					[
    						-79.3724706,
    						43.6555793
    					],
    					[
    						-79.372612,
    						43.6555491
    					]
    				]
    			]
    		},
    		id: "way/22979116"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23110977",
    			layer: "0",
    			leisure: "park",
    			name: "Simcoe Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3874418,
    						43.6448919
    					],
    					[
    						-79.3872615,
    						43.6444522
    					],
    					[
    						-79.3872313,
    						43.6443965
    					],
    					[
    						-79.3871573,
    						43.6444131
    					],
    					[
    						-79.3870054,
    						43.6444459
    					],
    					[
    						-79.3867545,
    						43.6445001
    					],
    					[
    						-79.3864143,
    						43.6445736
    					],
    					[
    						-79.3863257,
    						43.6445927
    					],
    					[
    						-79.3863317,
    						43.6446074
    					],
    					[
    						-79.3863798,
    						43.6447316
    					],
    					[
    						-79.3864236,
    						43.6448385
    					],
    					[
    						-79.3865025,
    						43.6450407
    					],
    					[
    						-79.3865423,
    						43.645087
    					],
    					[
    						-79.3866435,
    						43.6450828
    					],
    					[
    						-79.3867074,
    						43.6450734
    					],
    					[
    						-79.3872396,
    						43.6449647
    					],
    					[
    						-79.3873464,
    						43.6449333
    					],
    					[
    						-79.3874418,
    						43.6448919
    					]
    				]
    			]
    		},
    		id: "way/23110977"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23143716",
    			"addr:city": "Toronto",
    			"addr:housenumber": "120",
    			"addr:street": "King Street East",
    			leisure: "park",
    			name: "St. James Park",
    			"name:ko": "세인트 제임스 공원"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3723023,
    						43.6504626
    					],
    					[
    						-79.3724491,
    						43.6508079
    					],
    					[
    						-79.3721931,
    						43.6508608
    					],
    					[
    						-79.3724358,
    						43.6514265
    					],
    					[
    						-79.3725008,
    						43.6514217
    					],
    					[
    						-79.3725549,
    						43.6514472
    					],
    					[
    						-79.3725877,
    						43.651489
    					],
    					[
    						-79.3728172,
    						43.6515142
    					],
    					[
    						-79.3729539,
    						43.6515069
    					],
    					[
    						-79.3730491,
    						43.6514955
    					],
    					[
    						-79.3731943,
    						43.6514672
    					],
    					[
    						-79.37379,
    						43.6513334
    					],
    					[
    						-79.373644,
    						43.6510105
    					],
    					[
    						-79.3739728,
    						43.6509382
    					],
    					[
    						-79.373931,
    						43.6508463
    					],
    					[
    						-79.3745852,
    						43.6507128
    					],
    					[
    						-79.3743071,
    						43.6500406
    					],
    					[
    						-79.3723023,
    						43.6504626
    					]
    				]
    			]
    		},
    		id: "way/23143716"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23208536",
    			"addr:city": "Toronto",
    			"addr:housenumber": "250",
    			"addr:street": "Avenue Road",
    			leisure: "park",
    			name: "Sergeant Ryan Russell Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3981853,
    						43.6771587
    					],
    					[
    						-79.3978155,
    						43.6772369
    					],
    					[
    						-79.397788,
    						43.6772583
    					],
    					[
    						-79.398013,
    						43.677836
    					],
    					[
    						-79.3982255,
    						43.6777377
    					],
    					[
    						-79.3984091,
    						43.6776527
    					],
    					[
    						-79.3982793,
    						43.6773662
    					],
    					[
    						-79.3981853,
    						43.6771587
    					]
    				]
    			]
    		},
    		id: "way/23208536"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23208544",
    			leisure: "park",
    			name: "Jay Macpherson Green",
    			old_name: "Dupont Parkette East",
    			source: "http://app.toronto.ca/tmmis/viewAgendaItemHistory.do?item=2013.TE25.127"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3973849,
    						43.6770707
    					],
    					[
    						-79.3969459,
    						43.6771657
    					],
    					[
    						-79.3971303,
    						43.6776279
    					],
    					[
    						-79.3975508,
    						43.677541
    					],
    					[
    						-79.3975766,
    						43.6775161
    					],
    					[
    						-79.3973849,
    						43.6770707
    					]
    				]
    			]
    		},
    		id: "way/23208544"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23209334",
    			leisure: "park",
    			name: "Main Sewage Treatment Playground"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3195802,
    						43.6629325
    					],
    					[
    						-79.3189022,
    						43.6614485
    					],
    					[
    						-79.3151685,
    						43.6623799
    					],
    					[
    						-79.3151256,
    						43.66256
    					],
    					[
    						-79.3162414,
    						43.6652733
    					],
    					[
    						-79.3162599,
    						43.6653183
    					],
    					[
    						-79.3162827,
    						43.6653435
    					],
    					[
    						-79.3163109,
    						43.6653619
    					],
    					[
    						-79.3163491,
    						43.6653745
    					],
    					[
    						-79.3163873,
    						43.6653779
    					],
    					[
    						-79.3164486,
    						43.6653736
    					],
    					[
    						-79.3177544,
    						43.6650733
    					],
    					[
    						-79.3180827,
    						43.6649303
    					],
    					[
    						-79.3183133,
    						43.6647705
    					],
    					[
    						-79.3191082,
    						43.6640626
    					],
    					[
    						-79.3193485,
    						43.6638825
    					],
    					[
    						-79.319441,
    						43.6638252
    					],
    					[
    						-79.3196516,
    						43.6637214
    					],
    					[
    						-79.3199193,
    						43.6636508
    					],
    					[
    						-79.3195802,
    						43.6629325
    					]
    				]
    			]
    		},
    		id: "way/23209334"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23209342",
    			leisure: "park",
    			name: "Woodbine Park",
    			note: "Part near Queen Street seems to be named \"Measurement Park\". Not sure where it begins and ends"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3147737,
    						43.662473
    					],
    					[
    						-79.3146278,
    						43.6623985
    					],
    					[
    						-79.309847,
    						43.6634851
    					],
    					[
    						-79.3114435,
    						43.6673657
    					],
    					[
    						-79.3123962,
    						43.6671484
    					],
    					[
    						-79.3124305,
    						43.6670118
    					],
    					[
    						-79.3124772,
    						43.6666678
    					],
    					[
    						-79.3125621,
    						43.6664841
    					],
    					[
    						-79.3126849,
    						43.6663536
    					],
    					[
    						-79.3128645,
    						43.6662123
    					],
    					[
    						-79.312327,
    						43.6663311
    					],
    					[
    						-79.3118155,
    						43.6652276
    					],
    					[
    						-79.3143789,
    						43.6646524
    					],
    					[
    						-79.3148252,
    						43.6657141
    					],
    					[
    						-79.3153059,
    						43.6656024
    					],
    					[
    						-79.3155977,
    						43.6654968
    					],
    					[
    						-79.315735,
    						43.6653975
    					],
    					[
    						-79.3158037,
    						43.6652547
    					],
    					[
    						-79.3157779,
    						43.6650249
    					],
    					[
    						-79.3156921,
    						43.6645903
    					],
    					[
    						-79.3154089,
    						43.6639073
    					],
    					[
    						-79.3153086,
    						43.6637513
    					],
    					[
    						-79.3150827,
    						43.6632802
    					],
    					[
    						-79.3150312,
    						43.6631064
    					],
    					[
    						-79.3147737,
    						43.662473
    					]
    				]
    			]
    		},
    		id: "way/23209342"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23296908",
    			leisure: "park",
    			name: "McGregor Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4429765,
    						43.6525838
    					],
    					[
    						-79.4413256,
    						43.6529402
    					],
    					[
    						-79.4412818,
    						43.6529493
    					],
    					[
    						-79.440912,
    						43.6530281
    					],
    					[
    						-79.4411862,
    						43.6537346
    					],
    					[
    						-79.4411955,
    						43.6537432
    					],
    					[
    						-79.4412141,
    						43.6537518
    					],
    					[
    						-79.4412307,
    						43.6537595
    					],
    					[
    						-79.4412589,
    						43.6537653
    					],
    					[
    						-79.4413032,
    						43.6537572
    					],
    					[
    						-79.4414561,
    						43.653723
    					],
    					[
    						-79.4420437,
    						43.6536016
    					],
    					[
    						-79.4421293,
    						43.6535838
    					],
    					[
    						-79.4422084,
    						43.6535639
    					],
    					[
    						-79.442189,
    						43.6535159
    					],
    					[
    						-79.4431707,
    						43.6533189
    					],
    					[
    						-79.4431767,
    						43.653333
    					],
    					[
    						-79.4432741,
    						43.6533119
    					],
    					[
    						-79.4429765,
    						43.6525838
    					]
    				]
    			]
    		},
    		id: "way/23296908"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23297006",
    			leisure: "park",
    			name: "McCormick Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4343337,
    						43.6468083
    					],
    					[
    						-79.4341822,
    						43.6463934
    					],
    					[
    						-79.4341614,
    						43.6463724
    					],
    					[
    						-79.4341551,
    						43.6463695
    					],
    					[
    						-79.4341417,
    						43.6463632
    					],
    					[
    						-79.4341148,
    						43.6463637
    					],
    					[
    						-79.4335952,
    						43.6464709
    					],
    					[
    						-79.4324878,
    						43.646702
    					],
    					[
    						-79.4324827,
    						43.6467143
    					],
    					[
    						-79.4325176,
    						43.6468062
    					],
    					[
    						-79.4326601,
    						43.6471796
    					],
    					[
    						-79.4327483,
    						43.6471677
    					],
    					[
    						-79.4327855,
    						43.6472367
    					],
    					[
    						-79.4329769,
    						43.6471981
    					],
    					[
    						-79.4329703,
    						43.647181
    					],
    					[
    						-79.4333379,
    						43.6471068
    					],
    					[
    						-79.4333414,
    						43.647116
    					],
    					[
    						-79.433367,
    						43.6471823
    					],
    					[
    						-79.4334577,
    						43.647164
    					],
    					[
    						-79.4334324,
    						43.6470987
    					],
    					[
    						-79.4335073,
    						43.6470833
    					],
    					[
    						-79.4335264,
    						43.6471364
    					],
    					[
    						-79.4336987,
    						43.6471009
    					],
    					[
    						-79.4336777,
    						43.6470464
    					],
    					[
    						-79.4342632,
    						43.6469283
    					],
    					[
    						-79.4343616,
    						43.6468644
    					],
    					[
    						-79.4343337,
    						43.6468083
    					]
    				]
    			]
    		},
    		id: "way/23297006"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23297016",
    			"addr:housenumber": "1717",
    			"addr:street": "Dundas Street West",
    			leisure: "park",
    			name: "Dundas-St. Clarens Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4387859,
    						43.6495634
    					],
    					[
    						-79.4387544,
    						43.649552
    					],
    					[
    						-79.4385456,
    						43.6495917
    					],
    					[
    						-79.4385888,
    						43.6497033
    					],
    					[
    						-79.4386011,
    						43.6497353
    					],
    					[
    						-79.4386558,
    						43.6498703
    					],
    					[
    						-79.4387088,
    						43.6500077
    					],
    					[
    						-79.4389719,
    						43.6500288
    					],
    					[
    						-79.4389766,
    						43.649995
    					],
    					[
    						-79.438994,
    						43.6498693
    					],
    					[
    						-79.438975,
    						43.6498674
    					],
    					[
    						-79.438981,
    						43.6498111
    					],
    					[
    						-79.4390481,
    						43.6497838
    					],
    					[
    						-79.4390255,
    						43.6497035
    					],
    					[
    						-79.4388973,
    						43.6497315
    					],
    					[
    						-79.4388732,
    						43.6496736
    					],
    					[
    						-79.4388221,
    						43.6496558
    					],
    					[
    						-79.4387859,
    						43.6495634
    					]
    				]
    			]
    		},
    		id: "way/23297016"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23621535",
    			"addr:city": "Toronto",
    			"addr:housenumber": "945",
    			"addr:street": "King Street West",
    			leisure: "park",
    			name: "Massey Harris Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4138219,
    						43.6415544
    					],
    					[
    						-79.4136502,
    						43.6411071
    					],
    					[
    						-79.4134886,
    						43.6411693
    					],
    					[
    						-79.4128075,
    						43.6413049
    					],
    					[
    						-79.4129862,
    						43.641736
    					],
    					[
    						-79.4138219,
    						43.6415544
    					]
    				]
    			]
    		},
    		id: "way/23621535"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23689547",
    			"addr:housenumber": "845",
    			"addr:street": "King Street West",
    			alt_name: "Stanley Park South",
    			leisure: "park",
    			name: "Stanley Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4095677,
    						43.6412014
    					],
    					[
    						-79.4074992,
    						43.6416361
    					],
    					[
    						-79.4086922,
    						43.6425927
    					],
    					[
    						-79.4099882,
    						43.6423194
    					],
    					[
    						-79.4095677,
    						43.6412014
    					]
    				]
    			]
    		},
    		id: "way/23689547"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23689549",
    			"addr:city": "Toronto",
    			"addr:housenumber": "890",
    			"addr:street": "King Street West",
    			alt_name: "Stanley Park North",
    			leisure: "park",
    			name: "Stanley Park",
    			"opendata:type": "106001"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4105601,
    						43.6436762
    					],
    					[
    						-79.4101188,
    						43.6425253
    					],
    					[
    						-79.4089899,
    						43.6427507
    					],
    					[
    						-79.4098408,
    						43.6438166
    					],
    					[
    						-79.4105601,
    						43.6436762
    					]
    				]
    			]
    		},
    		id: "way/23689549"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23689573",
    			leisure: "park",
    			name: "Masaryk Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4334886,
    						43.6404033
    					],
    					[
    						-79.4332218,
    						43.6397322
    					],
    					[
    						-79.4330692,
    						43.639764
    					],
    					[
    						-79.4325729,
    						43.6398673
    					],
    					[
    						-79.4327998,
    						43.6404379
    					],
    					[
    						-79.4328528,
    						43.6404269
    					],
    					[
    						-79.4328928,
    						43.6405274
    					],
    					[
    						-79.4330257,
    						43.6404997
    					],
    					[
    						-79.4333582,
    						43.6404305
    					],
    					[
    						-79.4334886,
    						43.6404033
    					]
    				]
    			]
    		},
    		id: "way/23689573"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23733034",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3303569,
    						43.669858
    					],
    					[
    						-79.3292834,
    						43.6674247
    					],
    					[
    						-79.3276182,
    						43.6676917
    					],
    					[
    						-79.3267514,
    						43.6677103
    					],
    					[
    						-79.3279191,
    						43.6704255
    					],
    					[
    						-79.3283159,
    						43.6703389
    					],
    					[
    						-79.3303569,
    						43.669858
    					]
    				]
    			]
    		},
    		id: "way/23733034"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/23973346",
    			leisure: "park",
    			name: "Riverdale Park West"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3629456,
    						43.6670508
    					],
    					[
    						-79.362439,
    						43.6657928
    					],
    					[
    						-79.3623853,
    						43.6658039
    					],
    					[
    						-79.3610308,
    						43.6661042
    					],
    					[
    						-79.360883,
    						43.6659536
    					],
    					[
    						-79.360589,
    						43.6653356
    					],
    					[
    						-79.3604315,
    						43.6653611
    					],
    					[
    						-79.3600912,
    						43.6654163
    					],
    					[
    						-79.3599453,
    						43.6654163
    					],
    					[
    						-79.3597222,
    						43.6653915
    					],
    					[
    						-79.3592673,
    						43.6651307
    					],
    					[
    						-79.3577652,
    						43.6649134
    					],
    					[
    						-79.3576365,
    						43.6664532
    					],
    					[
    						-79.3580828,
    						43.6675459
    					],
    					[
    						-79.3581255,
    						43.6676388
    					],
    					[
    						-79.3583863,
    						43.6682062
    					],
    					[
    						-79.3586129,
    						43.6686992
    					],
    					[
    						-79.3588032,
    						43.668571
    					],
    					[
    						-79.3593243,
    						43.6682156
    					],
    					[
    						-79.3599214,
    						43.6679303
    					],
    					[
    						-79.3608143,
    						43.6676495
    					],
    					[
    						-79.3607662,
    						43.6675136
    					],
    					[
    						-79.3618603,
    						43.6672828
    					],
    					[
    						-79.3619306,
    						43.6672668
    					],
    					[
    						-79.3629456,
    						43.6670508
    					]
    				]
    			]
    		},
    		id: "way/23973346"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24007602",
    			leisure: "park",
    			name: "Les Anthony Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3233002,
    						43.6913046
    					],
    					[
    						-79.3229561,
    						43.6912948
    					],
    					[
    						-79.3228083,
    						43.6912636
    					],
    					[
    						-79.3227423,
    						43.6917886
    					],
    					[
    						-79.3230684,
    						43.6914907
    					],
    					[
    						-79.3233002,
    						43.6913046
    					]
    				]
    			]
    		},
    		id: "way/24007602"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24008059",
    			leisure: "park",
    			name: "Erwin Krichhahn Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4461059,
    						43.6586736
    					],
    					[
    						-79.4457385,
    						43.6587416
    					],
    					[
    						-79.4462963,
    						43.6601213
    					],
    					[
    						-79.4467129,
    						43.6600269
    					],
    					[
    						-79.4461372,
    						43.6586817
    					],
    					[
    						-79.4461059,
    						43.6586736
    					]
    				]
    			]
    		},
    		id: "way/24008059"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24008061",
    			"addr:housenumber": "225",
    			"addr:street": "Campbell Avenue",
    			leisure: "park",
    			name: "Campbell Avenue Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4491795,
    						43.664134
    					],
    					[
    						-79.4486737,
    						43.6628761
    					],
    					[
    						-79.4475121,
    						43.6631331
    					],
    					[
    						-79.4475259,
    						43.6631557
    					],
    					[
    						-79.4480202,
    						43.6643646
    					],
    					[
    						-79.4491795,
    						43.664134
    					]
    				]
    			]
    		},
    		id: "way/24008061"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24008063",
    			"addr:housenumber": "350",
    			"addr:street": "Perth Avenue",
    			leisure: "park",
    			name: "Perth Square Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4528545,
    						43.6635198
    					],
    					[
    						-79.4525172,
    						43.6635825
    					],
    					[
    						-79.4517487,
    						43.6637464
    					],
    					[
    						-79.4520413,
    						43.6644587
    					],
    					[
    						-79.4520491,
    						43.6644662
    					],
    					[
    						-79.4520582,
    						43.6644718
    					],
    					[
    						-79.4520682,
    						43.6644746
    					],
    					[
    						-79.4531654,
    						43.6642494
    					],
    					[
    						-79.4528545,
    						43.6635198
    					]
    				]
    			]
    		},
    		id: "way/24008063"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24008078",
    			"addr:housenumber": "20",
    			"addr:street": "Edith Avenue",
    			leisure: "park",
    			name: "Carlton Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4558793,
    						43.6659443
    					],
    					[
    						-79.4558642,
    						43.6659256
    					],
    					[
    						-79.4558434,
    						43.665911
    					],
    					[
    						-79.4558193,
    						43.6659033
    					],
    					[
    						-79.4557871,
    						43.6659023
    					],
    					[
    						-79.4546847,
    						43.6661278
    					],
    					[
    						-79.4546539,
    						43.6661438
    					],
    					[
    						-79.4546351,
    						43.6661652
    					],
    					[
    						-79.4546262,
    						43.6661892
    					],
    					[
    						-79.4549884,
    						43.6670593
    					],
    					[
    						-79.4562531,
    						43.6670727
    					],
    					[
    						-79.4562554,
    						43.6670354
    					],
    					[
    						-79.4562592,
    						43.6669442
    					],
    					[
    						-79.4562779,
    						43.6669073
    					],
    					[
    						-79.4561088,
    						43.6664988
    					],
    					[
    						-79.4558793,
    						43.6659443
    					]
    				]
    			]
    		},
    		id: "way/24008078"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24008175",
    			leisure: "park",
    			name: "Chelsea Avenue Playground"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4560569,
    						43.6576019
    					],
    					[
    						-79.4559645,
    						43.657441
    					],
    					[
    						-79.4559132,
    						43.6572941
    					],
    					[
    						-79.4558834,
    						43.6572067
    					],
    					[
    						-79.4559218,
    						43.6571495
    					],
    					[
    						-79.455632,
    						43.6572107
    					],
    					[
    						-79.4556021,
    						43.6571432
    					],
    					[
    						-79.4554445,
    						43.6571711
    					],
    					[
    						-79.455626,
    						43.6575704
    					],
    					[
    						-79.4557413,
    						43.6575842
    					],
    					[
    						-79.4557907,
    						43.6576015
    					],
    					[
    						-79.4558566,
    						43.6576291
    					],
    					[
    						-79.4560569,
    						43.6576019
    					]
    				]
    			]
    		},
    		id: "way/24008175"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24032184",
    			"addr:full": "170 Amelia Street; 500 Wellesley Street",
    			leisure: "park",
    			name: "Wellesley Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3624773,
    						43.6686644
    					],
    					[
    						-79.3612432,
    						43.6689363
    					],
    					[
    						-79.3616119,
    						43.6701126
    					],
    					[
    						-79.3626404,
    						43.6703779
    					],
    					[
    						-79.3632498,
    						43.6702661
    					],
    					[
    						-79.3624773,
    						43.6686644
    					]
    				]
    			]
    		},
    		id: "way/24032184"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24039428",
    			"addr:city": "Toronto",
    			"addr:housenumber": "11",
    			"addr:street": "Granby Street",
    			leisure: "park",
    			name: "Joseph Sheard Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3816843,
    						43.6601008
    					],
    					[
    						-79.3817707,
    						43.6603309
    					],
    					[
    						-79.3817269,
    						43.6603449
    					],
    					[
    						-79.3818335,
    						43.6606131
    					],
    					[
    						-79.381988,
    						43.6605759
    					],
    					[
    						-79.3820224,
    						43.6605448
    					],
    					[
    						-79.3820395,
    						43.6604952
    					],
    					[
    						-79.3818679,
    						43.6601226
    					],
    					[
    						-79.3818272,
    						43.6600878
    					],
    					[
    						-79.3817668,
    						43.6600781
    					],
    					[
    						-79.3816843,
    						43.6601008
    					]
    				]
    			]
    		},
    		id: "way/24039428"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24039517",
    			leisure: "park",
    			name: "Victoria Memorial Square",
    			note: "Was originally a cemetery",
    			"opendata:type": "106004",
    			wikidata: "Q7926868",
    			"wikipedia:en": "Victoria Memorial Square"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4012117,
    						43.6428197
    					],
    					[
    						-79.4011017,
    						43.6425409
    					],
    					[
    						-79.4008151,
    						43.6426004
    					],
    					[
    						-79.4006757,
    						43.6422219
    					],
    					[
    						-79.3993592,
    						43.6424881
    					],
    					[
    						-79.3996078,
    						43.643106
    					],
    					[
    						-79.3996637,
    						43.6431204
    					],
    					[
    						-79.4002425,
    						43.6430019
    					],
    					[
    						-79.4012117,
    						43.6428197
    					]
    				]
    			]
    		},
    		id: "way/24039517"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24255318",
    			created_by: "Potlatch 0.8c",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4966671,
    						43.696992
    					],
    					[
    						-79.4988955,
    						43.6971705
    					],
    					[
    						-79.4989962,
    						43.6965136
    					],
    					[
    						-79.4967678,
    						43.6963351
    					],
    					[
    						-79.4966671,
    						43.696992
    					]
    				]
    			]
    		},
    		id: "way/24255318"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24263997",
    			"addr:city": "Toronto",
    			"addr:housenumber": "47",
    			"addr:street": "Denison Avenue",
    			leisure: "park",
    			name: "Randy Padmore Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4004804,
    						43.6499914
    					],
    					[
    						-79.4012794,
    						43.6498339
    					],
    					[
    						-79.401201,
    						43.6496255
    					],
    					[
    						-79.400402,
    						43.649783
    					],
    					[
    						-79.4004804,
    						43.6499914
    					]
    				]
    			]
    		},
    		id: "way/24263997"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24399322",
    			created_by: "Potlatch 0.9a",
    			leisure: "park",
    			name: "Jimmie Simpson Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3456155,
    						43.6599269
    					],
    					[
    						-79.3436661,
    						43.6603501
    					],
    					[
    						-79.3448975,
    						43.6631715
    					],
    					[
    						-79.345155,
    						43.6624016
    					],
    					[
    						-79.345361,
    						43.661644
    					],
    					[
    						-79.3456155,
    						43.6599269
    					]
    				]
    			]
    		},
    		id: "way/24399322"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24460930",
    			leisure: "park",
    			name: "East Lynn Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3160991,
    						43.6848331
    					],
    					[
    						-79.3160004,
    						43.6845976
    					],
    					[
    						-79.3159106,
    						43.6843871
    					],
    					[
    						-79.3158891,
    						43.6843507
    					],
    					[
    						-79.3158583,
    						43.6843202
    					],
    					[
    						-79.3158073,
    						43.6842906
    					],
    					[
    						-79.3157356,
    						43.684237
    					],
    					[
    						-79.3157027,
    						43.6842004
    					],
    					[
    						-79.3156806,
    						43.6841641
    					],
    					[
    						-79.3156537,
    						43.6841136
    					],
    					[
    						-79.3156406,
    						43.684069
    					],
    					[
    						-79.3155908,
    						43.6833247
    					],
    					[
    						-79.3150503,
    						43.6833382
    					],
    					[
    						-79.3150644,
    						43.6834697
    					],
    					[
    						-79.31507,
    						43.6839401
    					],
    					[
    						-79.3145477,
    						43.6839589
    					],
    					[
    						-79.3145265,
    						43.6839657
    					],
    					[
    						-79.3145366,
    						43.6840133
    					],
    					[
    						-79.3145554,
    						43.6840632
    					],
    					[
    						-79.3145869,
    						43.6841199
    					],
    					[
    						-79.314633,
    						43.6841761
    					],
    					[
    						-79.3147791,
    						43.6842758
    					],
    					[
    						-79.3149875,
    						43.6843567
    					],
    					[
    						-79.3150515,
    						43.6844573
    					],
    					[
    						-79.3152917,
    						43.6850169
    					],
    					[
    						-79.315303,
    						43.6850272
    					],
    					[
    						-79.3153218,
    						43.6850359
    					],
    					[
    						-79.3153473,
    						43.6850369
    					],
    					[
    						-79.3160688,
    						43.6848846
    					],
    					[
    						-79.316095,
    						43.6848696
    					],
    					[
    						-79.3161023,
    						43.6848536
    					],
    					[
    						-79.3160991,
    						43.6848331
    					]
    				]
    			]
    		},
    		id: "way/24460930"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24488503",
    			"addr:city": "East York",
    			"addr:housenumber": "388",
    			"addr:street": "O'Connor Drive",
    			fixme: "canvec shows service roads entering this park - are these actually paths?",
    			leisure: "park",
    			name: "Four Oaks Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3385419,
    						43.6969591
    					],
    					[
    						-79.3385334,
    						43.6969091
    					],
    					[
    						-79.3382304,
    						43.6968258
    					],
    					[
    						-79.3379501,
    						43.6966876
    					],
    					[
    						-79.3377212,
    						43.6965709
    					],
    					[
    						-79.3375341,
    						43.6961026
    					],
    					[
    						-79.3371415,
    						43.6961817
    					],
    					[
    						-79.337312,
    						43.6966103
    					],
    					[
    						-79.3372989,
    						43.6967071
    					],
    					[
    						-79.3372115,
    						43.69687
    					],
    					[
    						-79.3370651,
    						43.6971476
    					],
    					[
    						-79.3369315,
    						43.6973661
    					],
    					[
    						-79.3369444,
    						43.6973953
    					],
    					[
    						-79.3369129,
    						43.6974502
    					],
    					[
    						-79.3370601,
    						43.6975041
    					],
    					[
    						-79.3370679,
    						43.6974862
    					],
    					[
    						-79.3371193,
    						43.6974973
    					],
    					[
    						-79.3371277,
    						43.6974726
    					],
    					[
    						-79.337334,
    						43.6973227
    					],
    					[
    						-79.3375627,
    						43.6971773
    					],
    					[
    						-79.3378732,
    						43.6970992
    					],
    					[
    						-79.3385419,
    						43.6969591
    					]
    				]
    			]
    		},
    		id: "way/24488503"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24488511",
    			leisure: "park",
    			name: "Dieppe Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3369009,
    						43.6921163
    					],
    					[
    						-79.3367821,
    						43.691873
    					],
    					[
    						-79.3366949,
    						43.6916943
    					],
    					[
    						-79.3358413,
    						43.6909783
    					],
    					[
    						-79.3356814,
    						43.6906206
    					],
    					[
    						-79.3341286,
    						43.6909433
    					],
    					[
    						-79.3348839,
    						43.6925631
    					],
    					[
    						-79.3369009,
    						43.6921163
    					]
    				]
    			]
    		},
    		id: "way/24488511"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24529300",
    			"addr:city": "Toronto",
    			"addr:housenumber": "420",
    			"addr:street": "King Street East",
    			leisure: "park",
    			name: "Sackville Playground",
    			"opendata:type": "106001"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3614496,
    						43.654732
    					],
    					[
    						-79.3613515,
    						43.6546409
    					],
    					[
    						-79.3608666,
    						43.6542158
    					],
    					[
    						-79.3596724,
    						43.6549207
    					],
    					[
    						-79.3599632,
    						43.6549528
    					],
    					[
    						-79.3603281,
    						43.6549508
    					],
    					[
    						-79.3606218,
    						43.6549233
    					],
    					[
    						-79.3609174,
    						43.6548794
    					],
    					[
    						-79.3612552,
    						43.6547982
    					],
    					[
    						-79.3614496,
    						43.654732
    					]
    				]
    			]
    		},
    		id: "way/24529300"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24529303",
    			created_by: "Potlatch 0.9a",
    			leisure: "park",
    			name: "Thompson Street Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3510468,
    						43.6591193
    					],
    					[
    						-79.3501327,
    						43.6593225
    					],
    					[
    						-79.3502149,
    						43.6595055
    					],
    					[
    						-79.3511304,
    						43.6593009
    					],
    					[
    						-79.3510468,
    						43.6591193
    					]
    				]
    			]
    		},
    		id: "way/24529303"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24589839",
    			leisure: "park",
    			name: "Canada Square"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3820819,
    						43.6394525
    					],
    					[
    						-79.3819608,
    						43.6391384
    					],
    					[
    						-79.3819466,
    						43.639099
    					],
    					[
    						-79.3819063,
    						43.6389968
    					],
    					[
    						-79.3818727,
    						43.6389098
    					],
    					[
    						-79.3815626,
    						43.63799
    					],
    					[
    						-79.380981,
    						43.6380415
    					],
    					[
    						-79.3815791,
    						43.6395544
    					],
    					[
    						-79.3820819,
    						43.6394525
    					]
    				]
    			]
    		},
    		id: "way/24589839"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24589969",
    			"addr:city": "Toronto",
    			"addr:housenumber": "238",
    			"addr:street": "Queens Quay West",
    			leisure: "park",
    			name: "Rees Street Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3850109,
    						43.6397501
    					],
    					[
    						-79.3849196,
    						43.639489
    					],
    					[
    						-79.3847939,
    						43.6395121
    					],
    					[
    						-79.3847192,
    						43.6392985
    					],
    					[
    						-79.3843716,
    						43.6393622
    					],
    					[
    						-79.3845377,
    						43.6398368
    					],
    					[
    						-79.3850109,
    						43.6397501
    					]
    				]
    			]
    		},
    		id: "way/24589969"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24590127",
    			"addr:city": "Toronto",
    			"addr:housenumber": "339",
    			"addr:street": "Queens Quay West",
    			leisure: "park",
    			name: "HTO Park",
    			note: "letter T lowered (like E in TeX) can't display this here"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3891982,
    						43.638137
    					],
    					[
    						-79.3890623,
    						43.6378218
    					],
    					[
    						-79.3884423,
    						43.6379534
    					],
    					[
    						-79.3882228,
    						43.6375051
    					],
    					[
    						-79.3887206,
    						43.637387
    					],
    					[
    						-79.3886473,
    						43.6371968
    					],
    					[
    						-79.3871395,
    						43.6373513
    					],
    					[
    						-79.3875979,
    						43.6384689
    					],
    					[
    						-79.3876102,
    						43.6384977
    					],
    					[
    						-79.3891982,
    						43.638137
    					]
    				]
    			]
    		},
    		id: "way/24590127"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24590130",
    			"addr:city": "Toronto",
    			"addr:housenumber": "375",
    			"addr:street": "Queens Quay West",
    			leisure: "park",
    			name: "HTO Park West",
    			note: "letter T lowered (like E in TeX) can't display this here"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3898953,
    						43.63793
    					],
    					[
    						-79.3899129,
    						43.6379561
    					],
    					[
    						-79.3905549,
    						43.6378286
    					],
    					[
    						-79.3904859,
    						43.6376671
    					],
    					[
    						-79.390436,
    						43.6376727
    					],
    					[
    						-79.39041,
    						43.6376012
    					],
    					[
    						-79.3906535,
    						43.637555
    					],
    					[
    						-79.3905513,
    						43.6371792
    					],
    					[
    						-79.39051,
    						43.6370644
    					],
    					[
    						-79.3895735,
    						43.6371447
    					],
    					[
    						-79.3898953,
    						43.63793
    					]
    				]
    			]
    		},
    		id: "way/24590130"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24590240",
    			"addr:city": "Toronto",
    			"addr:housenumber": "475",
    			"addr:street": "Queens Quay West",
    			leisure: "park",
    			name: "Toronto Music Garden"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3959906,
    						43.6367611
    					],
    					[
    						-79.3958676,
    						43.6366089
    					],
    					[
    						-79.3927389,
    						43.6369075
    					],
    					[
    						-79.3927833,
    						43.6370919
    					],
    					[
    						-79.3928457,
    						43.6373127
    					],
    					[
    						-79.3941352,
    						43.6371961
    					],
    					[
    						-79.3947023,
    						43.63712
    					],
    					[
    						-79.3952478,
    						43.6370046
    					],
    					[
    						-79.3959906,
    						43.6367611
    					]
    				]
    			]
    		},
    		id: "way/24590240"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24590258",
    			leisure: "park",
    			name: "Waterfront Children's Garden"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3924979,
    						43.6369285
    					],
    					[
    						-79.392495,
    						43.6370545
    					],
    					[
    						-79.392499,
    						43.6371253
    					],
    					[
    						-79.3925185,
    						43.6371952
    					],
    					[
    						-79.3925393,
    						43.6372428
    					],
    					[
    						-79.3925647,
    						43.6372816
    					],
    					[
    						-79.3926376,
    						43.637358
    					],
    					[
    						-79.3928457,
    						43.6373127
    					],
    					[
    						-79.3927833,
    						43.6370919
    					],
    					[
    						-79.3927389,
    						43.6369075
    					],
    					[
    						-79.3924979,
    						43.6369285
    					]
    				]
    			]
    		},
    		id: "way/24590258"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24657047",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4884497,
    						43.6821759
    					],
    					[
    						-79.487841,
    						43.6807253
    					],
    					[
    						-79.4877286,
    						43.6804573
    					],
    					[
    						-79.4856268,
    						43.6809322
    					],
    					[
    						-79.4863856,
    						43.6827446
    					],
    					[
    						-79.4867787,
    						43.6826521
    					],
    					[
    						-79.4868478,
    						43.6827621
    					],
    					[
    						-79.4874025,
    						43.6826361
    					],
    					[
    						-79.4872627,
    						43.6823346
    					],
    					[
    						-79.4878774,
    						43.6822058
    					],
    					[
    						-79.4879363,
    						43.6822946
    					],
    					[
    						-79.4884497,
    						43.6821759
    					]
    				]
    			]
    		},
    		id: "way/24657047"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24657061",
    			leisure: "park",
    			name: "Eglinton Flats"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4975562,
    						43.6812084
    					],
    					[
    						-79.4970973,
    						43.6811999
    					],
    					[
    						-79.4968867,
    						43.681196
    					],
    					[
    						-79.4964233,
    						43.681227
    					],
    					[
    						-79.4959254,
    						43.6813139
    					],
    					[
    						-79.4955993,
    						43.6814381
    					],
    					[
    						-79.4951615,
    						43.6816429
    					],
    					[
    						-79.4950843,
    						43.681854
    					],
    					[
    						-79.4942947,
    						43.6826857
    					],
    					[
    						-79.4930244,
    						43.6830333
    					],
    					[
    						-79.4919515,
    						43.6835299
    					],
    					[
    						-79.4917112,
    						43.6837347
    					],
    					[
    						-79.4915209,
    						43.6839401
    					],
    					[
    						-79.4911361,
    						43.6844423
    					],
    					[
    						-79.4910245,
    						43.6845354
    					],
    					[
    						-79.4909666,
    						43.6845474
    					],
    					[
    						-79.4912386,
    						43.685134
    					],
    					[
    						-79.4915309,
    						43.685063
    					],
    					[
    						-79.4918742,
    						43.6853609
    					],
    					[
    						-79.4921317,
    						43.6854593
    					],
    					[
    						-79.4928785,
    						43.6856092
    					],
    					[
    						-79.4936573,
    						43.685643
    					],
    					[
    						-79.493792,
    						43.6858435
    					],
    					[
    						-79.4977365,
    						43.6845354
    					],
    					[
    						-79.4985776,
    						43.6843492
    					],
    					[
    						-79.4975562,
    						43.6812084
    					]
    				]
    			]
    		},
    		id: "way/24657061"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24678018",
    			created_by: "Potlatch 0.9c",
    			leisure: "park",
    			name: "Stan Wadlow Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3148558,
    						43.6971188
    					],
    					[
    						-79.3146412,
    						43.6971374
    					],
    					[
    						-79.3126585,
    						43.6970629
    					],
    					[
    						-79.3127314,
    						43.6972154
    					],
    					[
    						-79.3124362,
    						43.6973011
    					],
    					[
    						-79.3113986,
    						43.6975832
    					],
    					[
    						-79.3116371,
    						43.6979813
    					],
    					[
    						-79.3120577,
    						43.6984467
    					],
    					[
    						-79.3123016,
    						43.6990648
    					],
    					[
    						-79.3124697,
    						43.6995016
    					],
    					[
    						-79.3127594,
    						43.6996669
    					],
    					[
    						-79.3132164,
    						43.6996878
    					],
    					[
    						-79.3143322,
    						43.6998678
    					],
    					[
    						-79.315448,
    						43.6999546
    					],
    					[
    						-79.3156034,
    						43.6999522
    					],
    					[
    						-79.315963,
    						43.6999422
    					],
    					[
    						-79.3158171,
    						43.6991231
    					],
    					[
    						-79.3164896,
    						43.6989926
    					],
    					[
    						-79.3160317,
    						43.697972
    					],
    					[
    						-79.3155607,
    						43.6969148
    					],
    					[
    						-79.3148558,
    						43.6971188
    					]
    				]
    			]
    		},
    		id: "way/24678018"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/24985315",
    			"addr:city": "Toronto",
    			"addr:housenumber": "80",
    			"addr:street": "Oakcrest Avenue",
    			leisure: "park",
    			name: "Oakcrest Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3118754,
    						43.683887
    					],
    					[
    						-79.3114434,
    						43.6828655
    					],
    					[
    						-79.3109949,
    						43.6832997
    					],
    					[
    						-79.3110055,
    						43.6833175
    					],
    					[
    						-79.3110077,
    						43.6833471
    					],
    					[
    						-79.3111567,
    						43.6837102
    					],
    					[
    						-79.3111628,
    						43.6837325
    					],
    					[
    						-79.3112467,
    						43.6840382
    					],
    					[
    						-79.3113657,
    						43.6840122
    					],
    					[
    						-79.3113832,
    						43.6840081
    					],
    					[
    						-79.3114258,
    						43.6839974
    					],
    					[
    						-79.3116103,
    						43.6839516
    					],
    					[
    						-79.3118754,
    						43.683887
    					]
    				]
    			]
    		},
    		id: "way/24985315"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25095658",
    			"addr:housenumber": "235",
    			"addr:street": "McCaul Street",
    			leisure: "park",
    			name: "McCaul-Orde Park",
    			operator: "City of Toronto"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3928783,
    						43.6579941
    					],
    					[
    						-79.3926933,
    						43.6575578
    					],
    					[
    						-79.392338,
    						43.6576413
    					],
    					[
    						-79.3923619,
    						43.6577053
    					],
    					[
    						-79.3923425,
    						43.6577275
    					],
    					[
    						-79.3923095,
    						43.6577367
    					],
    					[
    						-79.3923674,
    						43.6579018
    					],
    					[
    						-79.3924393,
    						43.6578914
    					],
    					[
    						-79.3924849,
    						43.6580127
    					],
    					[
    						-79.3924353,
    						43.6580234
    					],
    					[
    						-79.3924675,
    						43.6581068
    					],
    					[
    						-79.3925071,
    						43.6580985
    					],
    					[
    						-79.392839,
    						43.6580273
    					],
    					[
    						-79.3928692,
    						43.6580137
    					],
    					[
    						-79.3928783,
    						43.6579941
    					]
    				]
    			]
    		},
    		id: "way/25095658"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25401254",
    			leisure: "park",
    			name: "R. V. Burgess Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3446142,
    						43.7037791
    					],
    					[
    						-79.3435181,
    						43.7031532
    					],
    					[
    						-79.3430801,
    						43.7035432
    					],
    					[
    						-79.3430125,
    						43.7035115
    					],
    					[
    						-79.3426057,
    						43.7038908
    					],
    					[
    						-79.3435842,
    						43.7044617
    					],
    					[
    						-79.3445784,
    						43.7038098
    					],
    					[
    						-79.3446142,
    						43.7037791
    					]
    				]
    			]
    		},
    		id: "way/25401254"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25420408",
    			"addr:city": "Toronto",
    			"addr:housenumber": "1",
    			"addr:street": "East Lynn Avenue",
    			fixme: "boundaries are approximate",
    			leisure: "park",
    			name: "Merrill Bridge Road Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3142778,
    						43.6819933
    					],
    					[
    						-79.3144025,
    						43.6819436
    					],
    					[
    						-79.3148462,
    						43.6817862
    					],
    					[
    						-79.3147209,
    						43.6814506
    					],
    					[
    						-79.3146844,
    						43.6813473
    					],
    					[
    						-79.3147216,
    						43.6812371
    					],
    					[
    						-79.31461,
    						43.6810749
    					],
    					[
    						-79.313193,
    						43.6816362
    					],
    					[
    						-79.3134155,
    						43.6819397
    					],
    					[
    						-79.3139828,
    						43.6817162
    					],
    					[
    						-79.3140396,
    						43.6817951
    					],
    					[
    						-79.3140635,
    						43.6818146
    					],
    					[
    						-79.3142778,
    						43.6819933
    					]
    				]
    			]
    		},
    		id: "way/25420408"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25480300",
    			leisure: "park",
    			name: "Taylor Creek Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3283019,
    						43.70221
    					],
    					[
    						-79.3296242,
    						43.7023545
    					],
    					[
    						-79.3307658,
    						43.7027392
    					],
    					[
    						-79.331255,
    						43.7032356
    					],
    					[
    						-79.3323788,
    						43.7027392
    					],
    					[
    						-79.3329168,
    						43.7021558
    					],
    					[
    						-79.3338543,
    						43.7014958
    					],
    					[
    						-79.3347917,
    						43.7010656
    					],
    					[
    						-79.3352828,
    						43.7008849
    					],
    					[
    						-79.3353197,
    						43.7008225
    					],
    					[
    						-79.3353371,
    						43.7007575
    					],
    					[
    						-79.3353667,
    						43.7006266
    					],
    					[
    						-79.3353841,
    						43.7004211
    					],
    					[
    						-79.3353877,
    						43.7002137
    					],
    					[
    						-79.3354082,
    						43.7001011
    					],
    					[
    						-79.3354431,
    						43.6999945
    					],
    					[
    						-79.3354793,
    						43.6999237
    					],
    					[
    						-79.335537,
    						43.6998607
    					],
    					[
    						-79.3355893,
    						43.6998064
    					],
    					[
    						-79.3356627,
    						43.6997519
    					],
    					[
    						-79.3357395,
    						43.6997065
    					],
    					[
    						-79.3358293,
    						43.6996716
    					],
    					[
    						-79.335954,
    						43.6996367
    					],
    					[
    						-79.3362182,
    						43.6996018
    					],
    					[
    						-79.33712,
    						43.699502
    					],
    					[
    						-79.3373126,
    						43.6994476
    					],
    					[
    						-79.3374547,
    						43.6993701
    					],
    					[
    						-79.3375446,
    						43.6992886
    					],
    					[
    						-79.3376725,
    						43.6990356
    					],
    					[
    						-79.337406,
    						43.6982706
    					],
    					[
    						-79.33722,
    						43.6983306
    					],
    					[
    						-79.3370417,
    						43.698351
    					],
    					[
    						-79.3368888,
    						43.6983268
    					],
    					[
    						-79.3365656,
    						43.698191
    					],
    					[
    						-79.3361418,
    						43.6981028
    					],
    					[
    						-79.3357967,
    						43.697968
    					],
    					[
    						-79.3352379,
    						43.6979525
    					],
    					[
    						-79.3346719,
    						43.6978468
    					],
    					[
    						-79.334166,
    						43.6977794
    					],
    					[
    						-79.3318649,
    						43.6981214
    					],
    					[
    						-79.3315365,
    						43.6978184
    					],
    					[
    						-79.3311569,
    						43.6977237
    					],
    					[
    						-79.3306446,
    						43.698096
    					],
    					[
    						-79.3307626,
    						43.6982027
    					],
    					[
    						-79.331082,
    						43.6985767
    					],
    					[
    						-79.3311091,
    						43.6991526
    					],
    					[
    						-79.3308002,
    						43.699434
    					],
    					[
    						-79.3305749,
    						43.6997327
    					],
    					[
    						-79.3305908,
    						43.7000217
    					],
    					[
    						-79.3304756,
    						43.7002446
    					],
    					[
    						-79.3302745,
    						43.7004075
    					],
    					[
    						-79.3302852,
    						43.700487
    					],
    					[
    						-79.3301189,
    						43.7005781
    					],
    					[
    						-79.3299526,
    						43.700551
    					],
    					[
    						-79.3297291,
    						43.7006903
    					],
    					[
    						-79.3290921,
    						43.7006257
    					],
    					[
    						-79.3288462,
    						43.7007187
    					],
    					[
    						-79.3286128,
    						43.7006911
    					],
    					[
    						-79.3285692,
    						43.7007124
    					],
    					[
    						-79.3283607,
    						43.7007226
    					],
    					[
    						-79.328303,
    						43.7006916
    					],
    					[
    						-79.328232,
    						43.7006179
    					],
    					[
    						-79.3281743,
    						43.7005588
    					],
    					[
    						-79.3281086,
    						43.7005151
    					],
    					[
    						-79.3280482,
    						43.7004967
    					],
    					[
    						-79.3279704,
    						43.7004841
    					],
    					[
    						-79.3279034,
    						43.7004938
    					],
    					[
    						-79.3278441,
    						43.7005161
    					],
    					[
    						-79.3278149,
    						43.7005878
    					],
    					[
    						-79.3278162,
    						43.7006586
    					],
    					[
    						-79.327772,
    						43.7007924
    					],
    					[
    						-79.3277089,
    						43.7008302
    					],
    					[
    						-79.3276238,
    						43.7008101
    					],
    					[
    						-79.327341,
    						43.7007983
    					],
    					[
    						-79.3265462,
    						43.7007779
    					],
    					[
    						-79.3265408,
    						43.7006014
    					],
    					[
    						-79.3241778,
    						43.7003668
    					],
    					[
    						-79.3239203,
    						43.700804
    					],
    					[
    						-79.3227446,
    						43.7009812
    					],
    					[
    						-79.3223995,
    						43.7009757
    					],
    					[
    						-79.3220246,
    						43.7009211
    					],
    					[
    						-79.321877,
    						43.7008455
    					],
    					[
    						-79.3217666,
    						43.700604
    					],
    					[
    						-79.3187666,
    						43.7005178
    					],
    					[
    						-79.317827,
    						43.7012311
    					],
    					[
    						-79.3176235,
    						43.7013856
    					],
    					[
    						-79.3172631,
    						43.7016592
    					],
    					[
    						-79.316759,
    						43.7020258
    					],
    					[
    						-79.3172282,
    						43.7022497
    					],
    					[
    						-79.317601,
    						43.7022186
    					],
    					[
    						-79.3179417,
    						43.7023039
    					],
    					[
    						-79.3179664,
    						43.702351
    					],
    					[
    						-79.3180074,
    						43.702429
    					],
    					[
    						-79.3183215,
    						43.7023834
    					],
    					[
    						-79.3187021,
    						43.7023282
    					],
    					[
    						-79.3190414,
    						43.7022681
    					],
    					[
    						-79.319346,
    						43.7022059
    					],
    					[
    						-79.3193619,
    						43.7021866
    					],
    					[
    						-79.3194813,
    						43.7021624
    					],
    					[
    						-79.3196529,
    						43.7022089
    					],
    					[
    						-79.3197911,
    						43.7022099
    					],
    					[
    						-79.3202564,
    						43.7023107
    					],
    					[
    						-79.3203275,
    						43.7024019
    					],
    					[
    						-79.3202846,
    						43.7024678
    					],
    					[
    						-79.3200848,
    						43.7024959
    					],
    					[
    						-79.3196797,
    						43.7024668
    					],
    					[
    						-79.319285,
    						43.7025709
    					],
    					[
    						-79.3186757,
    						43.7028391
    					],
    					[
    						-79.318293,
    						43.7027654
    					],
    					[
    						-79.3180141,
    						43.7028605
    					],
    					[
    						-79.3180677,
    						43.7031164
    					],
    					[
    						-79.3176811,
    						43.7032188
    					],
    					[
    						-79.3168652,
    						43.7035259
    					],
    					[
    						-79.3160159,
    						43.7035663
    					],
    					[
    						-79.3154235,
    						43.7034774
    					],
    					[
    						-79.3151241,
    						43.7034253
    					],
    					[
    						-79.3147673,
    						43.7033632
    					],
    					[
    						-79.3142165,
    						43.7032673
    					],
    					[
    						-79.3140985,
    						43.7034334
    					],
    					[
    						-79.3139331,
    						43.7035352
    					],
    					[
    						-79.3137512,
    						43.7035969
    					],
    					[
    						-79.3131714,
    						43.7036225
    					],
    					[
    						-79.3125625,
    						43.703744
    					],
    					[
    						-79.3119478,
    						43.7043499
    					],
    					[
    						-79.3117913,
    						43.7046327
    					],
    					[
    						-79.3124619,
    						43.7048105
    					],
    					[
    						-79.3133336,
    						43.7041157
    					],
    					[
    						-79.3138477,
    						43.7039217
    					],
    					[
    						-79.3140579,
    						43.7039242
    					],
    					[
    						-79.3145295,
    						43.7039298
    					],
    					[
    						-79.31501,
    						43.7040672
    					],
    					[
    						-79.3148591,
    						43.7043823
    					],
    					[
    						-79.3145686,
    						43.7048428
    					],
    					[
    						-79.3136521,
    						43.7060143
    					],
    					[
    						-79.3119981,
    						43.7077391
    					],
    					[
    						-79.3127245,
    						43.7079895
    					],
    					[
    						-79.3145797,
    						43.706091
    					],
    					[
    						-79.3149322,
    						43.7054542
    					],
    					[
    						-79.3154016,
    						43.7048732
    					],
    					[
    						-79.3154955,
    						43.7047336
    					],
    					[
    						-79.3156001,
    						43.7044989
    					],
    					[
    						-79.3157769,
    						43.7043182
    					],
    					[
    						-79.3164294,
    						43.7042732
    					],
    					[
    						-79.3171808,
    						43.704175
    					],
    					[
    						-79.3187651,
    						43.7037884
    					],
    					[
    						-79.3194291,
    						43.7036498
    					],
    					[
    						-79.3195644,
    						43.703479
    					],
    					[
    						-79.3199426,
    						43.7034073
    					],
    					[
    						-79.3204392,
    						43.7038766
    					],
    					[
    						-79.3208411,
    						43.7040006
    					],
    					[
    						-79.3215497,
    						43.7037777
    					],
    					[
    						-79.3222385,
    						43.7036021
    					],
    					[
    						-79.3232121,
    						43.7033935
    					],
    					[
    						-79.3237004,
    						43.7032095
    					],
    					[
    						-79.3248043,
    						43.7029165
    					],
    					[
    						-79.3249156,
    						43.7027987
    					],
    					[
    						-79.3250924,
    						43.7027509
    					],
    					[
    						-79.325067,
    						43.7026239
    					],
    					[
    						-79.3251394,
    						43.7026113
    					],
    					[
    						-79.3255219,
    						43.70261
    					],
    					[
    						-79.3256973,
    						43.70262
    					],
    					[
    						-79.3257482,
    						43.7026355
    					],
    					[
    						-79.3258341,
    						43.7025614
    					],
    					[
    						-79.3259367,
    						43.7024991
    					],
    					[
    						-79.3260956,
    						43.7024261
    					],
    					[
    						-79.3263142,
    						43.7023592
    					],
    					[
    						-79.3265629,
    						43.7023268
    					],
    					[
    						-79.3265998,
    						43.7023233
    					],
    					[
    						-79.326624,
    						43.7023141
    					],
    					[
    						-79.3266441,
    						43.7022991
    					],
    					[
    						-79.3266816,
    						43.7022855
    					],
    					[
    						-79.32674,
    						43.7022724
    					],
    					[
    						-79.3268003,
    						43.7022739
    					],
    					[
    						-79.3268479,
    						43.7022816
    					],
    					[
    						-79.3268962,
    						43.7022981
    					],
    					[
    						-79.3269566,
    						43.7023107
    					],
    					[
    						-79.3283019,
    						43.70221
    					]
    				]
    			]
    		},
    		id: "way/25480300"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25480304",
    			leisure: "park",
    			name: "Taylor Creek Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3160594,
    						43.7021705
    					],
    					[
    						-79.3183419,
    						43.7005027
    					],
    					[
    						-79.3174531,
    						43.7003466
    					],
    					[
    						-79.3168991,
    						43.7002493
    					],
    					[
    						-79.3168763,
    						43.6999404
    					],
    					[
    						-79.315963,
    						43.6999422
    					],
    					[
    						-79.3156034,
    						43.6999522
    					],
    					[
    						-79.315448,
    						43.6999546
    					],
    					[
    						-79.3143322,
    						43.6998678
    					],
    					[
    						-79.3132164,
    						43.6996878
    					],
    					[
    						-79.3127594,
    						43.6996669
    					],
    					[
    						-79.3124697,
    						43.6995016
    					],
    					[
    						-79.3123016,
    						43.6990648
    					],
    					[
    						-79.3120797,
    						43.6990013
    					],
    					[
    						-79.3106127,
    						43.6985811
    					],
    					[
    						-79.309646,
    						43.6983043
    					],
    					[
    						-79.3082564,
    						43.6979112
    					],
    					[
    						-79.3070587,
    						43.6975609
    					],
    					[
    						-79.3069056,
    						43.697521
    					],
    					[
    						-79.3064977,
    						43.6974146
    					],
    					[
    						-79.3059646,
    						43.6972173
    					],
    					[
    						-79.3040545,
    						43.6965104
    					],
    					[
    						-79.3035287,
    						43.6963623
    					],
    					[
    						-79.3012628,
    						43.695724
    					],
    					[
    						-79.3009045,
    						43.695623
    					],
    					[
    						-79.3000462,
    						43.6954244
    					],
    					[
    						-79.2998316,
    						43.6957595
    					],
    					[
    						-79.2992308,
    						43.6956354
    					],
    					[
    						-79.2991106,
    						43.6958961
    					],
    					[
    						-79.2987072,
    						43.6958588
    					],
    					[
    						-79.2986899,
    						43.6961457
    					],
    					[
    						-79.2985431,
    						43.6962334
    					],
    					[
    						-79.2975313,
    						43.6958898
    					],
    					[
    						-79.2974798,
    						43.6964422
    					],
    					[
    						-79.2972481,
    						43.6972179
    					],
    					[
    						-79.2971966,
    						43.697584
    					],
    					[
    						-79.3009989,
    						43.6977515
    					],
    					[
    						-79.3019104,
    						43.6978361
    					],
    					[
    						-79.3020889,
    						43.6980556
    					],
    					[
    						-79.3020793,
    						43.6984232
    					],
    					[
    						-79.3020755,
    						43.6985309
    					],
    					[
    						-79.3026097,
    						43.6987416
    					],
    					[
    						-79.3033773,
    						43.6990277
    					],
    					[
    						-79.3040331,
    						43.6996945
    					],
    					[
    						-79.3053402,
    						43.6998427
    					],
    					[
    						-79.3069705,
    						43.6998427
    					],
    					[
    						-79.3080954,
    						43.6996482
    					],
    					[
    						-79.3092121,
    						43.6995539
    					],
    					[
    						-79.3098806,
    						43.699607
    					],
    					[
    						-79.3103941,
    						43.6999606
    					],
    					[
    						-79.3107202,
    						43.700432
    					],
    					[
    						-79.3110096,
    						43.7008151
    					],
    					[
    						-79.3114824,
    						43.7011039
    					],
    					[
    						-79.3116169,
    						43.7013278
    					],
    					[
    						-79.3115598,
    						43.7014928
    					],
    					[
    						-79.3112582,
    						43.7017285
    					],
    					[
    						-79.3102148,
    						43.7021234
    					],
    					[
    						-79.3080791,
    						43.7026243
    					],
    					[
    						-79.3055277,
    						43.7028954
    					],
    					[
    						-79.3058456,
    						43.7038559
    					],
    					[
    						-79.3066397,
    						43.7036687
    					],
    					[
    						-79.307321,
    						43.7035082
    					],
    					[
    						-79.3090654,
    						43.7030604
    					],
    					[
    						-79.3107691,
    						43.7025948
    					],
    					[
    						-79.3120733,
    						43.7021057
    					],
    					[
    						-79.312432,
    						43.7019731
    					],
    					[
    						-79.3130923,
    						43.7018847
    					],
    					[
    						-79.3143721,
    						43.7019201
    					],
    					[
    						-79.3160594,
    						43.7021705
    					]
    				]
    			]
    		},
    		id: "way/25480304"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25480328",
    			leisure: "park",
    			name: "Lower Don Parklands"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3379379,
    						43.7011793
    					],
    					[
    						-79.3388181,
    						43.7017247
    					],
    					[
    						-79.3398124,
    						43.700997
    					],
    					[
    						-79.3410758,
    						43.7000324
    					],
    					[
    						-79.3417167,
    						43.6996608
    					],
    					[
    						-79.3424718,
    						43.6994039
    					],
    					[
    						-79.343227,
    						43.6992525
    					],
    					[
    						-79.3438869,
    						43.6991378
    					],
    					[
    						-79.3445849,
    						43.6990965
    					],
    					[
    						-79.3454099,
    						43.6991837
    					],
    					[
    						-79.3463046,
    						43.6994222
    					],
    					[
    						-79.347396,
    						43.6998305
    					],
    					[
    						-79.3479671,
    						43.7000003
    					],
    					[
    						-79.3486842,
    						43.7001242
    					],
    					[
    						-79.3494774,
    						43.7001287
    					],
    					[
    						-79.3500676,
    						43.7000507
    					],
    					[
    						-79.3504765,
    						43.7000083
    					],
    					[
    						-79.3502731,
    						43.6996
    					],
    					[
    						-79.3496329,
    						43.6982156
    					],
    					[
    						-79.3485668,
    						43.6982202
    					],
    					[
    						-79.3476594,
    						43.6981422
    					],
    					[
    						-79.3466441,
    						43.6979817
    					],
    					[
    						-79.3451878,
    						43.6977408
    					],
    					[
    						-79.3439567,
    						43.6976169
    					],
    					[
    						-79.3431064,
    						43.6976261
    					],
    					[
    						-79.3422497,
    						43.6977913
    					],
    					[
    						-79.3415073,
    						43.6980161
    					],
    					[
    						-79.340124,
    						43.6987134
    					],
    					[
    						-79.3394577,
    						43.6992318
    					],
    					[
    						-79.3394323,
    						43.6994796
    					],
    					[
    						-79.3394767,
    						43.6997778
    					],
    					[
    						-79.3395211,
    						43.7000668
    					],
    					[
    						-79.3394966,
    						43.700205
    					],
    					[
    						-79.3393815,
    						43.7003329
    					],
    					[
    						-79.3388992,
    						43.7005944
    					],
    					[
    						-79.3379379,
    						43.7011793
    					]
    				]
    			]
    		},
    		id: "way/25480328"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25480377",
    			leisure: "park",
    			name: "Cullen Bryant Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3290386,
    						43.6999222
    					],
    					[
    						-79.3288757,
    						43.6999053
    					],
    					[
    						-79.3287346,
    						43.6998628
    					],
    					[
    						-79.3284553,
    						43.6997776
    					],
    					[
    						-79.3283139,
    						43.6998117
    					],
    					[
    						-79.3281086,
    						43.6998457
    					],
    					[
    						-79.3278393,
    						43.6998311
    					],
    					[
    						-79.3273899,
    						43.6997874
    					],
    					[
    						-79.3273296,
    						43.7001759
    					],
    					[
    						-79.327341,
    						43.7007983
    					],
    					[
    						-79.3276238,
    						43.7008101
    					],
    					[
    						-79.3277089,
    						43.7008302
    					],
    					[
    						-79.327772,
    						43.7007924
    					],
    					[
    						-79.3278162,
    						43.7006586
    					],
    					[
    						-79.3278149,
    						43.7005878
    					],
    					[
    						-79.3278441,
    						43.7005161
    					],
    					[
    						-79.3279034,
    						43.7004938
    					],
    					[
    						-79.3279704,
    						43.7004841
    					],
    					[
    						-79.3280482,
    						43.7004967
    					],
    					[
    						-79.3281086,
    						43.7005151
    					],
    					[
    						-79.3281743,
    						43.7005588
    					],
    					[
    						-79.328232,
    						43.7006179
    					],
    					[
    						-79.328303,
    						43.7006916
    					],
    					[
    						-79.3283607,
    						43.7007226
    					],
    					[
    						-79.3285692,
    						43.7007124
    					],
    					[
    						-79.3286128,
    						43.7006911
    					],
    					[
    						-79.3288462,
    						43.7007187
    					],
    					[
    						-79.3290921,
    						43.7006257
    					],
    					[
    						-79.3290386,
    						43.6999222
    					]
    				]
    			]
    		},
    		id: "way/25480377"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25519266",
    			leisure: "park",
    			name: "Wanless Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3936153,
    						43.7292512
    					],
    					[
    						-79.3934467,
    						43.7286967
    					],
    					[
    						-79.3934056,
    						43.7283753
    					],
    					[
    						-79.3933949,
    						43.7283434
    					],
    					[
    						-79.3933694,
    						43.7283163
    					],
    					[
    						-79.3933379,
    						43.7282945
    					],
    					[
    						-79.3932856,
    						43.72828
    					],
    					[
    						-79.39312,
    						43.7282465
    					],
    					[
    						-79.3929657,
    						43.728201
    					],
    					[
    						-79.3927842,
    						43.7281328
    					],
    					[
    						-79.3926345,
    						43.7280605
    					],
    					[
    						-79.3924534,
    						43.7279519
    					],
    					[
    						-79.3923133,
    						43.7278401
    					],
    					[
    						-79.3922878,
    						43.727823
    					],
    					[
    						-79.3922516,
    						43.7278056
    					],
    					[
    						-79.3922187,
    						43.7278027
    					],
    					[
    						-79.3921583,
    						43.7278064
    					],
    					[
    						-79.3921215,
    						43.7278216
    					],
    					[
    						-79.392092,
    						43.7278376
    					],
    					[
    						-79.3920705,
    						43.7278642
    					],
    					[
    						-79.3920243,
    						43.7279602
    					],
    					[
    						-79.391968,
    						43.7280527
    					],
    					[
    						-79.3918926,
    						43.7281443
    					],
    					[
    						-79.391809,
    						43.7282252
    					],
    					[
    						-79.3916997,
    						43.7283057
    					],
    					[
    						-79.3916013,
    						43.7283628
    					],
    					[
    						-79.3915012,
    						43.7284127
    					],
    					[
    						-79.3913893,
    						43.7284578
    					],
    					[
    						-79.3912613,
    						43.7284992
    					],
    					[
    						-79.3911593,
    						43.7285232
    					],
    					[
    						-79.3910567,
    						43.7285392
    					],
    					[
    						-79.3909474,
    						43.7285518
    					],
    					[
    						-79.3908377,
    						43.7285568
    					],
    					[
    						-79.3907402,
    						43.7285567
    					],
    					[
    						-79.3906396,
    						43.7285513
    					],
    					[
    						-79.3905209,
    						43.7285368
    					],
    					[
    						-79.3904874,
    						43.7285373
    					],
    					[
    						-79.3904559,
    						43.728546
    					],
    					[
    						-79.3904324,
    						43.7285612
    					],
    					[
    						-79.3904176,
    						43.7285794
    					],
    					[
    						-79.3904103,
    						43.7286041
    					],
    					[
    						-79.3904143,
    						43.7286284
    					],
    					[
    						-79.3904618,
    						43.7287487
    					],
    					[
    						-79.3906183,
    						43.7291358
    					],
    					[
    						-79.3908978,
    						43.7298315
    					],
    					[
    						-79.3909132,
    						43.7298557
    					],
    					[
    						-79.390936,
    						43.7298727
    					],
    					[
    						-79.3909735,
    						43.729878
    					],
    					[
    						-79.3910099,
    						43.7298733
    					],
    					[
    						-79.3935397,
    						43.7293392
    					],
    					[
    						-79.3935696,
    						43.7293319
    					],
    					[
    						-79.393592,
    						43.7293198
    					],
    					[
    						-79.3936078,
    						43.729305
    					],
    					[
    						-79.3936199,
    						43.7292767
    					],
    					[
    						-79.3936153,
    						43.7292512
    					]
    				]
    			]
    		},
    		id: "way/25519266"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25618357",
    			leisure: "park",
    			name: "True Davidson Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.329958,
    						43.6922325
    					],
    					[
    						-79.3300676,
    						43.6924412
    					],
    					[
    						-79.3305467,
    						43.6923377
    					],
    					[
    						-79.3305756,
    						43.6923311
    					],
    					[
    						-79.3303707,
    						43.6918243
    					],
    					[
    						-79.3303549,
    						43.6917961
    					],
    					[
    						-79.3303321,
    						43.6917763
    					],
    					[
    						-79.3302979,
    						43.6917651
    					],
    					[
    						-79.330257,
    						43.6917656
    					],
    					[
    						-79.3295356,
    						43.6919208
    					],
    					[
    						-79.3295892,
    						43.6919959
    					],
    					[
    						-79.3295986,
    						43.6920037
    					],
    					[
    						-79.3296437,
    						43.6919882
    					],
    					[
    						-79.3296787,
    						43.6919832
    					],
    					[
    						-79.3297557,
    						43.6919882
    					],
    					[
    						-79.3298337,
    						43.6920132
    					],
    					[
    						-79.3298907,
    						43.6920522
    					],
    					[
    						-79.3299147,
    						43.6920822
    					],
    					[
    						-79.3299307,
    						43.6921232
    					],
    					[
    						-79.3299367,
    						43.6921692
    					],
    					[
    						-79.3299437,
    						43.6921712
    					],
    					[
    						-79.3299527,
    						43.6921772
    					],
    					[
    						-79.3299597,
    						43.6921832
    					],
    					[
    						-79.3299647,
    						43.6921942
    					],
    					[
    						-79.3299647,
    						43.6922052
    					],
    					[
    						-79.3299627,
    						43.6922112
    					],
    					[
    						-79.3299597,
    						43.6922162
    					],
    					[
    						-79.3299527,
    						43.6922232
    					],
    					[
    						-79.329958,
    						43.6922325
    					]
    				]
    			]
    		},
    		id: "way/25618357"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25650183",
    			leisure: "park",
    			name: "Leonard Linton Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.353611,
    						43.7139566
    					],
    					[
    						-79.3548191,
    						43.7136933
    					],
    					[
    						-79.3545183,
    						43.712972
    					],
    					[
    						-79.3532921,
    						43.7132096
    					],
    					[
    						-79.353611,
    						43.7139566
    					]
    				]
    			]
    		},
    		id: "way/25650183"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25680414",
    			leisure: "park",
    			name: "Eglinton Park",
    			source: "Contains public sector Datasets made available under the City of Toronto's Open Data License v2.0.",
    			wikidata: "Q5348075",
    			wikipedia: "en:Eglinton Park (Toronto)"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4047491,
    						43.7096928
    					],
    					[
    						-79.4048889,
    						43.7096632
    					],
    					[
    						-79.4070594,
    						43.7092043
    					],
    					[
    						-79.4070452,
    						43.7091491
    					],
    					[
    						-79.4070258,
    						43.7090739
    					],
    					[
    						-79.4070056,
    						43.7089957
    					],
    					[
    						-79.4069851,
    						43.708916
    					],
    					[
    						-79.4069652,
    						43.708839
    					],
    					[
    						-79.406947,
    						43.7087708
    					],
    					[
    						-79.4069299,
    						43.7087067
    					],
    					[
    						-79.4069067,
    						43.7086172
    					],
    					[
    						-79.4068858,
    						43.7085307
    					],
    					[
    						-79.4068697,
    						43.7084654
    					],
    					[
    						-79.4068635,
    						43.7084404
    					],
    					[
    						-79.4068625,
    						43.708436
    					],
    					[
    						-79.4068576,
    						43.7084162
    					],
    					[
    						-79.4068536,
    						43.7084002
    					],
    					[
    						-79.4068376,
    						43.708335
    					],
    					[
    						-79.4068155,
    						43.708247
    					],
    					[
    						-79.4068007,
    						43.7081845
    					],
    					[
    						-79.4067965,
    						43.7081669
    					],
    					[
    						-79.4067811,
    						43.7081055
    					],
    					[
    						-79.4067626,
    						43.7080319
    					],
    					[
    						-79.4067481,
    						43.707974
    					],
    					[
    						-79.4067289,
    						43.7078971
    					],
    					[
    						-79.4067098,
    						43.7078227
    					],
    					[
    						-79.4066943,
    						43.7077623
    					],
    					[
    						-79.4066902,
    						43.7077472
    					],
    					[
    						-79.4066718,
    						43.7076782
    					],
    					[
    						-79.4066583,
    						43.7076277
    					],
    					[
    						-79.4066496,
    						43.7075946
    					],
    					[
    						-79.406632,
    						43.7075268
    					],
    					[
    						-79.4066232,
    						43.707493
    					],
    					[
    						-79.4066113,
    						43.707445
    					],
    					[
    						-79.4065897,
    						43.7073581
    					],
    					[
    						-79.4065727,
    						43.7072895
    					],
    					[
    						-79.4065562,
    						43.7072232
    					],
    					[
    						-79.4065131,
    						43.7070437
    					],
    					[
    						-79.4064935,
    						43.7069703
    					],
    					[
    						-79.4064771,
    						43.7069091
    					],
    					[
    						-79.4064703,
    						43.7068825
    					],
    					[
    						-79.4064426,
    						43.7067743
    					],
    					[
    						-79.4064222,
    						43.7066974
    					],
    					[
    						-79.406407,
    						43.7066397
    					],
    					[
    						-79.4064022,
    						43.7066199
    					],
    					[
    						-79.4063825,
    						43.706539
    					],
    					[
    						-79.4063742,
    						43.7065045
    					],
    					[
    						-79.4063591,
    						43.706447
    					],
    					[
    						-79.4063348,
    						43.7063542
    					],
    					[
    						-79.4063125,
    						43.7062692
    					],
    					[
    						-79.4063036,
    						43.7062351
    					],
    					[
    						-79.4062899,
    						43.7061809
    					],
    					[
    						-79.4062659,
    						43.7060854
    					],
    					[
    						-79.4062437,
    						43.705996
    					],
    					[
    						-79.4062361,
    						43.705965
    					],
    					[
    						-79.4062182,
    						43.7059007
    					],
    					[
    						-79.4061987,
    						43.7058308
    					],
    					[
    						-79.4061943,
    						43.7058119
    					],
    					[
    						-79.406175,
    						43.7057291
    					],
    					[
    						-79.4061672,
    						43.7056953
    					],
    					[
    						-79.4061514,
    						43.7056343
    					],
    					[
    						-79.4061323,
    						43.7055605
    					],
    					[
    						-79.4060529,
    						43.7052532
    					],
    					[
    						-79.4036942,
    						43.7057519
    					],
    					[
    						-79.4035731,
    						43.7057775
    					],
    					[
    						-79.4036568,
    						43.7061024
    					],
    					[
    						-79.4036946,
    						43.7062374
    					],
    					[
    						-79.4037296,
    						43.706373
    					],
    					[
    						-79.4037653,
    						43.7065085
    					],
    					[
    						-79.4038013,
    						43.7066439
    					],
    					[
    						-79.4038359,
    						43.7067795
    					],
    					[
    						-79.4038715,
    						43.706915
    					],
    					[
    						-79.4039053,
    						43.7070416
    					],
    					[
    						-79.403951,
    						43.7072205
    					],
    					[
    						-79.4039755,
    						43.7073115
    					],
    					[
    						-79.4039875,
    						43.7073558
    					],
    					[
    						-79.4039929,
    						43.7073759
    					],
    					[
    						-79.4040079,
    						43.7074318
    					],
    					[
    						-79.4040208,
    						43.7074802
    					],
    					[
    						-79.4040237,
    						43.707491
    					],
    					[
    						-79.404037,
    						43.7075385
    					],
    					[
    						-79.4040495,
    						43.7075833
    					],
    					[
    						-79.4040613,
    						43.7076255
    					],
    					[
    						-79.4040673,
    						43.7076508
    					],
    					[
    						-79.4040796,
    						43.7077026
    					],
    					[
    						-79.4040938,
    						43.7077621
    					],
    					[
    						-79.4041183,
    						43.7078474
    					],
    					[
    						-79.4041324,
    						43.7078966
    					],
    					[
    						-79.4041511,
    						43.7079699
    					],
    					[
    						-79.4041669,
    						43.708032
    					],
    					[
    						-79.4041792,
    						43.7080789
    					],
    					[
    						-79.4041975,
    						43.7081488
    					],
    					[
    						-79.4042166,
    						43.7082296
    					],
    					[
    						-79.4042204,
    						43.7082459
    					],
    					[
    						-79.404448,
    						43.708834
    					],
    					[
    						-79.4046047,
    						43.709342
    					],
    					[
    						-79.4046078,
    						43.7093414
    					],
    					[
    						-79.4046289,
    						43.7093939
    					],
    					[
    						-79.4046492,
    						43.7094444
    					],
    					[
    						-79.4046727,
    						43.7095028
    					],
    					[
    						-79.4046956,
    						43.7095596
    					],
    					[
    						-79.4047201,
    						43.7096206
    					],
    					[
    						-79.4047491,
    						43.7096928
    					]
    				]
    			]
    		},
    		id: "way/25680414"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25795215",
    			created_by: "Potlatch 0.10",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4014303,
    						43.725141
    					],
    					[
    						-79.4012797,
    						43.7246437
    					],
    					[
    						-79.4019235,
    						43.7245011
    					],
    					[
    						-79.4017384,
    						43.7235363
    					],
    					[
    						-79.4006961,
    						43.7237319
    					],
    					[
    						-79.4007133,
    						43.7239924
    					],
    					[
    						-79.4007047,
    						43.7241723
    					],
    					[
    						-79.400636,
    						43.7243584
    					],
    					[
    						-79.4006188,
    						43.7245197
    					],
    					[
    						-79.4006188,
    						43.7246748
    					],
    					[
    						-79.4007767,
    						43.7253049
    					],
    					[
    						-79.4014303,
    						43.725141
    					]
    				]
    			]
    		},
    		id: "way/25795215"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25795217",
    			created_by: "Potlatch 0.10",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4017175,
    						43.7233908
    					],
    					[
    						-79.4014179,
    						43.7220893
    					],
    					[
    						-79.4009123,
    						43.7221514
    					],
    					[
    						-79.4008334,
    						43.7222618
    					],
    					[
    						-79.4007819,
    						43.7224107
    					],
    					[
    						-79.4006446,
    						43.7225782
    					],
    					[
    						-79.4004901,
    						43.7226961
    					],
    					[
    						-79.4003064,
    						43.7227901
    					],
    					[
    						-79.4001258,
    						43.7228658
    					],
    					[
    						-79.400121,
    						43.7230434
    					],
    					[
    						-79.4001639,
    						43.7231178
    					],
    					[
    						-79.400327,
    						43.7232047
    					],
    					[
    						-79.4004729,
    						43.7233474
    					],
    					[
    						-79.400636,
    						43.7236079
    					],
    					[
    						-79.4017175,
    						43.7233908
    					]
    				]
    			]
    		},
    		id: "way/25795217"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25795226",
    			"addr:full": "370 Bleecker Street,589 Sherbourne Street",
    			leisure: "park",
    			name: "St. James Town West Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3757429,
    						43.6711927
    					],
    					[
    						-79.3756564,
    						43.6709207
    					],
    					[
    						-79.3761012,
    						43.6708276
    					],
    					[
    						-79.3760366,
    						43.6707003
    					],
    					[
    						-79.3757292,
    						43.6707636
    					],
    					[
    						-79.3756855,
    						43.670615
    					],
    					[
    						-79.3759762,
    						43.6705536
    					],
    					[
    						-79.375891,
    						43.6703479
    					],
    					[
    						-79.3752221,
    						43.670516
    					],
    					[
    						-79.3754739,
    						43.6711979
    					],
    					[
    						-79.3757429,
    						43.6711927
    					]
    				]
    			]
    		},
    		id: "way/25795226"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25795257",
    			"addr:city": "Toronto",
    			"addr:housenumber": "530",
    			"addr:street": "Ontario Street",
    			leisure: "park",
    			name: "Winchester Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3722906,
    						43.6658234
    					],
    					[
    						-79.372007,
    						43.6650691
    					],
    					[
    						-79.3712653,
    						43.6652106
    					],
    					[
    						-79.3717591,
    						43.6665269
    					],
    					[
    						-79.3720819,
    						43.6664648
    					],
    					[
    						-79.3718612,
    						43.665918
    					],
    					[
    						-79.3722906,
    						43.6658234
    					]
    				]
    			]
    		},
    		id: "way/25795257"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25795271",
    			"addr:city": "Toronto",
    			"addr:housenumber": "474",
    			"addr:street": "Ontario Street",
    			leisure: "park",
    			name: "Winchester Square Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3721076,
    						43.6645448
    					],
    					[
    						-79.37193,
    						43.6641121
    					],
    					[
    						-79.3712686,
    						43.664254
    					],
    					[
    						-79.3711616,
    						43.6640065
    					],
    					[
    						-79.3707869,
    						43.6640845
    					],
    					[
    						-79.3708564,
    						43.6642545
    					],
    					[
    						-79.370877,
    						43.6643071
    					],
    					[
    						-79.370917,
    						43.664393
    					],
    					[
    						-79.3712971,
    						43.6643114
    					],
    					[
    						-79.3713723,
    						43.6645106
    					],
    					[
    						-79.3717482,
    						43.6644277
    					],
    					[
    						-79.3718258,
    						43.6646062
    					],
    					[
    						-79.3721076,
    						43.6645448
    					]
    				]
    			]
    		},
    		id: "way/25795271"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25823101",
    			"addr:city": "Toronto",
    			"addr:housenumber": "115",
    			"addr:street": "King Street East",
    			leisure: "park",
    			name: "Sculpture Gardens",
    			wikidata: "Q7826503",
    			"wikipedia:en": "Toronto Sculpture Garden"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3735781,
    						43.6500314
    					],
    					[
    						-79.3738498,
    						43.6499705
    					],
    					[
    						-79.3737215,
    						43.6496864
    					],
    					[
    						-79.3735444,
    						43.6496766
    					],
    					[
    						-79.3734417,
    						43.6497042
    					],
    					[
    						-79.3735781,
    						43.6500314
    					]
    				]
    			]
    		},
    		id: "way/25823101"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25823287",
    			"addr:city": "Toronto",
    			"addr:housenumber": "10",
    			"addr:street": "Court Street",
    			leisure: "park",
    			name: "Courthouse Square"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3755941,
    						43.6503171
    					],
    					[
    						-79.375229,
    						43.6503977
    					],
    					[
    						-79.3753234,
    						43.6506216
    					],
    					[
    						-79.3756885,
    						43.6505411
    					],
    					[
    						-79.3755941,
    						43.6503171
    					]
    				]
    			]
    		},
    		id: "way/25823287"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25823474",
    			leisure: "park",
    			name: "Larry Sefton Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3839887,
    						43.654448
    					],
    					[
    						-79.3839072,
    						43.6542357
    					],
    					[
    						-79.3833274,
    						43.6543562
    					],
    					[
    						-79.3834146,
    						43.6545687
    					],
    					[
    						-79.3839887,
    						43.654448
    					]
    				]
    			]
    		},
    		id: "way/25823474"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25823747",
    			leisure: "park",
    			name: "Trinity Square",
    			wikipedia: "en:Trinity Square (Toronto)"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3821406,
    						43.6538391
    					],
    					[
    						-79.3814327,
    						43.653984
    					],
    					[
    						-79.3816175,
    						43.654448
    					],
    					[
    						-79.3811613,
    						43.6545406
    					],
    					[
    						-79.3811932,
    						43.6546273
    					],
    					[
    						-79.3813475,
    						43.6550069
    					],
    					[
    						-79.3821283,
    						43.6548203
    					],
    					[
    						-79.3821737,
    						43.6546358
    					],
    					[
    						-79.3824298,
    						43.6545785
    					],
    					[
    						-79.3830174,
    						43.6544595
    					],
    					[
    						-79.3829638,
    						43.6543159
    					],
    					[
    						-79.3823804,
    						43.654443
    					],
    					[
    						-79.3821406,
    						43.6538391
    					]
    				]
    			]
    		},
    		id: "way/25823747"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/25846412",
    			"addr:city": "Toronto",
    			"addr:housenumber": "4",
    			"addr:street": "Cambridge Avenue",
    			leisure: "park",
    			name: "Playter Gardens Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3603385,
    						43.6763936
    					],
    					[
    						-79.3609048,
    						43.6762888
    					],
    					[
    						-79.3608675,
    						43.6760824
    					],
    					[
    						-79.3611131,
    						43.6758961
    					],
    					[
    						-79.3610661,
    						43.6758856
    					],
    					[
    						-79.3608394,
    						43.675932
    					],
    					[
    						-79.3604412,
    						43.6760149
    					],
    					[
    						-79.3603385,
    						43.6763936
    					]
    				]
    			]
    		},
    		id: "way/25846412"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26139724",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4390139,
    						43.6675455
    					],
    					[
    						-79.4406802,
    						43.6672507
    					],
    					[
    						-79.4406083,
    						43.6670391
    					],
    					[
    						-79.4409073,
    						43.6669901
    					],
    					[
    						-79.440865,
    						43.6668536
    					],
    					[
    						-79.4412518,
    						43.6667597
    					],
    					[
    						-79.4419536,
    						43.6666076
    					],
    					[
    						-79.4422661,
    						43.6665154
    					],
    					[
    						-79.4434599,
    						43.6662867
    					],
    					[
    						-79.4429929,
    						43.6659184
    					],
    					[
    						-79.4384241,
    						43.6668508
    					],
    					[
    						-79.4390139,
    						43.6675455
    					]
    				]
    			]
    		},
    		id: "way/26139724"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26140089",
    			"addr:housenumber": "160",
    			"addr:street": "Perth Avenue",
    			leisure: "park",
    			name: "Perth Avenue Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.4502583,
    						43.6587997
    					],
    					[
    						-79.4501892,
    						43.6586396
    					],
    					[
    						-79.4497372,
    						43.658737
    					],
    					[
    						-79.4497119,
    						43.6587564
    					],
    					[
    						-79.4497065,
    						43.6587634
    					],
    					[
    						-79.4497022,
    						43.6587712
    					],
    					[
    						-79.4496998,
    						43.6587845
    					],
    					[
    						-79.4497008,
    						43.6587994
    					],
    					[
    						-79.449744,
    						43.6589065
    					],
    					[
    						-79.4502583,
    						43.6587997
    					]
    				]
    			]
    		},
    		id: "way/26140089"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26696956",
    			leisure: "park",
    			name: "Sumach-Shuter Parkette"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3583603,
    						43.6588207
    					],
    					[
    						-79.3594056,
    						43.6582381
    					],
    					[
    						-79.3592966,
    						43.657979
    					],
    					[
    						-79.3581772,
    						43.6582315
    					],
    					[
    						-79.3583603,
    						43.6588207
    					]
    				]
    			]
    		},
    		id: "way/26696956"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26829706",
    			created_by: "Potlatch 0.10d",
    			leisure: "park",
    			name: "James Canning Gardens"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3842099,
    						43.6667414
    					],
    					[
    						-79.3844741,
    						43.6666819
    					],
    					[
    						-79.3841958,
    						43.6660349
    					],
    					[
    						-79.3839316,
    						43.6660944
    					],
    					[
    						-79.3842099,
    						43.6667414
    					]
    				]
    			]
    		},
    		id: "way/26829706"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26829723",
    			created_by: "Potlatch 0.10d",
    			leisure: "park",
    			name: "Norman Jewison Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.384823,
    						43.6676377
    					],
    					[
    						-79.3844539,
    						43.6667871
    					],
    					[
    						-79.3842479,
    						43.6668367
    					],
    					[
    						-79.3845913,
    						43.6676873
    					],
    					[
    						-79.384823,
    						43.6676377
    					]
    				]
    			]
    		},
    		id: "way/26829723"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26829754",
    			created_by: "Potlatch 0.10d",
    			leisure: "park",
    			name: "George Hislop Park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3852869,
    						43.6687505
    					],
    					[
    						-79.3848521,
    						43.6677897
    					],
    					[
    						-79.3846082,
    						43.6678474
    					],
    					[
    						-79.385043,
    						43.6688083
    					],
    					[
    						-79.3852869,
    						43.6687505
    					]
    				]
    			]
    		},
    		id: "way/26829754"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26945470",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3809963,
    						43.6808905
    					],
    					[
    						-79.3812607,
    						43.6808818
    					],
    					[
    						-79.3813853,
    						43.6808801
    					],
    					[
    						-79.3815136,
    						43.6808707
    					],
    					[
    						-79.3817663,
    						43.6808312
    					],
    					[
    						-79.3818983,
    						43.6808011
    					],
    					[
    						-79.3819459,
    						43.6807933
    					],
    					[
    						-79.3819948,
    						43.6807875
    					],
    					[
    						-79.382031,
    						43.6807812
    					],
    					[
    						-79.3820752,
    						43.6807634
    					],
    					[
    						-79.3821259,
    						43.6807005
    					],
    					[
    						-79.382143,
    						43.6806789
    					],
    					[
    						-79.3821457,
    						43.6806503
    					],
    					[
    						-79.3821356,
    						43.6806217
    					],
    					[
    						-79.3821075,
    						43.6805908
    					],
    					[
    						-79.3819968,
    						43.6804611
    					],
    					[
    						-79.3819043,
    						43.6803283
    					],
    					[
    						-79.3816892,
    						43.6801264
    					],
    					[
    						-79.3810736,
    						43.6794008
    					],
    					[
    						-79.3808984,
    						43.6792582
    					],
    					[
    						-79.3807402,
    						43.6792546
    					],
    					[
    						-79.3806651,
    						43.6792672
    					],
    					[
    						-79.3802682,
    						43.6791595
    					],
    					[
    						-79.3801528,
    						43.6791062
    					],
    					[
    						-79.3802078,
    						43.6790548
    					],
    					[
    						-79.3800898,
    						43.6789704
    					],
    					[
    						-79.3800987,
    						43.6788451
    					],
    					[
    						-79.3799111,
    						43.6788188
    					],
    					[
    						-79.3798377,
    						43.6791072
    					],
    					[
    						-79.3797237,
    						43.6790936
    					],
    					[
    						-79.3795348,
    						43.6790685
    					],
    					[
    						-79.378497,
    						43.6788849
    					],
    					[
    						-79.3775202,
    						43.6790718
    					],
    					[
    						-79.3765355,
    						43.6793035
    					],
    					[
    						-79.3762175,
    						43.6790877
    					],
    					[
    						-79.3760111,
    						43.678904
    					],
    					[
    						-79.3758349,
    						43.6789318
    					],
    					[
    						-79.3757139,
    						43.6787135
    					],
    					[
    						-79.3754774,
    						43.6785504
    					],
    					[
    						-79.3749126,
    						43.6784667
    					],
    					[
    						-79.374606,
    						43.6784719
    					],
    					[
    						-79.3739902,
    						43.6783999
    					],
    					[
    						-79.3736004,
    						43.6781826
    					],
    					[
    						-79.370113,
    						43.6782586
    					],
    					[
    						-79.3701216,
    						43.6784262
    					],
    					[
    						-79.3701216,
    						43.6786124
    					],
    					[
    						-79.3700272,
    						43.678749
    					],
    					[
    						-79.3698298,
    						43.6788545
    					],
    					[
    						-79.3695065,
    						43.6789253
    					],
    					[
    						-79.369167,
    						43.6790011
    					],
    					[
    						-79.3687998,
    						43.6790469
    					],
    					[
    						-79.3688942,
    						43.679438
    					],
    					[
    						-79.3699993,
    						43.6795893
    					],
    					[
    						-79.370411,
    						43.679758
    					],
    					[
    						-79.3705086,
    						43.6798026
    					],
    					[
    						-79.3706739,
    						43.6798782
    					],
    					[
    						-79.3709421,
    						43.6798724
    					],
    					[
    						-79.3711031,
    						43.6797754
    					],
    					[
    						-79.371146,
    						43.6796416
    					],
    					[
    						-79.3715993,
    						43.6796164
    					],
    					[
    						-79.3717334,
    						43.6795019
    					],
    					[
    						-79.3720851,
    						43.6794136
    					],
    					[
    						-79.3724996,
    						43.6793096
    					],
    					[
    						-79.3743303,
    						43.6794342
    					],
    					[
    						-79.3740953,
    						43.6800992
    					],
    					[
    						-79.3743101,
    						43.6800774
    					],
    					[
    						-79.3749324,
    						43.6802764
    					],
    					[
    						-79.3747509,
    						43.6805591
    					],
    					[
    						-79.3752927,
    						43.6807473
    					],
    					[
    						-79.3758948,
    						43.6809266
    					],
    					[
    						-79.3757701,
    						43.6811178
    					],
    					[
    						-79.3764514,
    						43.6812981
    					],
    					[
    						-79.3765828,
    						43.6812923
    					],
    					[
    						-79.376623,
    						43.6812652
    					],
    					[
    						-79.3766364,
    						43.6812225
    					],
    					[
    						-79.3765426,
    						43.6811236
    					],
    					[
    						-79.3764809,
    						43.6810111
    					],
    					[
    						-79.3765989,
    						43.6809024
    					],
    					[
    						-79.3766338,
    						43.6807007
    					],
    					[
    						-79.3768078,
    						43.680605
    					],
    					[
    						-79.3770683,
    						43.6805533
    					],
    					[
    						-79.3772292,
    						43.6805901
    					],
    					[
    						-79.3772668,
    						43.6806949
    					],
    					[
    						-79.3772694,
    						43.6807899
    					],
    					[
    						-79.3773285,
    						43.6808481
    					],
    					[
    						-79.3774331,
    						43.6808442
    					],
    					[
    						-79.3774813,
    						43.6807958
    					],
    					[
    						-79.3774545,
    						43.6807337
    					],
    					[
    						-79.3775189,
    						43.6805921
    					],
    					[
    						-79.3780191,
    						43.6804129
    					],
    					[
    						-79.3786633,
    						43.6803283
    					],
    					[
    						-79.3810173,
    						43.6804052
    					],
    					[
    						-79.3810139,
    						43.6804824
    					],
    					[
    						-79.3809963,
    						43.6808905
    					]
    				]
    			]
    		},
    		id: "way/26945470"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26947736",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.3621872,
    						43.681751
    					],
    					[
    						-79.3600758,
    						43.6816392
    					],
    					[
    						-79.3596466,
    						43.6816641
    					],
    					[
    						-79.3590286,
    						43.6819558
    					],
    					[
    						-79.3583591,
    						43.6825703
    					],
    					[
    						-79.3579128,
    						43.6830669
    					],
    					[
    						-79.3577755,
    						43.6837
    					],
    					[
    						-79.3574707,
    						43.684037
    					],
    					[
    						-79.3575726,
    						43.6841515
    					],
    					[
    						-79.3576254,
    						43.6842601
    					],
    					[
    						-79.3576357,
    						43.6843609
    					],
    					[
    						-79.3576363,
    						43.684489
    					],
    					[
    						-79.3575781,
    						43.68478
    					],
    					[
    						-79.3575954,
    						43.6849157
    					],
    					[
    						-79.3576223,
    						43.6850237
    					],
    					[
    						-79.3576652,
    						43.6851319
    					],
    					[
    						-79.3577671,
    						43.6852803
    					],
    					[
    						-79.3580345,
    						43.6855471
    					],
    					[
    						-79.3576105,
    						43.6858506
    					],
    					[
    						-79.3580934,
    						43.6865719
    					],
    					[
    						-79.3582204,
    						43.6868359
    					],
    					[
    						-79.3585369,
    						43.686929
    					],
    					[
    						-79.3585235,
    						43.6870376
    					],
    					[
    						-79.3584296,
    						43.6871094
    					],
    					[
    						-79.3585179,
    						43.6872313
    					],
    					[
    						-79.3583089,
    						43.6875943
    					],
    					[
    						-79.3580289,
    						43.6877646
    					],
    					[
    						-79.3574526,
    						43.6882033
    					],
    					[
    						-79.3570028,
    						43.6884205
    					],
    					[
    						-79.3568443,
    						43.6886184
    					],
    					[
    						-79.3568122,
    						43.6888472
    					],
    					[
    						-79.3568203,
    						43.6890121
    					],
    					[
    						-79.3569356,
    						43.6891168
    					],
    					[
    						-79.3571223,
    						43.6890232
    					],
    					[
    						-79.3575498,
    						43.6889849
    					],
    					[
    						-79.3581614,
    						43.688725
    					],
    					[
    						-79.3581004,
    						43.6885889
    					],
    					[
    						-79.358321,
    						43.6884874
    					],
    					[
    						-79.3585731,
    						43.6885378
    					],
    					[
    						-79.3593046,
    						43.6883178
    					],
    					[
    						-79.3594559,
    						43.6883688
    					],
    					[
    						-79.3596473,
    						43.6885689
    					],
    					[
    						-79.3594985,
    						43.6886449
    					],
    					[
    						-79.359583,
    						43.6886726
    					],
    					[
    						-79.3595611,
    						43.6887296
    					],
    					[
    						-79.3575996,
    						43.6897963
    					],
    					[
    						-79.357842,
    						43.6900207
    					],
    					[
    						-79.3574563,
    						43.6904866
    					],
    					[
    						-79.3575052,
    						43.6905761
    					],
    					[
    						-79.3574238,
    						43.6908662
    					],
    					[
    						-79.3573847,
    						43.6912608
    					],
    					[
    						-79.3574847,
    						43.6917007
    					],
    					[
    						-79.3570132,
    						43.6924733
    					],
    					[
    						-79.3562812,
    						43.6927978
    					],
    					[
    						-79.3558922,
    						43.6928754
    					],
    					[
    						-79.355683,
    						43.6927804
    					],
    					[
    						-79.355498,
    						43.6928056
    					],
    					[
    						-79.3553853,
    						43.6929161
    					],
    					[
    						-79.3552301,
    						43.6930624
    					],
    					[
    						-79.3548167,
    						43.6933234
    					],
    					[
    						-79.3542883,
    						43.6935765
    					],
    					[
    						-79.3543097,
    						43.6937326
    					],
    					[
    						-79.3540281,
    						43.693849
    					],
    					[
    						-79.3541434,
    						43.6940681
    					],
    					[
    						-79.3541905,
    						43.6943444
    					],
    					[
    						-79.3542752,
    						43.6950247
    					],
    					[
    						-79.3547174,
    						43.6952181
    					],
    					[
    						-79.3548623,
    						43.6950882
    					],
    					[
    						-79.3550205,
    						43.6949447
    					],
    					[
    						-79.3557715,
    						43.6943086
    					],
    					[
    						-79.3569222,
    						43.6933234
    					],
    					[
    						-79.3574982,
    						43.6928313
    					],
    					[
    						-79.3583521,
    						43.6920717
    					],
    					[
    						-79.3585137,
    						43.6919132
    					],
    					[
    						-79.3591338,
    						43.6911735
    					],
    					[
    						-79.3595184,
    						43.6906379
    					],
    					[
    						-79.3600393,
    						43.6897545
    					],
    					[
    						-79.3603233,
    						43.689045
    					],
    					[
    						-79.360419,
    						43.6887371
    					],
    					[
    						-79.3605243,
    						43.6884012
    					],
    					[
    						-79.3606438,
    						43.6878255
    					],
    					[
    						-79.3607061,
    						43.6871168
    					],
    					[
    						-79.3605634,
    						43.6868848
    					],
    					[
    						-79.3605679,
    						43.6867869
    					],
    					[
    						-79.3605907,
    						43.6859034
    					],
    					[
    						-79.3608311,
    						43.6848359
    					],
    					[
    						-79.3609083,
    						43.6844076
    					],
    					[
    						-79.3608053,
    						43.6840972
    					],
    					[
    						-79.3605221,
    						43.6838055
    					],
    					[
    						-79.3601273,
    						43.6834517
    					],
    					[
    						-79.3599985,
    						43.6830669
    					],
    					[
    						-79.3601101,
    						43.6827751
    					],
    					[
    						-79.3603504,
    						43.6825827
    					],
    					[
    						-79.3608053,
    						43.68244
    					],
    					[
    						-79.3614662,
    						43.6824648
    					],
    					[
    						-79.3618353,
    						43.6825082
    					],
    					[
    						-79.3621872,
    						43.681751
    					]
    				]
    			]
    		},
    		id: "way/26947736"
    	},
    	{
    		type: "Feature",
    		properties: {
    			"@id": "way/26947830",
    			leisure: "park"
    		},
    		geometry: {
    			type: "Polygon",
    			coordinates: [
    				[
    					[
    						-79.363167,
    						43.6874578
    					],
    					[
    						-79.3630316,
    						43.6871758
    					],
    					[
    						-79.3628418,
    						43.6867841
    					],
    					[
    						-79.362626,
    						43.6863444
    					],
    					[
    						-79.3625716,
    						43.6862346
    					],
    					[
    						-79.3625307,
    						43.6861245
    					],
    					[
    						-79.3624945,
    						43.6860179
    					],
    					[
    						-79.3624715,
    						43.6859132
    					],
    					[
    						-79.3624489,
    						43.6856935
    					],
    					[
    						-79.3624462,
    						43.6854733
    					],
    					[
    						-79.3624798,
    						43.6852452
    					],
    					[
    						-79.3625468,
    						43.6850534
    					],
    					[
    						-79.36263,
    						43.6848743
    					],
    					[
    						-79.3627379,
    						43.6847057
    					],
    					[
    						-79.36287,
    						43.6845394
    					],
    					[
    						-79.3629867,
    						43.6844167
    					],
    					[
    						-79.3631195,
    						43.6842994
    					],
    					[
    						-79.3632113,
    						43.6842242
    					],
    					[
    						-79.3633082,
    						43.6841531
    					],
    					[
    						-79.3633843,
    						43.684102
    					],
    					[
    						-79.3634782,
    						43.6840506
    					],
    					[
    						-79.3636405,
    						43.6839623
    					],
    					[
    						-79.3640515,
    						43.6837776
    					],
    					[
    						-79.3644643,
    						43.6836075
    					],
    					[
    						-79.3654466,
    						43.6831425
    					],
    					[
    						-79.3668306,
    						43.681751
    					],
    					[
    						-79.3665388,
    						43.6815461
    					],
    					[
    						-79.3665302,
    						43.6808261
    					],
    					[
    						-79.3660067,
    						43.6801743
    					],
    					[
    						-79.3668306,
    						43.6796157
    					],
    					[
    						-79.3676031,
    						43.6791315
    					],
    					[
    						-79.3682812,
    						43.6789949
    					],
    					[
    						-79.3687998,
    						43.6790469
    					],
    					[
    						-79.369167,
    						43.6790011
    					],
    					[
    						-79.3695065,
    						43.6789253
    					],
    					[
    						-79.3698298,
    						43.6788545
    					],
    					[
    						-79.3700272,
    						43.678749
    					],
    					[
    						-79.3701216,
    						43.6786124
    					],
    					[
    						-79.3701216,
    						43.6784262
    					],
    					[
    						-79.370113,
    						43.6782586
    					],
    					[
    						-79.3700358,
    						43.6781096
    					],
    					[
    						-79.3698383,
    						43.6780041
    					],
    					[
    						-79.369598,
    						43.6779048
    					],
    					[
    						-79.3692375,
    						43.6779048
    					],
    					[
    						-79.3692032,
    						43.6776316
    					],
    					[
    						-79.3692204,
    						43.6771909
    					],
    					[
    						-79.368462,
    						43.6769817
    					],
    					[
    						-79.3677223,
    						43.6764931
    					],
    					[
    						-79.3676889,
    						43.6764684
    					],
    					[
    						-79.3670195,
    						43.675978
    					],
    					[
    						-79.366822,
    						43.6755931
    					],
    					[
    						-79.3667877,
    						43.6753014
    					],
    					[
    						-79.3670366,
    						43.674842
    					],
    					[
    						-79.3671139,
    						43.6747241
    					],
    					[
    						-79.3641785,
    						43.6751648
    					],
    					[
    						-79.3639467,
    						43.6746682
    					],
    					[
    						-79.3635004,
    						43.6739356
    					],
    					[
    						-79.3627537,
    						43.6728989
    					],
    					[
    						-79.3620327,
    						43.6721788
    					],
    					[
    						-79.3600758,
    						43.6705522
    					],
    					[
    						-79.3585051,
    						43.6692671
    					],
    					[
    						-79.3580072,
    						43.668609
    					],
    					[
    						-79.3572642,
    						43.6687758
    					],
    					[
    						-79.357681,
    						43.6695014
    					],
    					[
    						-79.3577959,
    						43.6697313
    					],
    					[
    						-79.3579253,
    						43.669961
    					],
    					[
    						-79.3580984,
    						43.6702124
    					],
    					[
    						-79.3583109,
    						43.6704947
    					],
    					[
    						-79.3585121,
    						43.6707561
    					],
    					[
    						-79.3587428,
    						43.6710108
    					],
    					[
    						-79.3587957,
    						43.6709831
    					],
    					[
    						-79.3589821,
    						43.6709977
    					],
    					[
    						-79.3593403,
    						43.6712896
    					],
    					[
    						-79.3593891,
    						43.6713717
    					],
    					[
    						-79.3605135,
    						43.6727809
    					],
    					[
    						-79.36108,
    						43.6735073
    					],
    					[
    						-79.361449,
    						43.6742522
    					],
    					[
    						-79.3619554,
    						43.6756925
    					],
    					[
    						-79.3623417,
    						43.6769216
    					],
    					[
    						-79.3625563,
    						43.67807
    					],
    					[
    						-79.3626577,
    						43.6788825
    					],
    					[
    						-79.3627684,
    						43.6797689
    					],
    					[
    						-79.362788,
    						43.679926
    					],
    					[
    						-79.3628536,
    						43.6803176
    					],
    					[
    						-79.3630824,
    						43.6816828
    					],
    					[
    						-79.3631313,
    						43.6819744
    					],
    					[
    						-79.3632,
    						43.6822848
    					],
    					[
    						-79.3633373,
    						43.6823344
    					],
    					[
    						-79.3636549,
    						43.6820986
    					],
    					[
    						-79.3640669,
    						43.6822351
    					],
    					[
    						-79.3638266,
    						43.6824772
    					],
    					[
    						-79.3635239,
    						43.6827504
    					],
    					[
    						-79.3627035,
    						43.683152
    					],
    					[
    						-79.3622553,
    						43.6834206
    					],
    					[
    						-79.3619521,
    						43.6838055
    					],
    					[
    						-79.3619336,
    						43.6838345
    					],
    					[
    						-79.3616673,
    						43.6844005
    					],
    					[
    						-79.3613906,
    						43.6849524
    					],
    					[
    						-79.3613103,
    					],