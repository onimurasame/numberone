/* Shared Three.js orbit rig, raycaster, theme switcher, and CodeQL-safe DOM helpers */
(function (global) {
  'use strict';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    if (node) node.textContent = '';
  }

  function appendKV(container, entries) {
    const dl = el('div', 'kv-list');
    entries.forEach(function (pair) {
      dl.appendChild(el('span', 'kv-key', pair[0]));
      dl.appendChild(el('span', 'kv-val', pair[1]));
    });
    container.appendChild(dl);
  }

  function initTheme(onThemeChange) {
    const btn = document.getElementById('theme-toggle-btn');
    const saved = localStorage.getItem('n1-docs-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
    function currentTheme() {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    }
    function sync() {
      const t = currentTheme();
      if (btn) btn.textContent = t === 'dark' ? 'Light Theme' : 'Dark Theme';
      if (typeof onThemeChange === 'function') onThemeChange(t);
    }
    sync();
    if (btn) {
      btn.addEventListener('click', function () {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('n1-docs-theme', next);
        sync();
      });
    }
    return currentTheme;
  }

  function createStage(canvasEl, options) {
    const opts = options || {};
    const THREE = global.THREE;
    if (!THREE) {
      showFallback(canvasEl, 'Three.js library failed to load. Refresh or verify docs/site/vendor/three.min.js.');
      return null;
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
    } catch (_err) {
      showFallback(canvasEl, 'WebGL is unavailable in this browser context. You can still inspect all live Number One telemetry in the side panel.');
      return null;
    }

    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(opts.fov || 46, 1, 0.1, 220);

    // Damped spherical orbit controller (mouse + touch)
    const defaults = {
      radius: opts.radius || 16,
      theta: opts.theta !== undefined ? opts.theta : 0.72,
      phi: opts.phi !== undefined ? opts.phi : 1.05,
      target: new THREE.Vector3(
        opts.targetX || 0,
        opts.targetY || 0,
        opts.targetZ || 0
      ),
      minRadius: opts.minRadius || 5,
      maxRadius: opts.maxRadius || 42
    };

    const state = {
      radius: defaults.radius,
      targetRadius: defaults.radius,
      theta: defaults.theta,
      targetTheta: defaults.theta,
      phi: defaults.phi,
      targetPhi: defaults.phi,
      target: defaults.target.clone(),
      desiredTarget: defaults.target.clone(),
      dragging: false,
      pointerDownX: 0,
      pointerDownY: 0,
      lastX: 0,
      lastY: 0,
      movedDist: 0,
      autoRotate: Boolean(opts.autoRotate)
    };

    function resize() {
      const parent = canvasEl.parentElement;
      if (!parent) return;
      const w = Math.max(parent.clientWidth, 320);
      const h = Math.max(parent.clientHeight, 320);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }

    resize();
    global.addEventListener('resize', resize);
    if (typeof ResizeObserver === 'function' && canvasEl.parentElement) {
      const ro = new ResizeObserver(resize);
      ro.observe(canvasEl.parentElement);
    }

    canvasEl.addEventListener('pointerdown', function (e) {
      state.dragging = true;
      state.pointerDownX = e.clientX;
      state.pointerDownY = e.clientY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.movedDist = 0;
      if (canvasEl.setPointerCapture) {
        try { canvasEl.setPointerCapture(e.pointerId); } catch (_ignore) { /* noop */ }
      }
    });

    canvasEl.addEventListener('pointermove', function (e) {
      if (!state.dragging) return;
      const dx = e.clientX - state.lastX;
      const dy = e.clientY - state.lastY;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.movedDist += Math.abs(dx) + Math.abs(dy);
      state.targetTheta -= dx * 0.0075;
      state.targetPhi = Math.max(0.22, Math.min(1.48, state.targetPhi - dy * 0.0065));
    });

    function endDrag(e) {
      if (!state.dragging) return;
      state.dragging = false;
      if (state.movedDist < 6 && typeof onPick === 'function') {
        const rect = canvasEl.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        onPick(ndc);
      }
    }

    canvasEl.addEventListener('pointerup', endDrag);
    canvasEl.addEventListener('pointercancel', function () { state.dragging = false; });

    canvasEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.targetRadius = Math.max(
        defaults.minRadius,
        Math.min(defaults.maxRadius, state.targetRadius + e.deltaY * 0.012)
      );
    }, { passive: false });

    const raycaster = new THREE.Raycaster();
    let pickables = [];
    let pickHandler = null;

    function onPick(ndc) {
      if (!pickHandler || pickables.length === 0) return;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(pickables, true);
      if (hits.length > 0) {
        let obj = hits[0].object;
        while (obj && !obj.userData.pickInfo && obj.parent) {
          obj = obj.parent;
        }
        if (obj && obj.userData.pickInfo) {
          pickHandler(obj.userData.pickInfo);
        }
      }
    }

    function updateCamera(dt) {
      if (state.autoRotate && !state.dragging) {
        state.targetTheta += dt * 0.14;
      }
      const damp = Math.min(1, dt * 7);
      state.theta += (state.targetTheta - state.theta) * damp;
      state.phi += (state.targetPhi - state.phi) * damp;
      state.radius += (state.targetRadius - state.radius) * damp;
      state.target.lerp(state.desiredTarget, damp);

      const sinPhi = Math.sin(state.phi);
      camera.position.set(
        state.target.x + state.radius * sinPhi * Math.sin(state.theta),
        state.target.y + state.radius * Math.cos(state.phi),
        state.target.z + state.radius * sinPhi * Math.cos(state.theta)
      );
      camera.lookAt(state.target);
    }

    function resetCamera() {
      state.targetRadius = defaults.radius;
      state.targetTheta = defaults.theta;
      state.targetPhi = defaults.phi;
      state.desiredTarget.copy(defaults.target);
    }

    function focusCamera(x, y, z, radius, theta, phi) {
      state.desiredTarget.set(x, y, z);
      if (radius !== undefined) state.targetRadius = radius;
      if (theta !== undefined) state.targetTheta = theta;
      if (phi !== undefined) state.targetPhi = phi;
    }

    return {
      THREE: THREE,
      scene: scene,
      camera: camera,
      renderer: renderer,
      state: state,
      updateCamera: updateCamera,
      resetCamera: resetCamera,
      focusCamera: focusCamera,
      setPickables: function (list, handler) {
        pickables = list;
        pickHandler = handler;
      }
    };
  }

  function showFallback(canvasEl, message) {
    const parent = canvasEl && canvasEl.parentElement;
    if (!parent) return;
    const box = el('div', 'fallback-box', message);
    parent.appendChild(box);
  }

  global.N1ThreeShell = {
    el: el,
    clear: clear,
    appendKV: appendKV,
    initTheme: initTheme,
    createStage: createStage
  };
})(window);
