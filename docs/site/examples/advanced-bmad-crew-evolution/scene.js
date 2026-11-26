(function () {
  'use strict';

  const Shell = window.N1ThreeShell;
  const canvas = document.getElementById('three-canvas');
  const stage = Shell.createStage(canvas, {
    radius: 15.2,
    theta: 0.65,
    phi: 1.0,
    targetX: 0,
    targetY: 1.5,
    targetZ: 0,
    minRadius: 6.5,
    maxRadius: 32,
    autoRotate: true
  });

  const p1Btn = document.getElementById('phase-1-btn');
  const p2Btn = document.getElementById('phase-2-btn');
  const p3Btn = document.getElementById('phase-3-btn');
  const orbitBtn = document.getElementById('orbit-toggle-btn');
  const resetBtn = document.getElementById('reset-cam-btn');
  const phaseTitle = document.getElementById('phase-title');
  const phaseBody = document.getElementById('phase-body');
  const selTitle = document.getElementById('selection-title');
  const selBody = document.getElementById('selection-body');
  const syncBody = document.getElementById('sync-body');

  let sceneData = null;
  let activePhase = 1;

  // 3D handles
  const officerTowers = {};
  let rulingCoreMat = null;
  let rulingRingMat = null;
  let challengeArcsGroup = null;
  let evoRejectOrb = null;
  let evoPromoteOrb = null;
  let syncPacketMesh = null;
  let syncTargetPos = null;

  if (orbitBtn && stage) {
    orbitBtn.addEventListener('click', function () {
      stage.state.autoRotate = !stage.state.autoRotate;
      orbitBtn.textContent = stage.state.autoRotate ? 'Auto-Orbit: ON' : 'Auto-Orbit: OFF';
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
    stage.scene.background = new THREE.Color(dark ? 0x0c111b : 0xf4efe6);
    stage.scene.fog = new THREE.Fog(dark ? 0x0c111b : 0xf4efe6, 20, 48);
  }
  Shell.initTheme(applyTheme);

  function activePartySnapshot() {
    if (!sceneData) return null;
    return activePhase === 3 ? sceneData.phases.phase3Consensus : sceneData.phases.phase1Veto;
  }

  function renderOfficerDetail(role) {
    const party = activePartySnapshot();
    if (!party) return;
    const o = party.officers.find(function (x) { return x.role === role; });
    if (!o) return;
    selTitle.textContent = o.title;
    Shell.clear(selBody);
    selBody.appendChild(
      Shell.el(
        'div',
        o.blockingCount > 0 ? 'status-banner status-bad' : 'status-banner status-ok',
        o.kpiName + ' = ' + o.kpiScore + ' / 100 (' + o.gate + ')'
      )
    );
    Shell.appendKV(selBody, [
      ['Checks Passed', o.checksPassed + ' / ' + o.checksApplicable],
      ['Blocking Defects', String(o.blockingCount)],
      ['Active Phase', 'Phase ' + activePhase]
    ]);
  }

  function renderEvolutionDetail(kind) {
    if (!sceneData) return;
    const evo = sceneData.phases.phase2Evolution[kind];
    selTitle.textContent = kind === 'promoted' ? 'PROMOTED Practice (+' + evo.delta + ' KPI delta)' : 'REJECTED Practice (False Positive Guard)';
    Shell.clear(selBody);
    selBody.appendChild(
      Shell.el(
        'div',
        evo.accepted ? 'status-banner status-ok' : 'status-banner status-bad',
        evo.practiceId + ' -> accepted=' + evo.accepted
      )
    );
    Shell.appendKV(selBody, [
      ['KPI Delta', (evo.delta >= 0 ? '+' : '') + evo.delta],
      ['False Positives', String(evo.falsePositivesAfter)],
      ['Reasons', evo.reasons.join(' | ')]
    ]);
  }

  function renderSyncDetail() {
    if (!sceneData) return;
    const s = sceneData.phases.phase4Sync;
    selTitle.textContent = 'Distributed Scrum Mirror (' + s.adapter + ')';
    Shell.clear(selBody);
    selBody.appendChild(
      Shell.el('div', s.distributedValid ? 'status-banner status-ok' : 'status-banner status-bad', 'Distributed Integrity: ' + (s.distributedValid ? '100% VALID' : 'DRIFT'))
    );
    Shell.appendKV(selBody, [
      ['Events Pushed', String(s.pushedCount)],
      ['Remote Verified', s.remoteValid + ' / ' + s.remoteChecked],
      ['Total Stream Events', String(s.totalEvents)],
      ['Verified CAS Blobs', String(s.verifiedBlobs)]
    ]);
  }

  function renderPhaseSummary() {
    if (!sceneData) return;
    Shell.clear(phaseBody);

    if (activePhase === 1) {
      const p1 = sceneData.phases.phase1Veto;
      phaseTitle.textContent = 'Phase 1: Unhardened Service -> BMAD VETO';
      phaseBody.appendChild(Shell.el('div', 'status-banner status-bad', 'crew.veto emitted — Automatic L2 Blocking Directive active'));
      const chips = Shell.el('div', 'chip-row');
      p1.officers.forEach(function (o) {
        chips.appendChild(Shell.el('span', 'chip', o.role + ': ' + o.kpiScore + '/100'));
      });
      phaseBody.appendChild(chips);
      if (p1.peerChallenges.length > 0) {
        const ch = p1.peerChallenges[0];
        const p = Shell.el('p', '', 'Round 2 Peer Challenge: ' + ch.from + ' -> ' + ch.to + ' [' + ch.status + ']');
        p.style.marginTop = '0.55rem';
        phaseBody.appendChild(p);
      }
      renderOfficerDetail('security');
    } else if (activePhase === 2) {
      const p2 = sceneData.phases.phase2Evolution;
      phaseTitle.textContent = 'Phase 2: Counterfactual KPI-Gated Evolution';
      phaseBody.appendChild(
        Shell.el('div', 'status-banner status-info', 'Overbroad regex REJECTED (fp=' + p2.rejected.falsePositivesAfter + ') · CWE-78 rule PROMOTED (delta=+' + p2.promoted.delta + ')')
      );
      const p = Shell.el('p', '', 'KnowledgeEvolutionEngine evaluates candidate practices against virtual incident snapshots and clean samples before promotion.');
      p.style.marginTop = '0.5rem';
      phaseBody.appendChild(p);
      renderEvolutionDetail('promoted');
    } else {
      const p3 = sceneData.phases.phase3Consensus;
      phaseTitle.textContent = 'Phase 3: Hardened Service -> BMAD CONSENSUS';
      phaseBody.appendChild(Shell.el('div', 'status-banner status-ok', 'crew.consensus reached — Remediation L2 gates auto-superseded'));
      const chips = Shell.el('div', 'chip-row');
      p3.officers.forEach(function (o) {
        chips.appendChild(Shell.el('span', 'chip chip-ok', o.role + ': ' + o.kpiScore + '/100'));
      });
      phaseBody.appendChild(chips);
      renderOfficerDetail('engineering');
    }

    // Update 3D target heights & colors
    const party = activePartySnapshot();
    if (party) {
      party.officers.forEach(function (o) {
        const t = officerTowers[o.role];
        if (t) {
          t.targetHeight = Math.max(0.35, (o.kpiScore / 100) * 5.2);
          const col = o.kpiScore >= 85 ? 0x22c55e : o.kpiScore >= 50 ? 0xf59e0b : 0xef4444;
          t.mat.color.setHex(col);
          t.mat.emissive.setHex(col);
        }
      });
      const isConsensus = activePhase === 3 && party.consensusReached;
      const coreHex = activePhase === 2 ? 0x38bdf8 : isConsensus ? 0x22c55e : 0xef4444;
      if (rulingCoreMat) {
        rulingCoreMat.color.setHex(coreHex);
        rulingCoreMat.emissive.setHex(coreHex);
      }
      if (rulingRingMat) {
        rulingRingMat.color.setHex(coreHex);
      }
      if (challengeArcsGroup) {
        challengeArcsGroup.visible = activePhase === 1;
      }
    }
  }

  function setPhase(num) {
    activePhase = num;
    if (p1Btn) p1Btn.classList.toggle('active', num === 1);
    if (p2Btn) p2Btn.classList.toggle('active', num === 2);
    if (p3Btn) p3Btn.classList.toggle('active', num === 3);
    renderPhaseSummary();
  }

  function buildScene(data) {
    sceneData = data;

    // Render static Distributed Scrum Sync summary card
    const s = data.phases.phase4Sync;
    Shell.clear(syncBody);
    syncBody.appendChild(
      Shell.el('div', s.distributedValid ? 'status-banner status-ok' : 'status-banner status-bad', 'Synced ' + s.pushedCount + ' events · Verified ' + s.remoteValid + '/' + s.remoteChecked + ' remote records')
    );
    Shell.appendKV(syncBody, [
      ['Backend', s.adapter + ' (zero-network Kanban)'],
      ['Synced Seq', '#' + s.syncedUpToSeq],
      ['CAS Blobs', String(s.verifiedBlobs)]
    ]);

    if (p1Btn) p1Btn.addEventListener('click', function () { setPhase(1); });
    if (p2Btn) p2Btn.addEventListener('click', function () { setPhase(2); });
    if (p3Btn) p3Btn.addEventListener('click', function () { setPhase(3); });

    if (!stage) {
      setPhase(1);
      return;
    }

    const THREE = stage.THREE;
    stage.scene.add(new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 1.0));
    const key = new THREE.DirectionalLight(0xfffbeb, 0.9);
    key.position.set(10, 15, 10);
    stage.scene.add(key);

    // Command Bridge circular platform
    const deck = new THREE.Mesh(
      new THREE.CylinderGeometry(6.8, 7.2, 0.35, 36),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.3 })
    );
    deck.position.y = -0.18;
    stage.scene.add(deck);

    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(6.9, 0.06, 8, 64),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = 0.02;
    stage.scene.add(outerRing);

    // Central Ruling Core (VETO <-> CONSENSUS)
    rulingCoreMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.55,
      roughness: 0.2,
      metalness: 0.4
    });
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.92, 0), rulingCoreMat);
    core.position.set(0, 1.85, 0);
    core.userData.pickInfo = { kind: 'core' };
    stage.scene.add(core);

    rulingRingMat = new THREE.MeshBasicMaterial({ color: 0xef4444, wireframe: true });
    const coreRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 8, 36), rulingRingMat);
    coreRing.position.set(0, 1.85, 0);
    stage.scene.add(coreRing);

    // Three Hexagonal Officer Telemetry Towers arranged in a triangle
    const towerLayout = [
      { role: 'engineering', angle: -Math.PI / 2, x: 0, z: -3.8 },
      { role: 'security', angle: Math.PI / 6, x: 3.3, z: 1.9 },
      { role: 'bridge', angle: (5 * Math.PI) / 6, x: -3.3, z: 1.9 }
    ];

    const pickables = [core];

    towerLayout.forEach(function (cfg) {
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.28, 0.24, 6),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.45, roughness: 0.4 })
      );
      pedestal.position.set(cfg.x, 0.12, cfg.z);
      stage.scene.add(pedestal);

      const barMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.35
      });
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.76, 0.76, 1, 6), barMat);
      bar.position.set(cfg.x, 0.74, cfg.z);
      bar.userData.pickInfo = { kind: 'officer', role: cfg.role };
      stage.scene.add(bar);

      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.04, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xf8fafc })
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.set(cfg.x, 1.24, cfg.z);
      stage.scene.add(halo);

      pickables.push(bar);
      officerTowers[cfg.role] = {
        x: cfg.x,
        z: cfg.z,
        bar: bar,
        halo: halo,
        mat: barMat,
        currentHeight: 1.0,
        targetHeight: 1.0
      };
    });

    // Round 2 Peer Challenge Energy Arc (Security -> Bridge confirmed in Phase 1!)
    challengeArcsGroup = new THREE.Group();
    const secPos = new THREE.Vector3(3.3, 2.5, 1.9);
    const brPos = new THREE.Vector3(-3.3, 1.2, 1.9);
    const midPos = new THREE.Vector3(0, 4.1, 2.4);
    const arcCurve = new THREE.QuadraticBezierCurve3(secPos, midPos, brPos);
    const arcMesh = new THREE.Mesh(
      new THREE.TubeGeometry(arcCurve, 32, 0.06, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xf97316 })
    );
    challengeArcsGroup.add(arcMesh);
    stage.scene.add(challengeArcsGroup);

    // Phase 2 KPI Evolution Gate Satellites (Rejected vs Promoted!)
    evoRejectOrb = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.65, 0.65),
      new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.45 })
    );
    evoRejectOrb.position.set(-5.2, 3.2, -2.8);
    evoRejectOrb.userData.pickInfo = { kind: 'evolution', evo: 'rejected' };
    stage.scene.add(evoRejectOrb);
    pickables.push(evoRejectOrb);

    evoPromoteOrb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.55 })
    );
    evoPromoteOrb.position.set(5.2, 3.4, -2.8);
    evoPromoteOrb.userData.pickInfo = { kind: 'evolution', evo: 'promoted' };
    stage.scene.add(evoPromoteOrb);
    pickables.push(evoPromoteOrb);

    // Phase 4 Distributed Scrum Sync Node + Animated Sync Packet
    syncTargetPos = new THREE.Vector3(0, 1.1, 5.9);
    const syncNode = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x38bdf8, emissiveIntensity: 0.45 })
    );
    syncNode.position.copy(syncTargetPos);
    syncNode.userData.pickInfo = { kind: 'sync' };
    stage.scene.add(syncNode);
    pickables.push(syncNode);

    const syncConduit = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.LineCurve3(new THREE.Vector3(0, 1.85, 0), syncTargetPos),
        12,
        0.045,
        8,
        false
      ),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 })
    );
    stage.scene.add(syncConduit);

    syncPacketMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    stage.scene.add(syncPacketMesh);

    stage.setPickables(pickables, function (info) {
      if (info.kind === 'officer') {
        renderOfficerDetail(info.role);
      } else if (info.kind === 'evolution') {
        renderEvolutionDetail(info.evo);
      } else if (info.kind === 'sync') {
        renderSyncDetail();
      } else {
        renderPhaseSummary();
      }
    });

    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    setPhase(1);

    const coreOrigin = new THREE.Vector3(0, 1.85, 0);
    let clock = 0;
    let last = performance.now();
    function animate(now) {
      requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;

      // Smoothly interpolate officer KPI towers to their real scores!
      Object.keys(officerTowers).forEach(function (role) {
        const t = officerTowers[role];
        t.currentHeight += (t.targetHeight - t.currentHeight) * Math.min(1, dt * 5.5);
        t.bar.scale.y = t.currentHeight;
        t.bar.position.y = 0.24 + t.currentHeight * 0.5;
        t.halo.position.y = 0.24 + t.currentHeight + 0.14;
        t.halo.rotation.z = clock * 0.9;
      });

      core.rotation.y += dt * 0.7;
      coreRing.rotation.x = Math.sin(clock * 0.8) * 0.6;
      coreRing.rotation.y += dt * 0.5;

      evoRejectOrb.rotation.x += dt * 0.8;
      evoRejectOrb.rotation.y += dt * 0.6;
      evoPromoteOrb.rotation.y += dt * 1.1;
      evoPromoteOrb.position.y = 3.4 + Math.sin(clock * 2.2) * 0.18;

      const syncT = (clock * 0.55) % 1;
      syncPacketMesh.position.lerpVectors(coreOrigin, syncTargetPos, syncT);

      stage.updateCamera(dt);
      stage.renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(animate);
  }

  fetch('./data.json')
    .then(function (r) { return r.json(); })
    .then(buildScene)
    .catch(function () {
      phaseTitle.textContent = 'Run node examples/advanced-bmad-crew-evolution/run.mjs to generate data.json';
    });
})();
