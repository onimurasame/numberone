(function () {
  'use strict';

  const Shell = window.N1ThreeShell;
  const canvas = document.getElementById('three-canvas');
  const stage = Shell.createStage(canvas, {
    radius: 13.2,
    theta: 0.78,
    phi: 0.98,
    targetX: 0,
    targetY: 0.6,
    targetZ: 0,
    minRadius: 5.5,
    maxRadius: 26
  });

  const planControls = document.getElementById('plan-controls');
  const verdictTitle = document.getElementById('verdict-title');
  const verdictBody = document.getElementById('verdict-body');
  const replayTitle = document.getElementById('replay-title');
  const replayBody = document.getElementById('replay-body');
  const sealBody = document.getElementById('seal-body');
  const seqScrubber = document.getElementById('seq-scrubber');
  const seqLabel = document.getElementById('seq-label');
  const playBtn = document.getElementById('play-toggle-btn');
  const resetBtn = document.getElementById('reset-cam-btn');

  let sceneData = null;
  let activePlan = null;
  let currentSeq = 9;
  let playing = true;
  let roverAngle = 0.35;

  // 3D scene handles
  let roverGroup = null;
  let roverWheels = [];
  let statusBeaconMat = null;
  let safetyArchGroup = null;
  let laserBeamGroup = null;
  let archLightMat = null;
  let foamRailsGroup = null;

  if (playBtn) {
    playBtn.addEventListener('click', function () {
      playing = !playing;
      playBtn.textContent = playing ? 'Pause Rover' : 'Resume Rover';
      playBtn.classList.toggle('active', playing);
    });
  }
  if (resetBtn && stage) {
    resetBtn.addEventListener('click', function () {
      stage.resetCamera();
    });
  }

  function applyTheme(theme) {
    if (!stage) return;
    const THREE = stage.THREE;
    const dark = theme === 'dark';
    stage.scene.background = new THREE.Color(dark ? 0x0e1520 : 0xf2ece1);
    stage.scene.fog = new THREE.Fog(dark ? 0x0e1520 : 0xf2ece1, 18, 42);
  }
  Shell.initTheme(applyTheme);

  function renderPlanVerdict(plan) {
    activePlan = plan;
    verdictTitle.textContent = plan.label;
    Shell.clear(verdictBody);

    const bannerClass = plan.blocked ? 'status-banner status-bad' : 'status-banner status-ok';
    const bannerText = plan.blocked
      ? 'VERDICT: BLOCK — L2 Safety Gate halted the rover before 100% power skid!'
      : 'VERDICT: ' + plan.verdict + ' — Gate open! Rover cleared at ' + plan.requestedSpeedPct + '% speed.';
    verdictBody.appendChild(Shell.el('div', bannerClass, bannerText));

    const chips = Shell.el('div', 'chip-row');
    chips.appendChild(Shell.el('span', 'chip', 'Speed: ' + plan.requestedSpeedPct + '%'));
    chips.appendChild(Shell.el('span', 'chip', 'Conflicts: ' + plan.conflicts.length));
    chips.appendChild(Shell.el('span', 'chip', 'Supersedes L4: ' + (plan.supersedesSession ? 'YES' : 'NO')));
    verdictBody.appendChild(chips);

    if (plan.conflicts.length > 0) {
      const c = plan.conflicts[0];
      const p = Shell.el('p', '', c.level + ' (' + c.severity + '): ' + c.message);
      p.style.marginTop = '0.55rem';
      verdictBody.appendChild(p);
    }

    if (archLightMat && statusBeaconMat && laserBeamGroup) {
      const hex = parseInt(plan.color.replace('#', ''), 16);
      archLightMat.color.setHex(hex);
      archLightMat.emissive.setHex(hex);
      statusBeaconMat.color.setHex(hex);
      statusBeaconMat.emissive.setHex(hex);
      laserBeamGroup.visible = plan.blocked && currentSeq >= (sceneData ? sceneData.safetyDirectiveSeq : 5);
    }
    if (plan.blocked) {
      // Position rover approaching the safety arch so user watches it halt at the laser gate!
      roverAngle = -0.55;
    }
  }

  function updateSnapshot(seq) {
    if (!sceneData) return;
    currentSeq = seq;
    if (seqLabel) seqLabel.textContent = 'Time-Travel: seq #' + seq + ' / ' + sceneData.snapshots.length;
    const snap = sceneData.snapshots.find(function (s) { return s.seq === seq; }) || sceneData.snapshots[sceneData.snapshots.length - 1];
    if (!snap) return;

    replayTitle.textContent = 'seq #' + snap.seq + ' · ' + snap.type;
    Shell.clear(replayBody);
    replayBody.appendChild(Shell.el('p', '', snap.summary));
    Shell.appendKV(replayBody, [
      ['Hash', snap.hashShort + '...'],
      ['Open Tasks', String(snap.openIssues)],
      ['Completed Tasks', String(snap.resolvedIssues)],
      ['L2 Directives', String(snap.activeDirectives)],
      ['Lessons Saved', String(snap.lessonsCount)]
    ]);

    // Visually reflect historical state in the 3D arena!
    if (safetyArchGroup) {
      const directiveActive = snap.activeDirectives > 0;
      safetyArchGroup.visible = directiveActive;
      if (laserBeamGroup) {
        laserBeamGroup.visible = directiveActive && Boolean(activePlan && activePlan.blocked);
      }
    }
    if (foamRailsGroup) {
      // Bumper rails appear once both tasks are resolved!
      foamRailsGroup.visible = snap.resolvedIssues >= 2;
    }
  }

  function buildRover(THREE) {
    const grp = new THREE.Group();
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.34, 1.35),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.25 })
    );
    chassis.position.y = 0.32;
    chassis.castShadow = true;
    grp.add(chassis);

    const hood = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.22, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.4, metalness: 0.3 })
    );
    hood.position.set(0, 0.56, -0.1);
    grp.add(hood);

    // 4 wheels
    const wheelGeom = new THREE.CylinderGeometry(0.21, 0.21, 0.16, 18);
    wheelGeom.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85 });
    const positions = [
      [-0.55, 0.21, 0.42],
      [0.55, 0.21, 0.42],
      [-0.55, 0.21, -0.42],
      [0.55, 0.21, -0.42]
    ];
    roverWheels = [];
    positions.forEach(function (p) {
      const w = new THREE.Mesh(wheelGeom, wheelMat);
      w.position.set(p[0], p[1], p[2]);
      grp.add(w);
      roverWheels.push(w);
    });

    // Front cyan line-following light sensor cone
    const sensorCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.24, 0.42, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.38, side: THREE.DoubleSide })
    );
    sensorCone.position.set(0, 0.22, 0.78);
    grp.add(sensorCone);

    // Status LED mast
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 })
    );
    mast.position.set(0, 0.85, -0.2);
    grp.add(mast);

    statusBeaconMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.7 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 14), statusBeaconMat);
    led.position.set(0, 1.1, -0.2);
    grp.add(led);

    grp.userData.pickInfo = { kind: 'rover' };
    return grp;
  }

  function buildScene(data) {
    sceneData = data;

    Shell.clear(sealBody);
    sealBody.appendChild(
      Shell.el(
        'div',
        data.integrity.valid ? 'status-banner status-ok' : 'status-banner status-bad',
        'SHA-256 Chain Seal: ' + (data.integrity.valid ? 'VERIFIED VALID' : 'INVALID') + ' (' + data.integrity.totalEvents + ' entries)'
      )
    );
    const subP = Shell.el('p', '', 'Documentary generated: ' + data.documentaryChapters + ' chapters ready for competition judges.');
    subP.style.marginTop = '0.5rem';
    sealBody.appendChild(subP);

    if (seqScrubber) {
      seqScrubber.max = String(data.snapshots.length);
      seqScrubber.value = String(data.snapshots.length);
      seqScrubber.addEventListener('input', function () {
        updateSnapshot(Number(seqScrubber.value));
      });
    }

    if (planControls) {
      data.plans.forEach(function (plan, idx) {
        const cls = plan.blocked ? 'btn btn-danger' : 'btn btn-emerald';
        const btn = Shell.el('button', cls + (idx === 0 ? ' active' : ''), plan.label);
        btn.type = 'button';
        btn.addEventListener('click', function () {
          Array.from(planControls.children).forEach(function (b) {
            b.classList.toggle('active', b === btn);
          });
          renderPlanVerdict(plan);
        });
        planControls.appendChild(btn);
      });
    }

    if (!stage) {
      renderPlanVerdict(data.plans[0]);
      updateSnapshot(data.snapshots.length);
      return;
    }

    const THREE = stage.THREE;
    stage.scene.add(new THREE.HemisphereLight(0xf8fafc, 0x334155, 1.0));
    const sun = new THREE.DirectionalLight(0xfffbeb, 0.85);
    sun.position.set(7, 12, 9);
    sun.castShadow = true;
    stage.scene.add(sun);

    // Classroom wooden test table
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(11.4, 0.36, 7.6),
      new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 0.75 })
    );
    table.position.y = -0.18;
    table.receiveShadow = true;
    stage.scene.add(table);

    // White test board mat on top of table
    const matSurface = new THREE.Mesh(
      new THREE.BoxGeometry(10.6, 0.04, 6.8),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.65 })
    );
    matSurface.position.y = 0.02;
    stage.scene.add(matSurface);

    // Oval black-tape line-follower track (elliptical ring of segments)
    const rx = 3.9;
    const rz = 2.15;
    const trackPoints = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      trackPoints.push(new THREE.Vector3(Math.cos(a) * rx, 0.05, Math.sin(a) * rz));
    }
    const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true);
    const trackMesh = new THREE.Mesh(
      new THREE.TubeGeometry(trackCurve, 80, 0.14, 6, true),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 })
    );
    trackMesh.scale.y = 0.12;
    stage.scene.add(trackMesh);

    // Foam bumper guardrails around table edges (unlocked when bumper task completes!)
    foamRailsGroup = new THREE.Group();
    const foamMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.6 });
    const railDefs = [
      [10.8, 0.28, 0.18, 0, 0.14, 3.45],
      [10.8, 0.28, 0.18, 0, 0.14, -3.45],
      [0.18, 0.28, 7.0, 5.45, 0.14, 0],
      [0.18, 0.28, 7.0, -5.45, 0.14, 0]
    ];
    railDefs.forEach(function (r) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(r[0], r[1], r[2]), foamMat);
      mesh.position.set(r[3], r[4], r[5]);
      foamRailsGroup.add(mesh);
    });
    stage.scene.add(foamRailsGroup);

    // L2 Authority Safety Gate Arch positioned at angle = 0 (x = rx, z = 0)
    safetyArchGroup = new THREE.Group();
    safetyArchGroup.position.set(rx, 0, 0);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.35 });
    const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.85, 0.24), pillarMat);
    leftPost.position.set(-0.95, 0.92, 0);
    const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.85, 0.24), pillarMat);
    rightPost.position.set(0.95, 0.92, 0);
    archLightMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.65 });
    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.26, 0.28), archLightMat);
    crossbar.position.set(0, 1.85, 0);
    safetyArchGroup.add(leftPost, rightPost, crossbar);

    // Crimson L2 laser barrier beams (visible when BLOCKED!)
    laserBeamGroup = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.78 });
    [0.45, 0.9, 1.35].forEach(function (y) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 8), beamMat);
      beam.rotation.z = Math.PI / 2;
      beam.position.set(0, y, 0);
      laserBeamGroup.add(beam);
    });
    safetyArchGroup.add(laserBeamGroup);
    safetyArchGroup.userData.pickInfo = { kind: 'gate' };
    stage.scene.add(safetyArchGroup);

    // Rover bot
    roverGroup = buildRover(THREE);
    stage.scene.add(roverGroup);

    stage.setPickables([roverGroup, safetyArchGroup], function (info) {
      if (info.kind === 'gate') {
        stage.focusCamera(rx, 0.8, 0, 7.2);
      } else {
        stage.focusCamera(roverGroup.position.x, 0.5, roverGroup.position.z, 7.2);
      }
    });

    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    renderPlanVerdict(data.plans[0]);
    updateSnapshot(data.snapshots.length);

    let last = performance.now();
    function animate(now) {
      requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (playing && activePlan) {
        const speedRad = (activePlan.requestedSpeedPct / 100) * 1.15;
        const gateActive = currentSeq >= data.safetyDirectiveSeq;
        const blockedAtGate = gateActive && activePlan.blocked;

        if (blockedAtGate) {
          // Approach gate from -0.55 to -0.18 and safely halt in front of the crimson L2 barrier!
          if (roverAngle < -0.22) {
            roverAngle = Math.min(-0.22, roverAngle + dt * speedRad);
            roverWheels.forEach(function (w) { w.rotation.x += dt * 7; });
          }
          if (laserBeamGroup) {
            const pulse = 0.55 + Math.sin(now * 0.012) * 0.35;
            laserBeamGroup.children.forEach(function (b) { b.material.opacity = pulse; });
          }
        } else {
          roverAngle = (roverAngle + dt * speedRad) % (Math.PI * 2);
          roverWheels.forEach(function (w) { w.rotation.x += dt * speedRad * 6; });
        }
      }

      const x = Math.cos(roverAngle) * rx;
      const z = Math.sin(roverAngle) * rz;
      const nx = Math.cos(roverAngle + 0.05) * rx;
      const nz = Math.sin(roverAngle + 0.05) * rz;
      roverGroup.position.set(x, 0.04, z);
      roverGroup.lookAt(nx, 0.04, nz);

      stage.updateCamera(dt);
      stage.renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(animate);
  }

  fetch('./data.json')
    .then(function (r) { return r.json(); })
    .then(buildScene)
    .catch(function () {
      verdictTitle.textContent = 'Run node examples/kids-robotics-arena/run.mjs to generate data.json';
    });
})();
