(function () {
  'use strict';

  const Shell = window.N1ThreeShell;
  const canvas = document.getElementById('three-canvas');
  const stage = Shell.createStage(canvas, {
    radius: 14.5,
    theta: 0.65,
    phi: 1.08,
    targetX: 0.4,
    targetY: 1.1,
    targetZ: 0,
    minRadius: 5,
    maxRadius: 30
  });

  const selectedCard = document.getElementById('selected-card');
  const checkpointTitle = document.getElementById('checkpoint-title');
  const checkpointBody = document.getElementById('checkpoint-body');
  const consultBody = document.getElementById('consult-body');
  const trialControls = document.getElementById('trial-controls');
  const seqScrubber = document.getElementById('seq-scrubber');
  const seqLabel = document.getElementById('seq-label');
  const playBtn = document.getElementById('play-toggle-btn');
  const resetBtn = document.getElementById('reset-cam-btn');

  let sceneData = null;
  let playing = true;
  let currentSeq = 9;
  let focusedTrialId = 'all';
  const trialObjects = [];

  if (playBtn) {
    playBtn.addEventListener('click', function () {
      playing = !playing;
      playBtn.textContent = playing ? 'Pause Flights' : 'Resume Flights';
      playBtn.classList.toggle('active', playing);
    });
  }
  if (resetBtn && stage) {
    resetBtn.addEventListener('click', function () {
      stage.resetCamera();
    });
  }

  // Lighting & gym runway environment
  let floorMat = null;
  let gridHelper = null;

  function applySceneTheme(theme) {
    if (!stage) return;
    const THREE = stage.THREE;
    const dark = theme === 'dark';
    stage.scene.background = new THREE.Color(dark ? 0x0f1621 : 0xf4efe6);
    stage.scene.fog = new THREE.Fog(dark ? 0x0f1621 : 0xf4efe6, 22, 48);
    if (floorMat) {
      floorMat.color.setHex(dark ? 0x1a2433 : 0xe9dec8);
    }
    if (gridHelper) {
      stage.scene.remove(gridHelper);
      gridHelper = new THREE.GridHelper(
        18,
        18,
        dark ? 0x38506b : 0xb8aa92,
        dark ? 0x1f2d40 : 0xd6cab3
      );
      gridHelper.position.set(0, 0.01, 0);
      stage.scene.add(gridHelper);
    }
  }

  Shell.initTheme(applySceneTheme);

  function buildPaperPlane(THREE, colorHex, hasPaperclip, hasWinglets) {
    const group = new THREE.Group();
    const wingMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.35,
      metalness: 0.12,
      side: THREE.DoubleSide
    });
    const keelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.08,
      side: THREE.DoubleSide
    });

    // Left and right swept delta wings pointing along +Z (so lookAt aligns nose forward!)
    function makeWing(sign) {
      const geom = new THREE.BufferGeometry();
      const verts = new Float32Array([
        0, 0, 0.65,
        sign * 0.48, 0.06, -0.45,
        0, 0.01, -0.35
      ]);
      geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geom.computeVertexNormals();
      return new THREE.Mesh(geom, wingMat);
    }

    group.add(makeWing(1));
    group.add(makeWing(-1));

    // Center fuselage keel
    const keelGeom = new THREE.BufferGeometry();
    const keelVerts = new Float32Array([
      0, 0, 0.65,
      0, -0.16, -0.35,
      0, 0.01, -0.35
    ]);
    keelGeom.setAttribute('position', new THREE.BufferAttribute(keelVerts, 3));
    keelGeom.computeVertexNormals();
    group.add(new THREE.Mesh(keelGeom, keelMat));

    // Nose paperclip balance weight (Trials #3 & #4)
    if (hasPaperclip) {
      const clip = new THREE.Mesh(
        new THREE.TorusGeometry(0.075, 0.018, 8, 18),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 })
      );
      clip.position.set(0, -0.02, 0.42);
      clip.rotation.y = Math.PI / 2;
      group.add(clip);
    }

    // Symmetrical 1cm upturned wingtips (Trial #4 Winner!)
    if (hasWinglets) {
      const tipMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
      [-1, 1].forEach(function (sign) {
        const tip = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.14, 0.26), tipMat);
        tip.position.set(sign * 0.47, 0.12, -0.34);
        tip.rotation.z = -sign * 0.2;
        group.add(tip);
      });
    }

    return group;
  }

  function buildTrajectoryCurve(THREE, trial) {
    const startX = -5.5;
    const endX = startX + trial.distanceMeters;
    const pts = [];
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let x;
      let y;
      let z;
      if (trial.stalled) {
        // Tail-weighted plane pitches sharply up, stalls at 0.55, then drops backward slightly!
        if (t < 0.55) {
          const u = t / 0.55;
          x = startX + u * 1.65;
          y = 1.25 + Math.sin(u * Math.PI * 0.5) * 1.35;
        } else {
          const u = (t - 0.55) / 0.45;
          x = startX + 1.65 - u * 0.25;
          y = 2.6 * (1 - u * u) + 0.08;
        }
        z = trial.lateralDriftMeters * t;
      } else {
        x = startX + (endX - startX) * t;
        const arc = Math.sin(t * Math.PI);
        const glideDrop = 1.25 * (1 - t);
        y = Math.max(0.08, glideDrop + arc * (trial.peakHeightMeters - 0.75));
        z = trial.lateralDriftMeters * t * t;
      }
      pts.push(new THREE.Vector3(x, y, z));
    }
    return new THREE.CatmullRomCurve3(pts);
  }

  function renderSelectedTrial(trial) {
    Shell.clear(selectedCard);
    selectedCard.appendChild(Shell.el('span', 'kicker', 'Selected Flight Trial · Live Stream Event'));
    selectedCard.appendChild(Shell.el('h2', '', trial.name));
    selectedCard.appendChild(Shell.el('p', '', trial.note));

    const chipRow = Shell.el('div', 'chip-row');
    const statusClass = trial.status === 'dead-end' ? 'chip chip-bad' : trial.status === 'winner' ? 'chip chip-ok' : 'chip chip-info';
    chipRow.appendChild(Shell.el('span', statusClass, trial.status.toUpperCase()));
    chipRow.appendChild(Shell.el('span', 'chip', trial.distanceMeters + 'm distance'));
    chipRow.appendChild(Shell.el('span', 'chip', 'seq #' + trial.eventSeq));
    selectedCard.appendChild(chipRow);

    Shell.appendKV(selectedCard, [
      ['Event ID', trial.eventId],
      ['SHA-256', trial.eventHash + '...'],
      ['Peak Height', trial.peakHeightMeters + ' m'],
      ['Side Drift', trial.lateralDriftMeters + ' m']
    ]);
  }

  function updateCheckpointUI(seq) {
    if (!sceneData) return;
    currentSeq = seq;
    if (seqLabel) seqLabel.textContent = 'Time-Travel: seq #' + seq + ' / ' + sceneData.timelineSteps.length;
    const step = sceneData.timelineSteps.find(function (s) { return s.seq === seq; }) || sceneData.timelineSteps[sceneData.timelineSteps.length - 1];
    if (!step) return;

    checkpointTitle.textContent = 'seq #' + step.seq + ' · ' + step.type;
    Shell.clear(checkpointBody);
    checkpointBody.appendChild(Shell.el('p', '', step.summary));
    Shell.appendKV(checkpointBody, [
      ['Hash', step.hashShort + '...'],
      ['Prev Hash', step.prevHashShort + '...'],
      ['Lessons', String(step.lessonsCount)],
      ['Dead Ends', String(step.deadEndsCount)],
      ['Decisions', String(step.decisionsCount)]
    ]);

    // Show/hide 3D trials based on time-travel sequence AND trial focus filter
    trialObjects.forEach(function (item) {
      const unlocked = item.trial.eventSeq <= currentSeq;
      const focused = focusedTrialId === 'all' || focusedTrialId === item.trial.id;
      const visible = unlocked && focused;
      item.group.visible = visible;
    });
  }

  function renderConsultation() {
    if (!sceneData || !consultBody) return;
    Shell.clear(consultBody);
    const cp = sceneData.consultationPreview;
    consultBody.appendChild(Shell.el('p', '', 'Query: "' + cp.query + '"'));
    cp.surfacedDeadEnds.forEach(function (d) {
      const box = Shell.el('div', 'status-banner status-bad', 'Dead-End Warning: ' + d.approach + ' (' + d.reason + ')');
      box.style.marginBottom = '0.5rem';
      consultBody.appendChild(box);
    });
    cp.matchedLessons.slice(0, 2).forEach(function (l) {
      const box = Shell.el('div', 'status-banner status-ok', 'Lesson: ' + l.preventionRule);
      box.style.marginBottom = '0.45rem';
      consultBody.appendChild(box);
    });
  }

  function buildScene(data) {
    sceneData = data;
    renderConsultation();

    if (seqScrubber) {
      seqScrubber.max = String(data.timelineSteps.length);
      seqScrubber.value = String(data.timelineSteps.length);
      seqScrubber.addEventListener('input', function () {
        updateCheckpointUI(Number(seqScrubber.value));
      });
    }

    // Focus filter pills
    if (trialControls) {
      const defs = [{ id: 'all', label: 'All 4 Flights' }].concat(
        data.trials.map(function (t, i) {
          return { id: t.id, label: 'Trial #' + (i + 1) + ' (' + t.distanceMeters + 'm)' };
        })
      );
      defs.forEach(function (d) {
        const btn = Shell.el('button', 'btn' + (d.id === 'all' ? ' active' : ''), d.label);
        btn.type = 'button';
        btn.addEventListener('click', function () {
          focusedTrialId = d.id;
          Array.from(trialControls.children).forEach(function (b) {
            b.classList.toggle('active', b === btn);
          });
          if (d.id === 'all') {
            if (stage) stage.resetCamera();
          } else {
            const match = data.trials.find(function (t) { return t.id === d.id; });
            if (match) {
              renderSelectedTrial(match);
              if (stage) stage.focusCamera(-5.5 + match.distanceMeters * 0.55, 1.3, match.lateralDriftMeters * 0.4, 9.5);
            }
          }
          updateCheckpointUI(currentSeq);
        });
        trialControls.appendChild(btn);
      });
    }

    if (!stage) {
      updateCheckpointUI(data.timelineSteps.length);
      renderSelectedTrial(data.trials[data.trials.length - 1]);
      return;
    }

    const THREE = stage.THREE;

    // Lights
    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x334155, 0.95);
    stage.scene.add(hemi);
    const dirLight = new THREE.DirectionalLight(0xfffbeb, 0.9);
    dirLight.position.set(8, 14, 10);
    dirLight.castShadow = true;
    stage.scene.add(dirLight);

    // Gym runway floor & meter stripes
    floorMat = new THREE.MeshStandardMaterial({ color: 0x1a2433, roughness: 0.85, metalness: 0.05 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.16, 7), floorMat);
    floor.position.set(0.5, -0.08, 0);
    floor.receiveShadow = true;
    stage.scene.add(floor);

    gridHelper = new THREE.GridHelper(18, 18, 0x38506b, 0x1f2d40);
    gridHelper.position.set(0, 0.01, 0);
    stage.scene.add(gridHelper);

    // Launch platform at 0m (x = -5.5)
    const launchPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.25, 2.8),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 })
    );
    launchPad.position.set(-5.5, 0.125, 0);
    stage.scene.add(launchPad);

    // Meter marker bars across the runway (every 2 meters up to 10m goal line!)
    for (let m = 2; m <= 10; m += 2) {
      const isGoal = m === 10;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(isGoal ? 0.12 : 0.05, 0.02, 5.4),
        new THREE.MeshBasicMaterial({ color: isGoal ? 0x22c55e : 0x64748b })
      );
      stripe.position.set(-5.5 + m, 0.02, 0);
      stage.scene.add(stripe);
    }

    // Build all 4 flight arcs, paper airplanes & landing beacons
    const pickables = [];
    data.trials.forEach(function (trial, idx) {
      const grp = new THREE.Group();
      const curve = buildTrajectoryCurve(THREE, trial);
      const colorNum = parseInt(trial.color.replace('#', ''), 16);

      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, trial.status === 'winner' ? 0.055 : 0.038, 10, false),
        new THREE.MeshStandardMaterial({
          color: colorNum,
          emissive: colorNum,
          emissiveIntensity: 0.25,
          roughness: 0.3
        })
      );
      tube.userData.pickInfo = trial;
      grp.add(tube);

      const endPt = curve.getPoint(1);
      const beacon = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.5, 12),
        new THREE.MeshStandardMaterial({ color: colorNum, emissive: colorNum, emissiveIntensity: 0.35 })
      );
      beacon.position.set(endPt.x, 0.28, endPt.z);
      beacon.rotation.x = Math.PI;
      beacon.userData.pickInfo = trial;
      grp.add(beacon);

      const plane = buildPaperPlane(
        THREE,
        colorNum,
        trial.status === 'breakthrough' || trial.status === 'winner',
        trial.status === 'winner'
      );
      plane.userData.pickInfo = trial;
      grp.add(plane);

      stage.scene.add(grp);
      pickables.push(tube, beacon, plane);
      trialObjects.push({
        trial: trial,
        group: grp,
        curve: curve,
        plane: plane,
        phaseOffset: idx * 0.23
      });
    });

    stage.setPickables(pickables, function (pickedTrial) {
      renderSelectedTrial(pickedTrial);
    });

    applySceneTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    renderSelectedTrial(data.trials[data.trials.length - 1]);
    updateCheckpointUI(data.timelineSteps.length);

    let elapsed = 0;
    let lastTime = performance.now();
    function animate(now) {
      requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      if (playing) elapsed += dt * 0.26;

      trialObjects.forEach(function (item) {
        const t = (elapsed + item.phaseOffset) % 1;
        const pos = item.curve.getPointAt(t);
        const nextPos = item.curve.getPointAt(Math.min(1, t + 0.02));
        item.plane.position.copy(pos);
        item.plane.lookAt(nextPos);
        if (item.trial.stalled && t > 0.5) {
          item.plane.rotation.z += Math.sin(t * 24) * 0.35;
        }
      });

      stage.updateCamera(dt);
      stage.renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(animate);
  }

  fetch('./data.json')
    .then(function (r) { return r.json(); })
    .then(buildScene)
    .catch(function () {
      checkpointTitle.textContent = 'Run node examples/kids-science-fair-glider/run.mjs to generate data.json';
    });
})();
