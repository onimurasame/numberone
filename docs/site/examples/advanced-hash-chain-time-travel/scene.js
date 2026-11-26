(function () {
  'use strict';

  const Shell = window.N1ThreeShell;
  const canvas = document.getElementById('three-canvas');
  const stage = Shell.createStage(canvas, {
    radius: 15.5,
    theta: 0.55,
    phi: 1.12,
    targetX: 0,
    targetY: 0.4,
    targetZ: 0,
    minRadius: 6,
    maxRadius: 34,
    autoRotate: true
  });

  const verifiedBtn = document.getElementById('mode-verified-btn');
  const tamperBtn = document.getElementById('mode-tamper-btn');
  const orbitBtn = document.getElementById('orbit-toggle-btn');
  const resetBtn = document.getElementById('reset-cam-btn');
  const seqScrubber = document.getElementById('seq-scrubber');
  const seqLabel = document.getElementById('seq-label');
  const integrityTitle = document.getElementById('integrity-title');
  const integrityBody = document.getElementById('integrity-body');
  const eventTitle = document.getElementById('event-title');
  const eventBody = document.getElementById('event-body');
  const proofsBody = document.getElementById('proofs-body');

  let sceneData = null;
  let tamperedMode = false;
  let replaySeq = 8;
  const nodeVisuals = [];
  const linkVisuals = [];
  const photonPulses = [];
  let coreWireframe = null;
  let coreInnerMat = null;
  let blobSatellite = null;
  let blobAnchorPos = null;

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
    stage.scene.background = new THREE.Color(dark ? 0x0b1019 : 0xf4efe7);
    stage.scene.fog = new THREE.Fog(dark ? 0x0b1019 : 0xf4efe7, 22, 52);
  }
  Shell.initTheme(applyTheme);

  function renderIntegrityPanel() {
    if (!sceneData) return;
    Shell.clear(integrityBody);
    const tp = sceneData.tamperProof;
    if (tamperedMode) {
      integrityTitle.textContent = 'FAIL-CLOSED: Hash Chain Broken at seq #' + tp.tamperedSeq;
      integrityBody.appendChild(
        Shell.el('div', 'status-banner status-bad', 'TAMPER DETECTED: ' + tp.firstError)
      );
      const p = Shell.el('p', '', 'Mutating a single byte in ' + tp.tamperedFile + ' invalidates its canonical SHA-256 hash and breaks every downstream prevHash link.');
      p.style.marginTop = '0.5rem';
      integrityBody.appendChild(p);
    } else {
      integrityTitle.textContent = 'VERIFIED: Contiguous SHA-256 Hash Chain';
      integrityBody.appendChild(
        Shell.el(
          'div',
          'status-banner status-ok',
          'VALID · ' + sceneData.cleanIntegrity.totalEvents + ' events · ' + sceneData.cleanIntegrity.verifiedBlobs + ' CAS blob(s) verified'
        )
      );
      Shell.appendKV(integrityBody, [
        ['GENESIS_HASH', sceneData.genesisHash.slice(0, 18) + '...'],
        ['CAS Coverage', sceneData.cleanIntegrity.fallbackCoverageValid ? '100% intact' : 'drift']
      ]);
    }
  }

  function renderEventPanel(node) {
    if (!node) return;
    eventTitle.textContent = 'seq #' + node.seq + ' · ' + node.type;
    Shell.clear(eventBody);
    eventBody.appendChild(Shell.el('p', '', node.summary));

    const chips = Shell.el('div', 'chip-row');
    chips.appendChild(Shell.el('span', 'chip chip-info', 'harness: ' + node.harness));
    chips.appendChild(Shell.el('span', 'chip', 'actor: ' + node.actorKind));
    if (node.blobCount > 0) {
      chips.appendChild(Shell.el('span', 'chip chip-ok', node.blobCount + ' CAS Blob(s)'));
    }
    eventBody.appendChild(chips);

    const cp = node.projectionCheckpoint;
    Shell.appendKV(eventBody, [
      ['ULID', node.id],
      ['prevHash', node.prevHash.slice(0, 18) + '...'],
      ['hash', node.hash.slice(0, 18) + '...'],
      ['snapshotDigest', cp.snapshotDigest.slice(0, 18) + '...'],
      ['State Counts', 'lessons=' + cp.lessonsCount + ', directives=' + cp.activeDirectives + ', crashes=' + cp.unresolvedCrashes + ', deadEnds=' + cp.deadEndsCount]
    ]);

    if (node.blobRefs && node.blobRefs.length > 0) {
      const b = node.blobRefs[0];
      const p = Shell.el('p', '', 'CAS Blob URI: ' + b.uri + ' (' + b.byteSize + ' bytes · ' + b.contentType + ')');
      p.style.marginTop = '0.55rem';
      eventBody.appendChild(p);
    }
  }

  function renderProofsPanel() {
    if (!sceneData || !proofsBody) return;
    Shell.clear(proofsBody);
    const rp = sceneData.redactionProof;
    const ap = sceneData.arbitrationProof;
    const redStatus = Shell.el(
      'div',
      rp.leakedRawGitHubToken || rp.leakedRawAwsKey ? 'status-banner status-bad' : 'status-banner status-ok',
      'O(n) Secret Redaction (seq #' + rp.eventSeq + '): 0 raw tokens written to disk'
    );
    redStatus.style.marginBottom = '0.5rem';
    proofsBody.appendChild(redStatus);
    proofsBody.appendChild(Shell.el('p', '', 'Stored summary: ' + rp.redactedSummary));

    Shell.appendKV(proofsBody, [
      ['Negated Clause', ap.compliantNegation.verdict + ' (' + ap.compliantNegation.conflicts + ' conflicts)'],
      ['Real Violation', ap.affirmativeViolation.verdict + ' (' + ap.affirmativeViolation.level + ')']
    ]);
  }

  function syncVisualStates() {
    if (!sceneData) return;
    const tamperSeq = sceneData.tamperProof.tamperedSeq;
    if (seqLabel) seqLabel.textContent = 'Replay --until-seq ' + replaySeq + ' / ' + sceneData.chainNodes.length;

    nodeVisuals.forEach(function (nv) {
      const inWindow = nv.node.seq <= replaySeq;
      const isBroken = tamperedMode && nv.node.seq >= tamperSeq;
      const baseColor = isBroken ? 0xef4444 : nv.baseHex;
      nv.mat.color.setHex(baseColor);
      nv.mat.emissive.setHex(baseColor);
      nv.mat.emissiveIntensity = inWindow ? (isBroken ? 0.65 : 0.35) : 0.05;
      nv.mat.opacity = inWindow ? 0.96 : 0.22;
      nv.mesh.scale.setScalar(nv.node.seq === replaySeq ? 1.24 : 1.0);
    });

    linkVisuals.forEach(function (lv) {
      const inWindow = lv.toSeq <= replaySeq;
      const isBroken = tamperedMode && lv.toSeq >= tamperSeq;
      lv.mat.color.setHex(isBroken ? 0xef4444 : 0x38bdf8);
      lv.mat.opacity = inWindow ? 0.85 : 0.14;
    });

    if (coreInnerMat) {
      const brokenInWindow = tamperedMode && replaySeq >= tamperSeq;
      coreInnerMat.color.setHex(brokenInWindow ? 0xef4444 : 0x22c55e);
      coreInnerMat.emissive.setHex(brokenInWindow ? 0xef4444 : 0x22c55e);
    }

    const activeNode = sceneData.chainNodes.find(function (n) { return n.seq === replaySeq; });
    if (activeNode) renderEventPanel(activeNode);
    renderIntegrityPanel();
  }

  function colorForEventType(type) {
    if (type.startsWith('exec.crash')) return 0xf97316;
    if (type.startsWith('lesson.')) return 0x22c55e;
    if (type.startsWith('directive.')) return 0xf59e0b;
    if (type.startsWith('attempt.failed')) return 0xef4444;
    return 0x38bdf8;
  }

  function buildScene(data) {
    sceneData = data;
    replaySeq = data.chainNodes.length;
    renderProofsPanel();

    if (seqScrubber) {
      seqScrubber.max = String(data.chainNodes.length);
      seqScrubber.value = String(replaySeq);
      seqScrubber.addEventListener('input', function () {
        replaySeq = Number(seqScrubber.value);
        syncVisualStates();
      });
    }

    if (verifiedBtn && tamperBtn) {
      verifiedBtn.addEventListener('click', function () {
        tamperedMode = false;
        verifiedBtn.classList.add('active');
        tamperBtn.classList.remove('active');
        syncVisualStates();
      });
      tamperBtn.addEventListener('click', function () {
        tamperedMode = true;
        tamperBtn.classList.add('active');
        verifiedBtn.classList.remove('active');
        syncVisualStates();
      });
    }

    if (!stage) {
      syncVisualStates();
      return;
    }

    const THREE = stage.THREE;
    stage.scene.add(new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 0.95));
    const key = new THREE.DirectionalLight(0xfffbeb, 0.9);
    key.position.set(10, 14, 10);
    stage.scene.add(key);

    // Subtle polar base ring
    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(4.4, 4.55, 64),
      new THREE.MeshBasicMaterial({ color: 0x334155, side: THREE.DoubleSide })
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = -4.2;
    stage.scene.add(baseRing);

    // Central Deterministic Replay Projection Core
    coreInnerMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x22c55e,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.35
    });
    const coreSphere = new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 1), coreInnerMat);
    stage.scene.add(coreSphere);

    coreWireframe = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.65, 1),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0.38 })
    );
    stage.scene.add(coreWireframe);

    // Helical SHA-256 Event Chain
    const radius = 4.2;
    const total = data.chainNodes.length;
    const positions = [];
    const pickables = [];

    data.chainNodes.forEach(function (node, idx) {
      const angle = idx * 0.88;
      const y = -3.4 + (idx / Math.max(1, total - 1)) * 7.2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const pos = new THREE.Vector3(x, y, z);
      positions.push(pos);

      const baseHex = colorForEventType(node.type);
      const mat = new THREE.MeshStandardMaterial({
        color: baseHex,
        emissive: baseHex,
        emissiveIntensity: 0.35,
        roughness: 0.28,
        metalness: 0.3,
        transparent: true,
        opacity: 0.95
      });

      const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.72, 6), mat);
      prism.position.copy(pos);
      prism.userData.pickInfo = node;
      stage.scene.add(prism);
      pickables.push(prism);
      nodeVisuals.push({ node: node, mesh: prism, mat: mat, baseHex: baseHex });

      // Connect prevHash -> hash link conduit
      if (idx > 0) {
        const prevPos = positions[idx - 1];
        const curve = new THREE.LineCurve3(prevPos, pos);
        const linkMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 });
        const linkMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.055, 8, false), linkMat);
        stage.scene.add(linkMesh);
        linkVisuals.push({ toSeq: node.seq, mesh: linkMesh, mat: linkMat });

        const photon = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0xfef08a })
        );
        stage.scene.add(photon);
        photonPulses.push({ from: prevPos, to: pos, mesh: photon, offset: idx * 0.17 });
      }

      // Orbiting Content-Addressed Storage (CAS) Blob Satellite for events carrying fallbackBlobs!
      if (node.blobCount > 0) {
        blobAnchorPos = pos.clone();
        const blobMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xf59e0b,
          emissiveIntensity: 0.5,
          roughness: 0.2,
          metalness: 0.6
        });
        blobSatellite = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38, 0), blobMat);
        blobSatellite.position.set(pos.x + 1.5, pos.y + 0.3, pos.z);
        blobSatellite.userData.pickInfo = node;
        stage.scene.add(blobSatellite);
        pickables.push(blobSatellite);
      }
    });

    stage.setPickables(pickables, function (pickedNode) {
      replaySeq = pickedNode.seq;
      if (seqScrubber) seqScrubber.value = String(replaySeq);
      syncVisualStates();
    });

    applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    syncVisualStates();

    let clock = 0;
    let last = performance.now();
    function animate(now) {
      requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt;

      coreSphere.rotation.y += dt * 0.45;
      coreWireframe.rotation.y -= dt * 0.28;
      coreWireframe.rotation.x += dt * 0.12;

      nodeVisuals.forEach(function (nv, idx) {
        nv.mesh.rotation.y = clock * 0.5 + idx * 0.4;
      });

      photonPulses.forEach(function (p) {
        const t = (clock * 0.65 + p.offset) % 1;
        p.mesh.position.lerpVectors(p.from, p.to, t);
        p.mesh.visible = !tamperedMode;
      });

      if (blobSatellite && blobAnchorPos) {
        blobSatellite.position.set(
          blobAnchorPos.x + Math.cos(clock * 1.4) * 1.35,
          blobAnchorPos.y + Math.sin(clock * 2.1) * 0.25,
          blobAnchorPos.z + Math.sin(clock * 1.4) * 1.35
        );
        blobSatellite.rotation.y += dt * 1.1;
      }

      stage.updateCamera(dt);
      stage.renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(animate);
  }

  fetch('./data.json')
    .then(function (r) { return r.json(); })
    .then(buildScene)
    .catch(function () {
      integrityTitle.textContent = 'Run node examples/advanced-hash-chain-time-travel/run.mjs to generate data.json';
    });
})();
