(function () {
  'use strict';

  // =========================================================================
  // 1. INTERACTIVE "A DAY WITH NUMBER ONE" STORY DATA (PLAIN ENGLISH)
  // =========================================================================
  const DAY_STORY_STEPS = [
    {
      id: 'step-1',
      shortLabel: '1. Turn It On',
      title: 'Step 1 — Open a Fresh Project Folder & Turn On Memory',
      quote: '"Before we write a single note or change a file, Number One sets up a tidy, private notebook inside the folder."',
      whatHappens: 'You start a new school science project, a club game, or a work repository. With one quick command, Number One attaches itself to the folder.',
      whatN1Does: 'Creates a hidden .numberone/ folder right on your computer, snapshots the starting files, and drops polite instruction notes so any AI helper knows to check your notebook first.',
      whyItMatters: 'You never have to sign up for a website or send private files to the cloud. Everything starts clean, private, and ready.',
      commandLabel: 'bash · attach & start watching',
      command: 'n1 attach . --name "My Project"\nn1 watch'
    },
    {
      id: 'step-2',
      shortLabel: '2. Save Ideas & Dead Ends',
      title: 'Step 2 — Try Bold Ideas Without Repeating Old Mistakes',
      quote: '"Good projects always have experiments that flop. Saving dead ends is just as valuable as saving breakthroughs."',
      whatHappens: 'You test an approach — maybe a paperclip weight on a paper airplane, or a new library in your app — and it does not work out.',
      whatN1Does: 'Records your thinking and marks the failed approach as a Dead End in the permanent diary, while scrubbing out any accidental passwords automatically.',
      whyItMatters: 'Tomorrow, neither you nor an AI assistant will waste an hour trying the exact same broken approach again.',
      commandLabel: 'bash · record thinking & dead ends',
      command: 'n1 think "Trying a lighter design to improve speed"\nn1 dead-end --approach "Removed input check" --reason "Caused crashes on empty input"'
    },
    {
      id: 'step-3',
      shortLabel: '3. Hit a Snag & Learn',
      title: 'Step 3 — Turn Every Fixed Mistake Into a Reusable Lesson',
      quote: '"Whenever something breaks and you later fix it, Number One connects the dots and writes down the lesson for you."',
      whatHappens: 'A test fails or an experiment crashes. You edit a file, re-run your check, and suddenly everything turns green!',
      whatN1Does: 'Sees the failure, sees which files you changed in between, sees the green pass, and automatically creates a durable Lesson Learned linking the error to the fix.',
      whyItMatters: 'Your project literally gets smarter every time you solve a problem — building institutional memory automatically.',
      commandLabel: 'bash · run checks & auto-capture lessons',
      command: 'n1 exec -- npm test'
    },
    {
      id: 'step-4',
      shortLabel: '4. Switch AI Helpers',
      title: 'Step 4 — Start a New Chat or Switch Tools Without Starting Over',
      quote: '"Chat windows forget. Your project notebook never does — and your ground rules always outrank a fresh chat guess."',
      whatHappens: 'Your AI chat hits its memory limit, or you switch to a different coding tool (or a teammate opens the project on Monday).',
      whatN1Does: 'Hands the new session a clear summary of your project, surfaces relevant past lessons, and blocks any suggestion that breaks your ground rules.',
      whyItMatters: 'Zero repetitive re-explaining, zero forgotten rules, and zero tool lock-in across 24+ AI tools (or no AI at all).',
      commandLabel: 'bash · brief any new session & check a plan',
      command: 'n1 brief\nn1 arbitrate --action "Check if my new plan follows all project rules"'
    },
    {
      id: 'step-5',
      shortLabel: '5. Check & Share Story',
      title: 'Step 5 — Run the 3 Project Helpers & Print Your Project Story',
      quote: '"Ready to hand in your project or launch to users? Check quality with three specialists and generate a chaptered documentary."',
      whatHappens: 'Demo day, science fair judging, or release day arrives. You want confidence that nothing unsafe or broken was overlooked.',
      whatN1Does: 'Convenes the Builder, Safety, and Launch Helpers for a 0–100 checkup, verifies the tamper-evident seal on your history, and writes a chapter-by-chapter Project Documentary.',
      whyItMatters: 'You walk away with both a stronger, safer project AND a clear story showing how you built it from day one.',
      commandLabel: 'bash · run 3 helpers & write your documentary',
      command: 'n1 party --topic "Ready to share our project?"\nn1 documentary --out my-project-story.md'
    }
  ];

  // =========================================================================
  // 2. KIDS & SCHOOL PROJECTS LAB DATA (VERIFIED RUNNABLE EXAMPLES)
  // =========================================================================
  const KIDS_PROJECTS = [
    {
      id: 'science-fair',
      mode: 'cli',
      modeLabel: 'No-Code Commands',
      grades: 'Grades 5–12',
      subject: 'Science Fair / Lab Notebook',
      title: 'Science Fair Experiment Lab Notebook',
      summary: 'Testing which paper airplane fold (or plant fertilizer, or volcano mix) works best? Track every hypothesis, failed test, discovery, and design choice — then export a neat report for your tri-fold board!',
      steps: [
        'Create a folder for your science fair project and run n1 attach . to start your un-erasable lab notebook.',
        'Record your hypothesis with n1 think, your flopped trials with n1 dead-end, and your breakthroughs with n1 lesson.',
        'Record why you chose your final design with n1 decision.',
        'Run n1 documentary --out science-fair-lab-notebook.md to generate a chapter-by-chapter report ready to print!'
      ],
      codeLabel: 'bash · paper-airplane-fair (no coding needed!)',
      code: '# 1. Start your Science Fair lab notebook\nmkdir paper-airplane-fair && cd paper-airplane-fair\nn1 attach . --name "Paper Airplane Science Fair"\n\n# 2. Write down your hypothesis\nn1 think "Hypothesis: Adding small upturned wingtips will keep the dart glider flying straighter." --tags science,hypothesis\n\n# 3. Record a trial that flopped (great scientists log dead ends!)\nn1 dead-end \\\n  --approach "Taped two pennies to the tail of the plane" \\\n  --reason "Plane nose-upped, stalled, and dropped after 1.2 meters" \\\n  --tags flight-test\n\n# 4. Save the big discovery you made\nn1 lesson \\\n  --title "Put weight near the nose, not the tail" \\\n  --problem "Plane stalled backward in Trial #2" \\\n  --root-cause "Center of gravity was too far behind the wings" \\\n  --resolution "One paperclip on the front nose crease flew 9.4 meters!" \\\n  --prevention "Always balance near the front third of the wing before throwing" \\\n  --tags flight-test,aerodynamics\n\n# 5. Record your final choice & print your Science Fair Report!\nn1 decision \\\n  --title "Submit the Heavy-Nose Dart for the finals" \\\n  --decision "Dart fold with 1 nose paperclip and 1cm wingtips" \\\n  --rationale "Averaged 9.4 meters across 10 throws — 3 meters farther than the glider" \\\n  --rejected "Tail-weighted dart,Wide flat glider"\n\nn1 documentary --out science-fair-lab-notebook.md',
      teacherNote: 'Print or attach science-fair-lab-notebook.md with your display board! Judges and teachers love seeing real timestamps, failed hypotheses, and step-by-step scientific thinking — not just the final poster.'
    },
    {
      id: 'coding-club-game',
      mode: 'cli',
      modeLabel: 'No-Code Commands',
      grades: 'Grades 6–12',
      subject: 'Coding Club / Game Dev',
      title: 'Coding Club Video Game + AI Helper Shield',
      summary: 'Building an Asteroid Dodger or web game with an AI coding buddy? Stop fresh AI chats from breaking your keyboard controls, auto-save bug fixes, and run the 3 Project Helpers before Friday Demo Day!',
      steps: [
        'Attach Number One to your game folder and start n1 watch in the background.',
        'Add a blocking rule (n1 directive) so nobody accidentally breaks Chromebook arrow-key controls or adds unsafe eval() calls.',
        'Test ideas before editing code using n1 arbitrate — watch Number One block unsafe plans automatically!',
        'Run n1 exec -- npm test to auto-capture bug fix lessons, then run n1 party before class Demo Day.'
      ],
      codeLabel: 'bash · my-space-game (terminal + AI helper protection)',
      code: '# 1. Turn on Number One inside your game folder\ncd my-space-game\nn1 attach . --name "Asteroid Dodger Game"\nn1 watch\n\n# 2. Protect your game with a ground rule that outlasts AI chat resets\nn1 directive \\\n  --title "Keep arrow-key controls working and avoid eval" \\\n  --directive "Keep keyboard arrow keys working on school Chromebooks and never use eval()." \\\n  --rationale "Not all school laptops have touchscreens, and eval() is unsafe." \\\n  --forbid "eval(" \\\n  --severity blocking\n\n# 3. Check an idea BEFORE editing your game code!\nn1 arbitrate --action "Parse high scores with eval(savedScore)"\n# -> BLOCK! Number One protects your rule automatically.\n\nn1 arbitrate --action "Parse high scores with JSON.parse(savedScore)"\n# -> APPROVE! Safe to build.\n\n# 4. Run your game tests & ask the 3 Helpers before Demo Day\nn1 exec -- npm test\nn1 party --topic "Is Asteroid Dodger ready for Friday Coding Club Demo Day?"\nn1 watch stop',
      teacherNote: 'Even if you switch from one AI assistant to another halfway through the week, running n1 brief gives the new chat your exact game rules and past bug fixes in one shot!'
    },
    {
      id: 'study-buddy-lib',
      mode: 'library',
      modeLabel: 'JavaScript Library',
      grades: 'Grades 7–12',
      subject: 'CS Class / JavaScript App',
      title: 'Build a "Smart Study Buddy" App (JavaScript Library)',
      summary: 'Use numberone as a real JavaScript library inside your own school coding project! In ~35 lines of code, build a Study Buddy that saves tricky homework mistakes, reminds you before a quiz, and writes a printable study journal.',
      steps: [
        'Run: mkdir my-study-app && cd my-study-app && npm init -y && npm pkg set type=module && npm install numberone',
        'Save the code below as study-buddy.mjs.',
        'Run node study-buddy.mjs in your terminal to see your Study Buddy recall your exact fraction tips and past traps!',
        'Extra credit: Add Node readline prompts so classmates can add lessons for science, history, or spelling too!'
      ],
      codeLabel: 'javascript · study-buddy.mjs (runnable with node study-buddy.mjs)',
      code: 'import { NumberOneAgent } from \'numberone\';\n\n// 1. Create a study notebook folder\nconst buddy = new NumberOneAgent(\'./my-study-notebook\');\nbuddy.attach({\n  workspaceName: \'Math & Science Study Buddy\',\n  installHooks: false,\n  installShims: false\n});\n\n// 2. Log what you are studying today\nbuddy.recordThinking({\n  thought: \'Practicing adding fractions for Friday math quiz!\',\n  tags: [\'math\', \'fractions\']\n});\n\n// 3. Save a common mistake so you stop falling for it\nbuddy.recordFailedAttempt({\n  approach: \'Added top and bottom numbers straight across (1/2 + 1/3 = 2/5)\',\n  reason: \'Wrong! You must find a common denominator first.\',\n  tags: [\'math\', \'fractions\']\n});\n\n// 4. Save a reusable Lesson Learned\nbuddy.captureLesson({\n  title: \'Match the bottom numbers before adding fractions\',\n  problem: \'Missed 1/2 + 1/3 on Practice Sheet #2\',\n  rootCause: \'Added numerators and denominators directly\',\n  resolution: \'Convert 1/2 -> 3/6 and 1/3 -> 2/6, then add tops = 5/6\',\n  preventionRule: \'Always check if denominators match FIRST before adding!\',\n  failedApproaches: [\'Adding tops and bottoms straight across\'],\n  tags: [\'math\', \'fractions\'],\n  severity: \'high\'\n});\n\n// 5. Right before your quiz, ask your Study Buddy for reminders!\nconst advice = buddy.consult({ intent: \'adding fractions quiz\', tags: [\'math\', \'fractions\'] });\nfor (const match of advice.lessons) {\n  console.log(\'Lesson:\', match.lesson.title);\n  console.log(\'Tip:   \', match.lesson.preventionRule);\n}\n\n// 6. Generate a chapter-by-chapter study journal!\nconst story = buddy.buildDocumentary();\nconsole.log(`Built a ${story.chapters.length}-chapter Study Documentary!`);',
      teacherNote: 'Students practice modern ES modules, object APIs, and real-world software engineering concepts (event logs, querying memory, and generating Markdown reports) in a fun, personal project!'
    },
    {
      id: 'robotics-lib',
      mode: 'library',
      modeLabel: 'JavaScript Library',
      grades: 'Grades 7–12',
      subject: 'Robotics / Maker Club',
      title: 'Robotics Safety Guard & Time Machine (JavaScript Library)',
      summary: 'In FIRST Robotics, VEX, or Arduino club? Build a real digital Engineering Notebook with the numberone library that tracks build tasks, automatically blocks unsafe motor speeds, time-travels to earlier build steps, and verifies its tamper-evident seal!',
      steps: [
        'Set up a project folder with npm init -y && npm pkg set type=module && npm install numberone.',
        'Save the code below as robot-journal.mjs and run node robot-journal.mjs.',
        'Watch arbitrate() BLOCK setSpeed(100) while approving setSpeed(75)!',
        'Watch replay({ untilSeq: 3 }) time-travel back to step #3 and verifyIntegrity(false) check your notebook seal!'
      ],
      codeLabel: 'javascript · robot-journal.mjs (runnable with node robot-journal.mjs)',
      code: 'import { NumberOneAgent } from \'numberone\';\n\n// 1. Start a robotics team engineering notebook\nconst robot = new NumberOneAgent(\'./robotics-notebook\');\nrobot.attach({\n  workspaceName: \'RoboHawks Line-Follower Bot\',\n  installHooks: false,\n  installShims: false\n});\n\n// 2. Track a build task for the team\nconst sensorTask = robot.openIssue({\n  title: \'Calibrate line-following light sensor for gym lights\',\n  description: \'Measure white tape vs. black track readings under gym lamps\',\n  kind: \'task\',\n  priority: \'high\',\n  tags: [\'sensors\', \'robotics\']\n});\n\n// 3. Enforce an indoor motor speed safety rule!\nrobot.issueDirective({\n  title: \'Indoor motor speed safety cap\',\n  directive: \'Keep motor power at or below 80% during indoor table tests.\',\n  rationale: \'At 100% power the robot skidded off the test table last week.\',\n  forbiddenPatterns: [\'MOTOR_POWER=100\', \'setSpeed\\\\(100\\\\)\'],\n  severity: \'blocking\',\n  scopeTags: [\'motors\']\n});\n\n// 4. Test two ideas against the safety rule\nconst risky = robot.arbitrate({ action: \'Test with setSpeed(100) on classroom table\', intent: \'Speed test\', tags: [\'motors\'] });\nconst safe  = robot.arbitrate({ action: \'Test with setSpeed(75) for smooth turns\', intent: \'Speed test\', tags: [\'motors\'] });\nconsole.log(\'Risky plan:\', risky.verdict); // BLOCK\nconsole.log(\'Safe plan: \', safe.verdict);  // APPROVE_WITH_CONDITIONS\n\n// 5. Mark the calibration task finished!\nrobot.resolveIssue(String(sensorTask.payload.issueId), \'Threshold calibrated to 420!\');\n\n// 6. Time-travel back to step #3 & verify the tamper-proof notebook seal!\nconst past = robot.replay({ untilSeq: 3 });\nconst seal = await robot.verifyIntegrity(false);\nconsole.log(`Time-travel step #${past.lastSeq} tasks:`, Object.keys(past.issues).length);\nconsole.log(`Notebook seal valid? ${seal.valid} (${seal.totalEvents} verified entries)`);',
      teacherNote: 'Robotics competitions award special Engineering Notebook points for verified design iteration and safety testing. Export robot.buildDocumentary().markdown right into your competition binder!'
    },
    {
      id: 'group-project',
      mode: 'cli',
      modeLabel: 'No-Code Commands',
      grades: 'Grades 5–12',
      subject: 'History / Book / Group Work',
      title: 'Group School Project & Fairness Log',
      summary: 'Working with 2–4 classmates on a history presentation, book report, or class website? Track who is doing each task, record big group decisions so nobody forgets, and create a teamwork timeline to turn in!',
      steps: [
        'Run n1 attach . inside your group project folder.',
        'Add tasks for each teammate with n1 issue open --title "..." and check the open list anytime with n1 issue.',
        'Record how your group chose its topic or presentation split with n1 decision.',
        'Mark finished tasks with n1 issue resolve <id> and generate group-project-journey.md with n1 documentary!'
      ],
      codeLabel: 'bash · ancient-egypt-project (team task & decision log)',
      code: '# 1. Start your group project log\nmkdir ancient-egypt-project && cd ancient-egypt-project\nn1 attach . --name "Ancient Egypt Group Project"\n\n# 2. Assign clear tasks for each teammate\nn1 issue open --title "Write pyramid engineering timeline (Maya)" --kind task --priority high\nn1 issue open --title "Draw Nile River map poster (Leo)" --kind task --priority high\nn1 issue open --title "Build 5-question class trivia game (Sam)" --kind story --priority medium\n\n# 3. Record big group decisions so everyone stays on the same page\nn1 decision \\\n  --title "Split our 6-minute talk into 3 equal parts" \\\n  --decision "2 min on pyramids, 2 min on Nile farming, 2 min live class trivia" \\\n  --rationale "Everyone gets equal speaking time and the class gets to play!" \\\n  --rejected "Reading a 10-page essay aloud"\n\n# 4. View tasks anytime, resolve them when done, and export the team story!\nn1 issue\nn1 documentary --out group-project-journey.md',
      teacherNote: 'Teachers can immediately see fair task distribution, thoughtful group decision-making, and completed milestones in group-project-journey.md — with zero accounts or external apps needed!'
    }
  ];

  // =========================================================================
  // 3. ARCHIFY INTERACTIVE ARTIFACTS (ALL 16 COMPILED DELIVERABLES)
  // =========================================================================
  const ARCHIFY_ARTIFACTS = [
    {
      id: 'arch-overview',
      badge: 'architecture',
      label: 'System Overview',
      path: './archify/system-overview.html',
      caption: 'Master System of Record topology with 19 pinned src/ citations, Semantic Passports, and cross-diagram drilldowns.'
    },
    {
      id: 'arch-explainer',
      badge: 'explainer (4 styles)',
      label: '1-Page Explainer',
      path: './archify/how-numberone-works-explainer.html',
      caption: 'Conclusion-first interactive Explainer with live Clean / Editorial / Product / Swiss style switcher, @code tour, KPI chart, and checklist.'
    },
    {
      id: 'arch-story',
      badge: 'story + video',
      label: 'Narrated Walkthrough',
      path: './archify/system-overview-story.html',
      caption: 'Guided 3-scene audio/caption walkthrough with live edge tracing, pinned code highlights, and 1080p60 WebM/MP4 video export.'
    },
    {
      id: 'arch-stage',
      badge: 'choreography',
      label: 'Multi-View Stage',
      path: './archify/choreography-stage.html',
      caption: 'Declarative multi-diagram choreography morphing shared components across Architecture -> Party Workflow -> Dataflow with KPI deltas.'
    },
    {
      id: 'arch-workflow',
      badge: 'workflow v2',
      label: 'BMAD Party Workflow',
      path: './archify/bmad-party-workflow.html',
      caption: '3-Round BMAD Party Mode audit, deterministic Round 2 peer challenge verification, precedent correlation, and automatic L2 veto.'
    },
    {
      id: 'arch-sequence',
      badge: 'sequence',
      label: 'MCP Arbitration',
      path: './archify/mcp-arbitration-sequence.html',
      caption: 'Stdio JSON-RPC 2.0 MCP consultation, L1-L4 precedence arbitration, SHA-256 append, and Scrum sync with JSON payload samples.'
    },
    {
      id: 'arch-dataflow',
      badge: 'dataflow',
      label: 'Stream & Redaction',
      path: './archify/stream-sync-dataflow.html',
      caption: '5-stage data lineage from workspace sensors through O(n) secret redaction into .numberone/stream/, CAS blobs, and Scrum mirrors.'
    },
    {
      id: 'arch-lifecycle',
      badge: 'lifecycle v3',
      label: 'KPI Evolution',
      path: './archify/directive-evolution-lifecycle.html',
      caption: 'State machine of KPI-gated officer practice promotion (delta > 0), live regression auditing, and clean rollback.'
    },
    {
      id: 'arch-erd',
      badge: 'erd',
      label: 'Physical Data ERD',
      path: './archify/sor-data-model-erd.html',
      caption: 'Entity-relationship schema of stream_events, fallback_blobs, lessons, directives, issues, and sync_ledger.'
    },
    {
      id: 'arch-class',
      badge: 'class',
      label: 'TypeScript Classes',
      path: './archify/core-classes.html',
      caption: 'Object-oriented composition across NumberOneAgent, NumberOneMcpServer, StreamStore, PartyModeOrchestrator, and PersistenceFabric.'
    },
    {
      id: 'arch-tree',
      badge: 'tree',
      label: 'Capability Tree',
      path: './archify/repository-capability-tree.html',
      caption: 'Strict 6-package containment hierarchy of src/core, persistence, watchers, crew, harness, and utils.'
    },
    {
      id: 'arch-timeline',
      badge: 'timeline',
      label: 'Crash-to-Lesson',
      path: './archify/crash-to-lesson-timeline.html',
      caption: 'Proportional multi-lane timeline showing cross-harness crash capture, dead-end logging, harness handoff, and auto-lesson synthesis.'
    },
    {
      id: 'arch-waterfall',
      badge: 'waterfall',
      label: 'Execution Spans',
      path: './archify/party-sync-waterfall.html',
      caption: 'Millisecond span breakdown of ReplayEngine digest verification, 3 officer audits, Scrum push, and cryptographic verification.'
    },
    {
      id: 'arch-compare',
      badge: 'compare',
      label: 'Architecture Diff',
      path: './archify/architecture-comparison.html',
      caption: 'Before/after architectural comparison contrasting a local-only baseline curator with Number One v1.0.0.'
    },
    {
      id: 'arch-diagnosis',
      badge: 'code-analysis',
      label: 'Code Diagnosis & 3D Atlas',
      path: './archify/code-analysis/repo.analysis.html',
      caption: 'Source-backed TypeScript repository diagnosis workbench with coupling metrics, radial star map, 3D dependency Atlas, and AI tasks.'
    },
    {
      id: 'sample-glider-timeline',
      badge: 'kids sample · timeline',
      label: 'Kids: Science Fair Timeline',
      path: './archify/examples/kids-science-fair-glider-timeline.html',
      caption: 'Kids Sample 1 (Archify Timeline): Hypothesis -> Tail-Weight Dead-End -> Balance Lesson -> Winning Wingtip Dart -> Three.js 3D Runway.'
    },
    {
      id: 'sample-glider-explainer',
      badge: 'kids sample · explainer',
      label: 'Kids: Science Fair Explainer',
      path: './archify/examples/kids-science-fair-glider-explainer.html',
      caption: 'Kids Sample 1 (4-Style Explainer): Pinned to examples/kids-science-fair-glider/run.mjs with distance bar chart and verification checklist.'
    },
    {
      id: 'sample-robotics-sequence',
      badge: 'kids sample · sequence',
      label: 'Kids: Robotics Safety Sequence',
      path: './archify/examples/kids-robotics-arena-sequence.html',
      caption: 'Kids Sample 2 (Archify Sequence): L2 blocking motor speed cap (<= 80%), arbitrate() BLOCK vs APPROVE, and Three.js laser gate sync.'
    },
    {
      id: 'sample-robotics-explainer',
      badge: 'kids sample · explainer',
      label: 'Kids: Robotics Explainer',
      path: './archify/examples/kids-robotics-arena-explainer.html',
      caption: 'Kids Sample 2 (4-Style Explainer): Pinned to examples/kids-robotics-arena/run.mjs showing negation-aware arbitration & time-travel.'
    },
    {
      id: 'sample-hashchain-dataflow',
      badge: 'adv sample · dataflow',
      label: 'Adv: Hash-Chain Dataflow',
      path: './archify/examples/advanced-hash-chain-time-travel-dataflow.html',
      caption: 'Advanced Sample 1 (Archify Dataflow): O(n) secret redaction -> SHA-256 event files -> CAS blobs -> ReplayEngine -> 1-byte fail-closed tamper proof.'
    },
    {
      id: 'sample-hashchain-explainer',
      badge: 'adv sample · explainer',
      label: 'Adv: Hash-Chain Explainer',
      path: './archify/examples/advanced-hash-chain-time-travel-explainer.html',
      caption: 'Advanced Sample 1 (4-Style Explainer): Pinned to examples/advanced-hash-chain-time-travel/run.mjs with invariant proof matrix.'
    },
    {
      id: 'sample-bmad-workflow',
      badge: 'adv sample · workflow',
      label: 'Adv: BMAD Evolution Workflow',
      path: './archify/examples/advanced-bmad-crew-evolution-workflow.html',
      caption: 'Advanced Sample 2 (Archify Workflow v2): Phase 1 Veto -> Phase 2 Counterfactual KPI Evolution -> Phase 3 Consensus -> Air-Gapped Scrum Sync.'
    },
    {
      id: 'sample-bmad-explainer',
      badge: 'adv sample · explainer',
      label: 'Adv: BMAD Evolution Explainer',
      path: './archify/examples/advanced-bmad-crew-evolution-explainer.html',
      caption: 'Advanced Sample 2 (4-Style Explainer): Pinned to examples/advanced-bmad-crew-evolution/run.mjs with KPI progression bar chart.'
    }
  ];

  // =========================================================================
  // 3B. INTERACTIVE THREE.JS + ARCHIFY 3D SAMPLES GALLERY CATALOG
  // =========================================================================
  const THREE_SAMPLES = [
    {
      id: 'kids-science-fair-glider',
      audience: 'kids',
      badge: 'Kids · Grades 5–12',
      title: 'Paper Airplane Science Fair Flight Lab',
      subtitle: '3D gym runway with 4 animated paper airplanes, stalled dead-end arc, balance lessons & time-travel scrubber.',
      threePath: './examples/kids-science-fair-glider/index.html',
      diagramPath: './archify/examples/kids-science-fair-glider-timeline.html',
      diagramLabel: 'Archify Timeline',
      explainerPath: './archify/examples/kids-science-fair-glider-explainer.html',
      sourceUrl: 'https://github.com/onimurasame/numberone/tree/master/examples/kids-science-fair-glider',
      caption: 'Kids Sample 1: Interactive Three.js 3D Paper Airplane Flight Lab powered by real NumberOneAgent stream events, dead-end tracking, and 9-chapter documentary.'
    },
    {
      id: 'kids-robotics-arena',
      audience: 'kids',
      badge: 'Kids · Robotics Club',
      title: 'RoboHawks Safety Arena & Time Machine',
      subtitle: '3D rover bot, oval black-tape track, crimson L2 laser barrier blocking 100% throttle & historical replay.',
      threePath: './examples/kids-robotics-arena/index.html',
      diagramPath: './archify/examples/kids-robotics-arena-sequence.html',
      diagramLabel: 'Archify Sequence',
      explainerPath: './archify/examples/kids-robotics-arena-explainer.html',
      sourceUrl: 'https://github.com/onimurasame/numberone/tree/master/examples/kids-robotics-arena',
      caption: 'Kids Sample 2: Interactive Three.js 3D Robotics Safety Arena demonstrating L2 blocking directives, affirmative arbitration, and time-travel replay.'
    },
    {
      id: 'advanced-hash-chain-time-travel',
      audience: 'advanced',
      badge: 'Advanced · Cryptography',
      title: 'SHA-256 Hash-Chain Helix & Tamper Observatory',
      subtitle: '3D helical event prisms, CAS blob satellite, snapshotDigest Projection Core & live 1-byte tamper cascade.',
      threePath: './examples/advanced-hash-chain-time-travel/index.html',
      diagramPath: './archify/examples/advanced-hash-chain-time-travel-dataflow.html',
      diagramLabel: 'Archify Dataflow',
      explainerPath: './archify/examples/advanced-hash-chain-time-travel-explainer.html',
      sourceUrl: 'https://github.com/onimurasame/numberone/tree/master/examples/advanced-hash-chain-time-travel',
      caption: 'Advanced Sample 1: Interactive Three.js 3D Hash-Chain Helix with O(n) redaction proof, CAS fallback blob, --until-seq replay, and fail-closed tamper simulation.'
    },
    {
      id: 'advanced-bmad-crew-evolution',
      audience: 'advanced',
      badge: 'Advanced · DevSecOps',
      title: 'BMAD Bridge Crew & KPI Evolution Bridge',
      subtitle: '3D dynamic 0-100 KPI towers, Veto -> Consensus core, counterfactual evolution gates & 29/29 Scrum sync.',
      threePath: './examples/advanced-bmad-crew-evolution/index.html',
      diagramPath: './archify/examples/advanced-bmad-crew-evolution-workflow.html',
      diagramLabel: 'Archify Workflow',
      explainerPath: './archify/examples/advanced-bmad-crew-evolution-explainer.html',
      sourceUrl: 'https://github.com/onimurasame/numberone/tree/master/examples/advanced-bmad-crew-evolution',
      caption: 'Advanced Sample 2: Interactive Three.js 3D Command Bridge animating Phase 1 Veto, Phase 2 Counterfactual KPI Evolution, Phase 3 Consensus & Air-Gapped Scrum Sync.'
    }
  ];

  // =========================================================================
  // 4. ALL 24+ AI HARNESSES, GENERIC & ON-PREMISES CONFIGURATOR DATA
  // =========================================================================
  const HARNESS_GUIDES = [
    {
      id: 'generic',
      name: 'Generic / Harness-Agnostic (Zero MCP)',
      category: 'Universal',
      configFile: '.numberone/config.json + AGENTS.md + Git/Shell Hooks',
      summary: 'Works with ANY past, present, or future AI agent, web chat copy-paste workflow, or raw human terminal without requiring MCP.',
      snippet: '# 1. Attach workspace (creates .numberone/, chained Git hooks & shims)\nn1 attach .\n\n# 2. Start detached real-time filesystem watcher\nn1 watch\n\n# 3. Enable automatic terminal crash capture in ~/.bashrc or ~/.zshrc\neval "$(n1 shell-hook bash)"\n\n# 4. Wrap builds/tests for automatic Crash -> Fix lesson synthesis\nn1 exec -- npm test\n\n# 5. Ingest exported JSONL/Markdown chat transcripts anytime\nn1 ingest ./session-transcript.jsonl --harness custom-agent'
    },
    {
      id: 'claude-code',
      name: 'Claude Code (CLI & Desktop)',
      category: 'CLI / Desktop',
      configFile: '.mcp.json + CLAUDE.md + .claude/settings.json',
      summary: 'Native project-scoped MCP server registration plus automatic CLAUDE.md System of Record instructions.',
      snippet: '# Attach workspace & register project-scoped stdio MCP server\nn1 attach .\nclaude mcp add --scope project numberone -- n1 mcp --workspace .'
    },
    {
      id: 'codex',
      name: 'OpenAI Codex CLI',
      category: 'CLI',
      configFile: '~/.codex/config.toml + AGENTS.md',
      summary: 'Codex CLI loads AGENTS.md automatically and connects to Number One over stdio MCP.',
      snippet: '# CLI shortcut:\ncodex mcp add numberone -- n1 mcp --workspace .\n\n# Or add to ~/.codex/config.toml:\n[mcp_servers.numberone]\ncommand = "n1"\nargs = ["mcp", "--workspace", "."]\nstartup_timeout_sec = 10\ntool_timeout_sec = 60'
    },
    {
      id: 'cursor',
      name: 'Cursor',
      category: 'IDE',
      configFile: '.cursor/mcp.json + .cursor/rules/numberone.mdc',
      summary: 'n1 attach creates always-applied .cursor/rules/numberone.mdc; add .cursor/mcp.json for all 12 MCP tools.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "${workspaceFolder}"]\n    }\n  }\n}'
    },
    {
      id: 'windsurf',
      name: 'Windsurf (Codeium)',
      category: 'IDE',
      configFile: '~/.codeium/windsurf/mcp_config.json + AGENTS.md',
      summary: 'Connects Windsurf Cascade directly to Number One stdio MCP tools and AGENTS.md / .windsurfrules.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]\n    }\n  }\n}'
    },
    {
      id: 'antigravity',
      name: 'Google Antigravity',
      category: 'Agentic IDE',
      configFile: 'mcpServers + AGENTS.md',
      summary: 'Antigravity discovers AGENTS.md automatically and pairs stdio MCP with background n1 watch.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "/absolute/path/to/workspace"]\n    }\n  }\n}'
    },
    {
      id: 'gemini-cli',
      name: 'Google Gemini CLI',
      category: 'CLI',
      configFile: '~/.gemini/settings.json + AGENTS.md / GEMINI.md',
      summary: 'Configure Gemini CLI settings.json to load AGENTS.md and trust the local Number One stdio server.',
      snippet: '{\n  "contextFileName": ["AGENTS.md", "GEMINI.md"],\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."],\n      "trust": true\n    }\n  }\n}'
    },
    {
      id: 'copilot',
      name: 'GitHub Copilot (VS Code, JB & Coding Agent)',
      category: 'IDE / Cloud',
      configFile: '.vscode/mcp.json + .github/copilot-instructions.md',
      summary: 'n1 attach populates .github/copilot-instructions.md; .vscode/mcp.json wires Copilot Agent Mode.',
      snippet: '{\n  "servers": {\n    "numberone": {\n      "type": "stdio",\n      "command": "n1",\n      "args": ["mcp", "--workspace", "${workspaceFolder}"]\n    }\n  }\n}'
    },
    {
      id: 'cline',
      name: 'Cline',
      category: 'VS Code Ext',
      configFile: 'cline_mcp_settings.json + .clinerules',
      summary: 'Auto-approve read/arbitration tools in Cline while keeping L1-L3 stream protection active.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "/absolute/path/to/workspace"],\n      "autoApprove": ["get_authoritative_brief", "consult_number_one", "arbitrate_action", "verify_integrity"]\n    }\n  }\n}'
    },
    {
      id: 'roo-code',
      name: 'Roo Code',
      category: 'VS Code Ext',
      configFile: '.roo/mcp.json + AGENTS.md / .roorules',
      summary: 'Workspace-scoped Roo Code MCP configuration with AGENTS.md rule discovery.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "${workspaceFolder}"]\n    }\n  }\n}'
    },
    {
      id: 'continue',
      name: 'Continue.dev',
      category: 'VS Code / JB',
      configFile: '.continue/config.yaml',
      summary: 'YAML MCP server block and authoritative rule enforcement for VS Code and JetBrains.',
      snippet: 'mcpServers:\n  - name: numberone\n    command: n1\n    args:\n      - mcp\n      - --workspace\n      - .'
    },
    {
      id: 'zed',
      name: 'Zed Editor',
      category: 'IDE',
      configFile: '.zed/settings.json + AGENTS.md / .rules',
      summary: 'Registers Number One as a custom Zed context_server alongside automatic AGENTS.md rules.',
      snippet: '{\n  "context_servers": {\n    "numberone": {\n      "source": "custom",\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."]\n    }\n  }\n}'
    },
    {
      id: 'aider',
      name: 'Aider',
      category: 'CLI',
      configFile: '.aider.conf.yml',
      summary: 'Pairs .aider.conf.yml read rules with n1 watch and n1 exec for complete Git + test curation.',
      snippet: '# .aider.conf.yml\nread:\n  - AGENTS.md\nauto-commits: true\n\n# Launch Aider under Number One curation:\nn1 attach . && n1 watch && n1 exec -- aider'
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      category: 'CLI / TUI',
      configFile: 'opencode.json + AGENTS.md',
      summary: 'Native local MCP integration in opencode.json with automatic AGENTS.md loading.',
      snippet: '{\n  "$schema": "https://opencode.ai/config.json",\n  "mcp": {\n    "numberone": {\n      "type": "local",\n      "command": ["n1", "mcp", "--workspace", "."],\n      "enabled": true\n    }\n  }\n}'
    },
    {
      id: 'goose',
      name: 'Goose (Block)',
      category: 'CLI / Desktop',
      configFile: '~/.config/goose/config.yaml',
      summary: 'Registers Number One as a stdio Goose extension.',
      snippet: 'extensions:\n  numberone:\n    name: Number One SoR\n    type: stdio\n    cmd: n1\n    args: [mcp, --workspace, .]\n    enabled: true'
    },
    {
      id: 'devin',
      name: 'Devin',
      category: 'Autonomous VM',
      configFile: 'AGENTS.md + Custom Stdio MCP',
      summary: 'Run n1 attach . && n1 watch in VM setup and connect Devin custom stdio MCP to n1 mcp.',
      snippet: '# Devin VM setup command:\nnpm install -g numberone && n1 attach . && n1 watch\n\n# Devin MCP Server:\n# Command: n1\n# Args: mcp --workspace /home/ubuntu/repos/<repo>'
    },
    {
      id: 'amazon-q',
      name: 'Amazon Q Developer',
      category: 'CLI / IDE',
      configFile: '.amazonq/mcp.json + .amazonq/rules/numberone.md',
      summary: 'Workspace MCP configuration and rule symlink for Amazon Q Developer.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."],\n      "timeout": 60000\n    }\n  }\n}'
    },
    {
      id: 'amp',
      name: 'Sourcegraph Amp',
      category: 'CLI / VS Code',
      configFile: 'settings.json (amp.mcpServers) + AGENTS.md',
      summary: 'Amp loads AGENTS.md natively and connects via amp.mcpServers.',
      snippet: '{\n  "amp.mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."]\n    }\n  }\n}'
    },
    {
      id: 'junie',
      name: 'JetBrains AI & Junie',
      category: 'JetBrains IDE',
      configFile: '.junie/guidelines.md + JetBrains MCP',
      summary: 'Symlink .junie/guidelines.md to AGENTS.md and add Number One in JetBrains MCP settings.',
      snippet: 'mkdir -p .junie && ln -sf ../AGENTS.md .junie/guidelines.md\n# Then add n1 mcp --workspace <path> in Settings -> Tools -> AI Assistant -> MCP'
    },
    {
      id: 'trae-void-kilo',
      name: 'Trae / PearAI / Void / Kilo Code',
      category: 'IDE',
      configFile: '.trae/mcp.json | .kilocode/mcp.json | Void / PearAI MCP',
      summary: 'Standard mcpServers stdio configuration shared across Trae, Void, PearAI, and Kilo Code.',
      snippet: '{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."]\n    }\n  }\n}'
    },
    {
      id: 'neovim-emacs-kimi',
      name: 'Neovim, Emacs & Kimi Work',
      category: 'Editor / Stdio',
      configFile: '~/.config/mcphub/servers.json | mcp.el | stdio JSON-RPC 2.0',
      summary: 'Works natively with mcphub.nvim, codecompanion.nvim, avante.nvim, Emacs mcp.el + gptel, and Kimi Work stdio MCP.',
      snippet: '// ~/.config/mcphub/servers.json (or Kimi Work stdio MCP config)\n{\n  "mcpServers": {\n    "numberone": {\n      "command": "n1",\n      "args": ["mcp", "--workspace", "."]\n    }\n  }\n}'
    },
    {
      id: 'onprem-airgap',
      name: 'On-Premises: Air-Gapped Offline Bundle',
      category: 'On-Premises',
      configFile: '/opt/numberone + SHA-256 Manifest',
      summary: 'Zero-network offline deployment bundling compiled dist/ and vendored zod across an air-gap diode.',
      snippet: '# Verify SHA-256 digest & install into /opt/numberone\nsha256sum -c numberone-1.0.0-airgap-bundle.tar.gz.sha256\nsudo mkdir -p /opt/numberone\nsudo tar -xzf numberone-1.0.0-airgap-bundle.tar.gz -C /opt/numberone\nsudo ln -sf /opt/numberone/dist/cli.js /usr/local/bin/n1\nn1 --version'
    },
    {
      id: 'onprem-docker',
      name: 'On-Premises: Hardened Docker / Rootless Podman',
      category: 'On-Premises',
      configFile: 'Dockerfile (--read-only --cap-drop=ALL --network=none)',
      summary: 'Runs under UID/GID mapping, read-only rootfs, zero Linux capabilities, tini PID 1, and zero network egress.',
      snippet: 'docker run --rm --network=none \\\n  --user "$(id -u):$(id -g)" \\\n  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m \\\n  --cap-drop=ALL --security-opt=no-new-privileges \\\n  -v "$(pwd):/workspace" \\\n  numberone:1.0.0 party --workspace /workspace --topic "Enclave readiness"'
    },
    {
      id: 'onprem-ghes-jira',
      name: 'On-Premises: GHES + Jira DC + Self-Hosted vLLM',
      category: 'On-Premises',
      configFile: '.numberone/config.json + NODE_EXTRA_CA_CERTS',
      summary: 'Connects to internal GitHub Enterprise Server, Jira Data Center, and self-hosted vLLM/Ollama behind corporate PKI (see docs/ONPREM.md for systemd & Kubernetes StatefulSet manifests).',
      snippet: 'export NODE_EXTRA_CA_CERTS=/etc/ssl/certs/corp-root-ca.pem\n# .numberone/config.json excerpt:\n{\n  "persistence": {\n    "github": { "enabled": true, "owner": "eng", "repo": "core", "apiBaseUrl": "https://github.internal.example/api/v3", "tokenEnvVar": "GHES_PAT", "useGhCli": false },\n    "jira": { "enabled": true, "baseUrl": "https://jira.internal.example", "projectKey": "CORE", "emailEnvVar": "JIRA_EMAIL", "apiTokenEnvVar": "JIRA_PAT" }\n  },\n  "llm": { "provider": "openai-compatible", "baseUrl": "https://vllm.internal.example/v1", "model": "Qwen/Qwen2.5-Coder-32B-Instruct", "apiKeyEnvVar": "VLLM_API_KEY" }\n}'
    }
  ];

  // =========================================================================
  // 5. CLI COMMANDS (ALL 24), MCP PROTOCOL (12 TOOLS / 4 RESOURCES) & MODULES
  // =========================================================================
  const CLI_COMMANDS = [
    { cat: 'Lifecycle & Sensors', cmd: 'n1 attach [path]', desc: 'Initialize .numberone/, chained Git hooks, universal shims, git backfill & baseline file snapshot.' },
    { cat: 'Lifecycle & Sensors', cmd: 'n1 status', desc: 'Inspect stream tip sequence/hash, daemon PID status, officer KPIs, counts, and sync state.' },
    { cat: 'Lifecycle & Sensors', cmd: 'n1 doctor', desc: 'Diagnose Node/Git toolchain, local cryptographic stream integrity, watcher daemon, and backend credentials.' },
    { cat: 'Lifecycle & Sensors', cmd: 'n1 watch [--foreground | stop]', desc: 'Start detached background debounced FS watcher (or stream live events in foreground / stop daemon).' },
    { cat: 'Lifecycle & Sensors', cmd: 'n1 reconcile', desc: 'Detect and record offline manual file edits, additions, or deletions made while watcher was stopped.' },
    { cat: 'Lifecycle & Sensors', cmd: 'n1 exec [--timeout-ms N] -- <cmd...>', desc: 'Execute command with sanitized env, bounded ring buffers, crash capture & automatic Crash -> Fix lesson synthesis.' },
    { cat: 'Lifecycle & Sensors', cmd: 'n1 shell-hook [bash | zsh]', desc: 'Print safe interactive terminal hook for automatic non-zero command failure capture.' },
    { cat: 'Lifecycle & Sensors', cmd: 'n1 ingest <file> [--harness NAME]', desc: 'Ingest Claude Code, Codex, JSONL, JSON, or Markdown AI chat transcripts into stream events.' },
    { cat: 'Replay & Audit', cmd: 'n1 replay [--until-seq N | --until-time ISO]', desc: 'Deterministically rebuild WorkspaceProjection from event #1 (or time-travel to an exact sequence/timestamp).' },
    { cat: 'Replay & Audit', cmd: 'n1 verify [--local-only]', desc: 'Verify SHA-256 hash chain, CAS fallback blobs, projection snapshotDigest, and remote GitHub/Jira mirrors (exit 0 valid, 2 invalid).' },
    { cat: 'Replay & Audit', cmd: 'n1 documentary [--out FILE]', desc: 'Generate chronological, chapter-structured Workspace Documentary Markdown.' },
    { cat: 'Memory & Authority', cmd: 'n1 brief [--paths p1,p2]', desc: 'Print Number One authoritative System of Record brief (active directives, unresolved crashes, top lessons, dead ends).' },
    { cat: 'Memory & Authority', cmd: 'n1 consult --intent "..." [--paths ...]', desc: 'Query ranked lessons learned, dead-ends, unresolved crashes, and active directives.' },
    { cat: 'Memory & Authority', cmd: 'n1 arbitrate --action "..." [--dry-run]', desc: 'Evaluate proposed plan against L1-L4 precedence (exit 0 approve/override, exit 2 blocked).' },
    { cat: 'Memory & Authority', cmd: 'n1 think "<thought>" [--tags ...]', desc: 'Record intermediate AI or human reasoning (chat.thinking) into the stream.' },
    { cat: 'Memory & Authority', cmd: 'n1 dead-end --approach "..." --reason "..."', desc: 'Record a failed approach (attempt.failed) so future sessions never repeat it.' },
    { cat: 'Memory & Authority', cmd: 'n1 lesson --title "..." --resolution "..."', desc: 'Capture a durable LessonRecord with problem, root-cause, resolution, prevention rule, and error signatures.' },
    { cat: 'Memory & Authority', cmd: 'n1 decision --title "..." --decision "..."', desc: 'Record an Architecture or Process Decision Record (ADR) with rationale and rejected alternatives.' },
    { cat: 'Memory & Authority', cmd: 'n1 directive --title "..." --directive "..."', desc: 'Issue an authoritative advisory, mandatory, or blocking directive with optional --forbid / --require patterns.' },
    { cat: 'Memory & Authority', cmd: 'n1 issue [open | resolve]', desc: 'List, open, or resolve Scrum work items synced across .numberone, Directory, GitHub Projects v2, and Jira.' },
    { cat: 'Memory & Authority', cmd: 'n1 record --type <EventType> --summary "..."', desc: 'Append any of the 47 typed atomic StreamEvents directly with validated JSON --payload.' },
    { cat: 'Bridge Crew & Sync', cmd: 'n1 party --topic "..." [--officers ...]', desc: 'Convene 3-round BMAD Party Mode roundtable with challenge verification, decision matrix & remediation plan (exit 0 consensus, 2 veto).' },
    { cat: 'Bridge Crew & Sync', cmd: 'n1 officer <engineering|security|bridge>', desc: 'Run a single specialist officer assessment and record officer.kpi.measured.' },
    { cat: 'Bridge Crew & Sync', cmd: 'n1 evolve [--file F | audit ROLE | revert ROLE ID]', desc: 'Submit KPI-proven practice update (delta > 0), audit KPI regressions, or revert an evolved practice.' },
    { cat: 'Bridge Crew & Sync', cmd: 'n1 sync [push | pull | both]', desc: 'Synchronize distributed Scrum state bidirectionally with Directory, GitHub Issues/Projects v2, and Jira.' },
    { cat: 'Bridge Crew & Sync', cmd: 'n1 shims', desc: 'Install or refresh idempotent AGENTS.md, CLAUDE.md, Cursor, Copilot, and .mcp.json harness shims.' },
    { cat: 'Bridge Crew & Sync', cmd: 'n1 mcp', desc: 'Launch hardened stdio JSON-RPC 2.0 MCP server (12 tools, 4 resources, strict L4 privilege boundary).' }
  ];

  const MCP_TOOLS = [
    { name: 'get_authoritative_brief', guard: 'Read-Only', desc: 'Returns the authoritative System of Record brief (active directives, unresolved crashes, verified lessons, and recent decisions).' },
    { name: 'consult_number_one', guard: 'Read-Only', desc: 'Scores and returns relevant LessonRecords, dead-end failedAttempts, active directives, and unresolved crashes for an intent or path.' },
    { name: 'arbitrate_action', guard: 'L1-L4 Gate', desc: 'Evaluates a proposed action against L1-L4 precedence with affirmative-clause negation stripping and ReDoS-safe pattern matching.' },
    { name: 'record_stream_event', guard: 'L4 Restricted', desc: 'Appends strictly non-privileged telemetry (chat.turn, chat.thinking, attempt.failed, issue.opened, issue.updated, decision.recorded).' },
    { name: 'capture_lesson', guard: 'Memory Write', desc: 'Records a structured LessonRecord with root cause, resolution, preventionRule, and errorSignatures.' },
    { name: 'issue_directive', guard: 'L4 Advisory Cap', desc: 'Issues a scoped directive over MCP strictly capped at severity="advisory" (mandatory/blocking L2 requires operator CLI or Crew veto).' },
    { name: 'replay_workspace_state', guard: 'Read-Only', desc: 'Deterministically replays WorkspaceProjection up to current head or an optional untilSeq / untilTimestamp.' },
    { name: 'get_documentary', guard: 'Read-Only', desc: 'Compiles and returns the chronological chaptered Workspace Documentary narrative.' },
    { name: 'assemble_crew', guard: 'BMAD Party Mode', desc: 'Convenes Engineering, Security, and Bridge Officers for a 3-round evidence-backed audit, decision matrix, and ranked remediation plan.' },
    { name: 'propose_officer_evolution', guard: 'No Shell Exec', desc: 'Evaluates a candidate practice via counterfactual virtual-file replay with allowBenchmarkExec unconditionally locked to false.' },
    { name: 'sync_persistence', guard: 'Scrum Sync', desc: 'Runs bidirectional push/pull synchronization across configured Directory, GitHub Projects v2, and Jira adapters.' },
    { name: 'verify_integrity', guard: 'Audit', desc: 'Verifies local SHA-256 hash chain, CAS fallback blobs, snapshotDigest, and optional remote mirror parity.' }
  ];

  const MCP_RESOURCES = [
    { uri: 'numberone://brief', mime: 'text/markdown', desc: 'Authoritative System of Record Markdown brief for immediate AI session grounding.' },
    { uri: 'numberone://state', mime: 'application/json', desc: 'Full deterministic WorkspaceProjection JSON snapshot verified by snapshotDigest.' },
    { uri: 'numberone://documentary', mime: 'text/markdown', desc: 'Chronological, chaptered Workspace Documentary compiled from all atomic stream events.' },
    { uri: 'numberone://lessons', mime: 'application/json', desc: 'Complete array of structured LessonRecords and prevention rules captured in the workspace.' }
  ];

  const CODE_MODULES = [
    { group: 'core', path: 'src/core/types.ts', symbol: 'EVENT_TYPES, StreamEvent, WorkspaceProjection, NumberOneConfig', desc: '47 typed atomic event schemas, Zod runtime validators, projection entities, and configuration interfaces.' },
    { group: 'core', path: 'src/core/ulid.ts', symbol: 'generateUlid(now?)', desc: 'Monotonic 26-char Crockford Base32 ULID generator (48-bit ms timestamp + 80-bit CSPRNG entropy).' },
    { group: 'core', path: 'src/core/hash.ts', symbol: 'canonicalJson, sha256Hex, hashObject, GENESIS_HASH', desc: 'Deterministic sorted-key JSON serialization (prototype-key safe) and SHA-256 hashing.' },
    { group: 'core', path: 'src/core/stream-store.ts', symbol: 'StreamStore', desc: 'Append-only SHA-256 event store (0o700/0o600), CAS blobs, advisory locking, fsync durability, and chain verifier.' },
    { group: 'core', path: 'src/core/replay-engine.ts', symbol: 'ReplayEngine, applyEventToProjection, computeProjectionDigest', desc: 'Pure functional fold reconstructing WorkspaceProjection with snapshotDigest cache verification and time-travel.' },
    { group: 'core', path: 'src/core/lesson-engine.ts', symbol: 'LessonEngine', desc: 'Multi-signal lesson relevance scorer, dead-end matcher, and automatic crash-to-fix lesson correlator.' },
    { group: 'core', path: 'src/core/authority-engine.ts', symbol: 'AuthorityEngine, extractAffirmativeClauses', desc: 'Four-tier L1-L4 precedence arbitrator with affirmative-clause negation filtering and ReDoS-safe pattern checks.' },
    { group: 'core', path: 'src/core/documentary.ts', symbol: 'buildWorkspaceDocumentary', desc: 'Compiles chronological session chapters into a human-readable engineering documentary.' },
    { group: 'persistence', path: 'src/persistence/types.ts', symbol: 'PersistenceAdapter, SyncLedger, DistributedIntegrityReport', desc: 'Distributed persistence adapter, sync ledger, and cross-backend integrity contracts.' },
    { group: 'persistence', path: 'src/persistence/fabric.ts', symbol: 'PersistenceFabric', desc: 'Coordinates idempotent push/pull Scrum sync and distributed integrity checks across all adapters.' },
    { group: 'persistence', path: 'src/persistence/directory-adapter.ts', symbol: 'DirectoryPersistenceAdapter', desc: 'Air-gapped local, NFS, or Git-worktree Scrum/Kanban board adapter.' },
    { group: 'persistence', path: 'src/persistence/github-adapter.ts', symbol: 'GitHubPersistenceAdapter', desc: 'GitHub Issues + Projects v2 GraphQL + GHES adapter with lossless HTML5-safe <!-- n1-meta --> footers.' },
    { group: 'persistence', path: 'src/persistence/jira-adapter.ts', symbol: 'JiraPersistenceAdapter', desc: 'Jira Cloud & Data Center REST v3 adapter with ADF rich text, Agile Sprints, and JQL search.' },
    { group: 'watchers', path: 'src/watchers/fs-watcher.ts', symbol: 'WorkspaceFsWatcher', desc: 'Debounced live filesystem watcher, unified diff generator, CAS snapshotting, and offline reconcile.' },
    { group: 'watchers', path: 'src/watchers/daemon.ts', symbol: 'WatcherDaemonManager', desc: 'Detached daemon lifecycle manager binding PIDs to /proc/<pid>/stat field-22 start ticks.' },
    { group: 'watchers', path: 'src/watchers/git-hooks.ts', symbol: 'installGitHooks, recordGitHookEvent, importGitHistory', desc: 'Worktree-safe non-clobbering chained Git lifecycle hooks and commit history bootstrap.' },
    { group: 'watchers', path: 'src/watchers/command-runner.ts', symbol: 'runWatchedCommand, generateShellHook', desc: 'Sanitized child command runner, UTF-8 ring buffers, crash signature extractor, and bash/zsh hooks.' },
    { group: 'watchers', path: 'src/watchers/transcript-ingestor.ts', symbol: 'ingestTranscriptFile', desc: 'Parses Claude Code, Codex, JSON, and Markdown transcripts into chat.turn, chat.thinking, and attempt.failed.' },
    { group: 'crew', path: 'src/crew/types.ts', symbol: 'CrewOfficer, PeerChallenge, ChallengeResolution, EvolutionVerdict', desc: 'Officer contracts, peer challenge verification results, decision matrices, and evolution proof schemas.' },
    { group: 'crew', path: 'src/crew/base-officer.ts', symbol: 'BaseBridgeOfficer, evaluatePracticeMatcherOnVirtualFiles', desc: 'Abstract officer base class, virtual-file counterfactual matcher, and weighted KPI scoring engine.' },
    { group: 'crew', path: 'src/crew/party-mode.ts', symbol: 'PartyModeOrchestrator, resolvePeerChallenges', desc: '3-Round BMAD Party Mode roundtable, deterministic peer challenge verifier, decision matrix, and L2 veto issuer.' },
    { group: 'crew', path: 'src/crew/engineering-officer.ts', symbol: 'EngineeringOfficer', desc: 'Audits runtime pinning, lockfiles, container hardening, .env.example, shutdown signals, runbooks, and crash debt.' },
    { group: 'crew', path: 'src/crew/security-officer.ts', symbol: 'SecurityOfficer', desc: 'Audits secret leaks, SHA-pinned Actions, workflow permissions, code sinks, containers, and Dependabot.' },
    { group: 'crew', path: 'src/crew/bridge-officer.ts', symbol: 'BridgeOfficer', desc: 'Audits automated tests, stream pass rate, CI triggers, release automation, typecheck gates, and rollback scripts.' },
    { group: 'crew', path: 'src/crew/evolution-engine.ts', symbol: 'KnowledgeEvolutionEngine', desc: 'Promotes candidate officer practices ONLY when counterfactual or empirical proof shows KPI delta > 0.' },
    { group: 'crew', path: 'src/crew/llm-provider.ts', symbol: 'PluggableLlmProvider', desc: 'Optional validated OpenAI-compatible, Anthropic, Gemini, or self-hosted vLLM/Ollama provider adapter.' },
    { group: 'harness', path: 'src/harness/number-one.ts', symbol: 'NumberOneAgent', desc: 'Unified programmatic facade orchestrating stream, replay, authority, crew, watchers, and persistence.' },
    { group: 'harness', path: 'src/harness/mcp-server.ts', symbol: 'NumberOneMcpServer', desc: 'Zero-dependency stdio JSON-RPC 2.0 MCP server (12 tools, 4 resources, 2 MB pre-decode cap, L4 boundary).' },
    { group: 'harness', path: 'src/harness/shims.ts', symbol: 'installHarnessShims', desc: 'Idempotently injects marker-fenced SoR instructions into AGENTS.md, CLAUDE.md, Cursor, Copilot, and .mcp.json.' },
    { group: 'utils', path: 'src/utils/redactor.ts', symbol: 'redactSecrets, redactObjectDeep, buildSanitizedChildEnv', desc: 'Linear-time O(n) secret token scrubber, Slack webhook scanner, prototype-key guard, and env sanitizer.' },
    { group: 'utils', path: 'src/utils/safe-regex.ts', symbol: 'validateRegexSafety, testSafeRegex, matchGlobLinear', desc: 'Static ReDoS detector rejecting nested quantifiers/backreferences plus O(N*M) linear glob matcher.' },
    { group: 'utils', path: 'src/utils/http.ts', symbol: 'validateHttpUrl, resolveScopedEnvVar, resilientFetch', desc: 'SSRF private/metadata IP blocker, origin-bound credential resolver, bounded reads, and jittered retries.' },
    { group: 'utils', path: 'src/utils/lock.ts', symbol: 'withFileLockSync, withFileLockAsync, readProcStartTicks', desc: 'Cross-process advisory locking via linkSync/O_EXCL, Atomics.wait sleep, and single-FD /proc tick checks.' },
    { group: 'utils', path: 'src/utils/fs-helpers.ts', symbol: 'atomicWriteFileSync, isPathConfinedToRoot, readTextFileSafe', desc: 'Atomic temp+fsync+rename writes, realpath root confinement, and O_NOFOLLOW symlink escape defense.' },
    { group: 'utils', path: 'src/utils/diff.ts', symbol: 'computeUnifiedDiff', desc: 'Bounded line-level unified diff generator for workspace file modifications.' },
    { group: 'utils', path: 'src/utils/ignore.ts', symbol: 'WorkspaceIgnore', desc: 'Linear-time .gitignore and .numberone workspace path exclusion filter.' },
    { group: 'cli', path: 'src/cli.ts', symbol: 'parseCliArgs, runCli', desc: '24-subcommand POSIX CLI supporting human output and machine-readable --json envelopes.' },
    { group: 'cli', path: 'src/index.ts', symbol: 'Public ESM Library Entrypoint', desc: 'Re-exports NumberOneAgent, engines, officers, adapters, watchers, and utilities for Node.js & school JS apps.' }
  ];

  // =========================================================================
  // 6. PLAIN-ENGLISH + TECHNICAL GLOSSARY
  // =========================================================================
  const GLOSSARY_TERMS = [
    // Plain English Starter Terms (great for kids, students & newcomers!)
    { term: 'Workspace (Plain English)', cat: 'Plain English', def: 'The folder on your computer where all of your project files live — like your science fair folder, game folder, or team repo.' },
    { term: 'Library (Plain English)', cat: 'Plain English', def: 'A ready-made toolbox of code (like numberone) that you can import into your own JavaScript program with one line.' },
    { term: 'Project Diary / Event Stream (Plain English)', cat: 'Plain English', def: 'An un-erasable journal inside .numberone/ where every new note, save, or test result is added to the bottom and old pages are never ripped out.' },
    { term: 'Dead-End (Plain English)', cat: 'Plain English', def: 'An experiment or approach that did not work — saved on purpose so neither you nor an AI helper wastes time trying it twice.' },
    { term: 'Lesson Learned (Plain English)', cat: 'Plain English', def: 'A helpful takeaway saved after solving a bug or finishing a test, complete with what went wrong and how to prevent it next time.' },
    { term: 'Project Ground Rule / Directive (Plain English)', cat: 'Plain English', def: 'A rule you set for your project (like "keep arrow keys working" or "cap robot speed at 80%") that outranks forgetful AI chat guesses.' },
    { term: 'Project Documentary (Plain English)', cat: 'Plain English', def: 'A neat, chapter-by-chapter story of your whole project that Number One writes automatically — perfect for teachers, judges, or teammates.' },
    { term: 'Time Machine / Replay (Plain English)', cat: 'Plain English', def: 'Reading your project diary from Page 1 up to any page you pick so you can inspect exactly how your project looked earlier.' },
    { term: 'Tamper-Evident Seal / Hash (Plain English)', cat: 'Plain English', def: 'A unique math fingerprint on every diary entry — if anyone secretly edits an old entry, n1 verify catches it immediately.' },
    { term: 'Three Project Helpers / Bridge Crew (Plain English)', cat: 'Plain English', def: 'Number One\'s built-in checkup team: Builder Helper (Engineering), Safety Helper (Security), and Launch Helper (Bridge).' },

    // Complete Technical Glossary
    { term: 'ADF (Atlassian Document Format)', cat: 'Persistence', def: 'Structured JSON rich-text schema required by Jira REST API v3; generated deterministically by toAdfDocument.' },
    { term: 'ADR (Architecture Decision Record)', cat: 'Memory', def: 'Immutable DecisionRecord capturing an architectural choice, rationale, rejected alternatives, and consequences.' },
    { term: 'Advisory Lock', cat: 'Concurrency', def: 'Cross-process lockfile acquired via atomic linkSync or O_CREAT|O_EXCL to serialize concurrent stream appends and sync writes.' },
    { term: 'Affirmative Clause Extraction', cat: 'Authority', def: 'Parser in AuthorityEngine that strips negated compliance statements ("do not use eval") before checking forbiddenPatterns.' },
    { term: 'Append-Only Log', cat: 'Event Sourcing', def: 'Immutable storage pattern in .numberone/stream/ where facts are strictly appended and never overwritten.' },
    { term: 'Arbitration', cat: 'Authority', def: 'Deterministic evaluation of a proposed action against L1-L4 precedence yielding APPROVE, APPROVE_WITH_CONDITIONS, OVERRIDE, or BLOCK.' },
    { term: 'Archify', cat: 'Visualization', def: 'Schema-validated visual compiler generating 10 native diagram types, 4-style Explainers, Story choreographies, Code Analysis, and PR Packs.' },
    { term: 'Artifact Provenance', cat: 'Supply Chain', def: 'SLSA OIDC cryptographic attestation (npm publish --provenance) linking a published package to its exact commit and CI workflow.' },
    { term: 'Atomic File Write', cat: 'POSIX', def: 'Crash-safe write pattern: unique temp file -> fsyncSync -> chmodSync -> atomic renameSync.' },
    { term: 'Atomics.wait', cat: 'Concurrency', def: 'SharedArrayBuffer sleep primitive used during lock contention to avoid CPU-burning spin loops.' },
    { term: 'Authority Hierarchy (L1 > L2 > L3 > L4)', cat: 'Authority', def: 'L1 Stream Invariants > L2 Number One Directives > L3 Officer Gates & Verified Lessons > L4 Ephemeral AI Session Context.' },
    { term: 'BMAD Party Mode', cat: 'Bridge Crew', def: '3-round collaborative protocol where Engineering, Security, and Bridge Officers audit, cross-verify peer challenges, and issue a joint ruling.' },
    { term: 'Bridge Officer', cat: 'Bridge Crew', def: 'Continuous Delivery specialist auditing tests, CI triggers, stream stability, release workflows, static gates, and rollback automation.' },
    { term: 'Canonical JSON', cat: 'Cryptography', def: 'Recursively key-sorted JSON serialization ensuring identical logical objects produce byte-identical SHA-256 hashes.' },
    { term: 'Capability Dropping (--cap-drop=ALL)', cat: 'Containers', def: 'Linux kernel control removing all privileged root capabilities from a container process.' },
    { term: 'Challenge Resolution', cat: 'Bridge Crew', def: 'Round 2 outcome in PartyModeOrchestrator classifying peer challenges as CONFIRMED, REBUTTED_BY_EVIDENCE, or ESCALATED.' },
    { term: 'Compaction (context.compacted)', cat: 'Harnesses', def: 'Truncation of an AI chat window at token limits; solved by persisting intermediate thinking, dead-ends, and lessons in .numberone.' },
    { term: 'Content-Addressed Storage (CAS)', cat: 'Storage', def: 'Blob store (.numberone/stream/blobs/<sha256>) where filename equals the SHA-256 hash of content.' },
    { term: 'Counterfactual Replay', cat: 'Evolution', def: 'Testing candidate officer practices on labeled compliant/violating virtual file maps to prove positive KPI delta > 0 before activation.' },
    { term: 'Crockford Base32', cat: 'Cryptography', def: '32-character unambiguous alphabet used to encode 128-bit ULIDs into 26 sortable characters.' },
    { term: 'Dead-End (attempt.failed)', cat: 'Memory', def: 'Recorded failed hypothesis or approach surfaced during consultation so future AI sessions never repeat it.' },
    { term: 'Deterministic Replay', cat: 'Event Sourcing', def: 'Property of ReplayEngine guaranteeing events[1..k] always fold to the exact same WorkspaceProjection and snapshotDigest.' },
    { term: 'Directive (DirectiveRecord)', cat: 'Authority', def: 'Scoped advisory, mandatory, or blocking rule carrying forbiddenPatterns and requiredPatterns enforced by AuthorityEngine.' },
    { term: 'Documentary (WorkspaceDocumentary)', cat: 'Memory', def: 'Chronological, chapter-structured Markdown narrative compiled from raw atomic stream events.' },
    { term: 'Drilldown', cat: 'Visualization', def: 'Archify cross-diagram navigation linking overview nodes to child HTML diagrams with automatic Back controls.' },
    { term: 'Engineering Officer', cat: 'Bridge Crew', def: 'Infrastructure & runtime specialist auditing version pinning, lockfiles, containers, config docs, shutdown handling, and crash debt.' },
    { term: 'EPIPE', cat: 'POSIX', def: 'Broken pipe signal/error handled gracefully in NumberOneMcpServer when an IDE closes stdio pipes.' },
    { term: 'Fallback Fields', cat: 'Persistence', def: 'Large blobs or rich SoR fields exceeding GitHub/Jira limits that remain intact in .numberone/stream/blobs/ via n1://fallback/<sha256>.' },
    { term: 'fsync', cat: 'POSIX', def: 'Kernel system call flushing buffered file writes from volatile RAM to persistent disk media.' },
    { term: 'Genesis Hash (GENESIS_HASH)', cat: 'Cryptography', def: '64-zero hex string used as prevHash for sequence event #1 (workspace.attached).' },
    { term: 'GitHub Projects v2', cat: 'Persistence', def: 'GraphQL Scrum planning board integrated by GitHubPersistenceAdapter for automated item enrollment and status updates.' },
    { term: 'Harness-Agnostic', cat: 'Harnesses', def: 'Zero lock-in to any IDE or vendor; operates identically across 24+ harnesses via .numberone/, CLI, hooks, shims, and stdio MCP.' },
    { term: 'Hash Chain', cat: 'Cryptography', def: 'Tamper-evident chain where event k embeds prevHash = event[k-1].hash and computes SHA-256 over canonicalJson.' },
    { term: 'Intermediate Thinking (chat.thinking)', cat: 'Memory', def: 'Mid-task reasoning steps persisted to the stream so downstream sessions inherit why decisions were made.' },
    { term: 'JQL (Jira Query Language)', cat: 'Persistence', def: 'Query syntax used by JiraPersistenceAdapter to pull external Jira Scrum changes into the stream.' },
    { term: 'JSON-RPC 2.0', cat: 'Protocols', def: 'Stateless request/response framing protocol underlying MCP over newline-delimited stdio.' },
    { term: 'KPI (Key Performance Indicator)', cat: 'Evolution', def: '0..100 quantitative score per officer (runtime_readiness_score, security_posture_score, continuous_delivery_score).' },
    { term: 'L4 Privilege Boundary', cat: 'Security', def: 'MCP server enforcement blocking AI clients from forging privileged L1-L3 directives, officer promotions, or shell benchmarks.' },
    { term: 'Lesson Learned (LessonRecord)', cat: 'Memory', def: 'Structured record of problem, rootCause, failedApproaches, resolution, preventionRule, and errorSignatures.' },
    { term: 'MCP (Model Context Protocol)', cat: 'Protocols', def: 'Open standard connecting AI harnesses to Number One 12 tools and 4 numberone:// resources over stdio.' },
    { term: 'O_NOFOLLOW', cat: 'POSIX', def: 'POSIX open(2) flag rejecting symbolic links at the target path to prevent symlink-swap TOCTOU escapes.' },
    { term: 'PID Start Ticks (/proc/<pid>/stat)', cat: 'POSIX', def: 'Linux kernel clock-tick timestamp (field 22) bound to daemon.pid and lockfiles to prevent recycled-PID collisions.' },
    { term: 'Prototype Pollution', cat: 'Security', def: 'JavaScript object injection (__proto__, constructor, prototype) blocked globally by isSafeRecordKey.' },
    { term: 'Reconcile (n1 reconcile)', cat: 'Watchers', def: 'Diffing live workspace files against WorkspaceProjection to record manual edits made while n1 watch was stopped.' },
    { term: 'ReDoS (CWE-1333)', cat: 'Security', def: 'Catastrophic regex backtracking attack prevented by validateRegexSafety and O(N*M) matchGlobLinear.' },
    { term: 'Scoped Environment Variable', cat: 'Security', def: 'Origin-bound credential lookup (resolveScopedEnvVar) preventing config files from exfiltrating unrelated host env secrets.' },
    { term: 'Security Officer', cat: 'Bridge Crew', def: 'AppSec & supply-chain specialist auditing secrets, 40-char Action SHAs, permissions, code sinks, containers, and Dependabot.' },
    { term: 'Semantic Passport', cat: 'Visualization', def: 'Interactive Archify inspector showing node explanations, verified Git file/line citations, payloads, and child drilldowns.' },
    { term: 'Snapshot Digest (snapshotDigest)', cat: 'Cryptography', def: 'Canonical SHA-256 checksum inside projections/state.json verifying cache integrity before skipping full replay.' },
    { term: 'SoR (System of Record)', cat: 'Event Sourcing', def: 'Authoritative source of truth for workspace history, lessons, directives, issues, and officer posture.' },
    { term: 'SSRF (CWE-918)', cat: 'Security', def: 'Server-Side Request Forgery mitigated in resilientFetch by blocking RFC 1918, loopback, CGNAT, and 169.254.169.254 metadata IPs.' },
    { term: 'Sync Ledger', cat: 'Persistence', def: 'Local mapping table (.numberone/sync/ledger.json) linking local event ULIDs to remote Directory, GitHub, and Jira IDs.' },
    { term: 'Time-Travel Replay', cat: 'Event Sourcing', def: 'Rebuilding WorkspaceProjection at any historical --until-seq or --until-time without mutating current state.' },
    { term: 'ULID', cat: 'Cryptography', def: '128-bit Universally Unique Lexicographically Sortable Identifier ordering stream events chronologically.' },
    { term: 'Veto (crew.veto)', cat: 'Bridge Crew', def: 'Critical officer block during Party Mode that automatically issues an active L2 blocking directive.' }
  ];

  // =========================================================================
  // SHARED CLIPBOARD HELPER
  // =========================================================================
  function copyText(text, btn) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return;
    navigator.clipboard.writeText(text).then(function () {
      const prev = btn.textContent;
      btn.textContent = 'Copied';
      setTimeout(function () {
        btn.textContent = prev;
      }, 1400);
    }).catch(function () {
      // Ignore clipboard permission denials in restricted frames
    });
  }

  function buildCodePanel(labelText, codeText, copyLabel) {
    const panel = document.createElement('div');
    panel.className = 'code-panel';

    const header = document.createElement('div');
    header.className = 'code-panel-header';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = labelText;

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = copyLabel || 'Copy';
    copyBtn.addEventListener('click', function () {
      copyText(codeText, copyBtn);
    });

    header.appendChild(labelSpan);
    header.appendChild(copyBtn);

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = codeText;
    pre.appendChild(code);

    panel.appendChild(header);
    panel.appendChild(pre);
    return panel;
  }

  // Bind static copy buttons inside index.html
  Array.from(document.querySelectorAll('[data-copy-target]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      const targetId = btn.getAttribute('data-copy-target');
      if (!targetId) return;
      const targetEl = document.getElementById(targetId);
      if (targetEl && targetEl.textContent) {
        copyText(targetEl.textContent, btn);
      }
    });
  });

  // =========================================================================
  // MODULE A: THEME TOGGLE
  // =========================================================================
  const themeBtn = document.getElementById('theme-toggle-btn');
  const savedTheme = localStorage.getItem('n1-docs-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  function syncThemeLabel() {
    if (!themeBtn) return;
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    themeBtn.textContent = cur === 'dark' ? 'Light Theme' : 'Dark Theme';
  }
  syncThemeLabel();
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('n1-docs-theme', next);
      syncThemeLabel();
    });
  }

  // =========================================================================
  // MODULE B: INTERACTIVE "A DAY WITH NUMBER ONE" STORY STEPPER
  // =========================================================================
  const storyTabsEl = document.getElementById('story-step-tabs');
  const storyStageEl = document.getElementById('story-stage');
  const storyToggleCmdBtn = document.getElementById('story-toggle-cmd-btn');
  let activeStoryIndex = 0;
  let showStoryCommands = false;

  function renderStoryStage() {
    if (!storyStageEl) return;
    const step = DAY_STORY_STEPS[activeStoryIndex];
    storyStageEl.textContent = '';

    const quote = document.createElement('p');
    quote.className = 'story-quote';
    quote.textContent = step.quote;

    const heading = document.createElement('h4');
    heading.style.margin = '0 0 0.25rem';
    heading.style.fontSize = '1.05rem';
    heading.textContent = step.title;

    const grid = document.createElement('div');
    grid.className = 'story-scene-grid';

    const cols = [
      { label: 'What Happens', text: step.whatHappens },
      { label: 'What Number One Does Quietly', text: step.whatN1Does },
      { label: 'Why It Helps You', text: step.whyItMatters }
    ];
    cols.forEach(function (c) {
      const box = document.createElement('div');
      box.className = 'story-col';
      const lbl = document.createElement('span');
      lbl.className = 'story-col-label';
      lbl.textContent = c.label;
      const p = document.createElement('p');
      p.textContent = c.text;
      box.appendChild(lbl);
      box.appendChild(p);
      grid.appendChild(box);
    });

    storyStageEl.appendChild(quote);
    storyStageEl.appendChild(heading);
    storyStageEl.appendChild(grid);

    if (showStoryCommands) {
      const wrap = document.createElement('div');
      wrap.className = 'story-cmd-wrap';
      wrap.appendChild(buildCodePanel(step.commandLabel, step.command, 'Copy Command'));
      storyStageEl.appendChild(wrap);
    }

    if (storyTabsEl) {
      Array.from(storyTabsEl.children).forEach(function (btn, idx) {
        const isActive = idx === activeStoryIndex;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
  }

  if (storyTabsEl) {
    DAY_STORY_STEPS.forEach(function (step, idx) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'story-step-btn' + (idx === 0 ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
      btn.id = 'story-tab-' + step.id;
      btn.textContent = step.shortLabel;
      btn.addEventListener('click', function () {
        activeStoryIndex = idx;
        renderStoryStage();
      });
      storyTabsEl.appendChild(btn);
    });
    renderStoryStage();
  }

  if (storyToggleCmdBtn) {
    storyToggleCmdBtn.addEventListener('click', function () {
      showStoryCommands = !showStoryCommands;
      storyToggleCmdBtn.setAttribute('aria-pressed', showStoryCommands ? 'true' : 'false');
      storyToggleCmdBtn.textContent = showStoryCommands
        ? 'Hide Behind-the-Scenes Command'
        : 'Show Behind-the-Scenes Command';
      renderStoryStage();
    });
  }

  // =========================================================================
  // MODULE C: INTERACTIVE KIDS & SCHOOL PROJECTS LAB
  // =========================================================================
  const kidsFilterEl = document.getElementById('kids-filter-pills');
  const kidsListEl = document.getElementById('kids-project-list');
  const kidsDetailEl = document.getElementById('kids-project-detail');
  let activeKidsFilter = 'all';
  let selectedKidsProject = KIDS_PROJECTS[0];

  function renderKidsDetail(proj) {
    if (!kidsDetailEl) return;
    kidsDetailEl.textContent = '';

    const badges = document.createElement('div');
    badges.className = 'kids-meta-badges';

    const modeChip = document.createElement('span');
    modeChip.className = proj.mode === 'library' ? 'meta-chip meta-chip-sky' : 'meta-chip meta-chip-emerald';
    modeChip.textContent = proj.modeLabel;

    const gradeChip = document.createElement('span');
    gradeChip.className = 'meta-chip';
    gradeChip.textContent = proj.grades;

    const subjChip = document.createElement('span');
    subjChip.className = 'meta-chip';
    subjChip.textContent = proj.subject;

    badges.appendChild(modeChip);
    badges.appendChild(gradeChip);
    badges.appendChild(subjChip);

    const h3 = document.createElement('h3');
    h3.style.margin = '0.2rem 0 0.5rem';
    h3.style.fontSize = '1.25rem';
    h3.textContent = proj.title;

    const desc = document.createElement('p');
    desc.style.margin = '0 0 0.9rem';
    desc.style.color = 'var(--text-secondary)';
    desc.textContent = proj.summary;

    const stepsTitle = document.createElement('strong');
    stepsTitle.style.fontSize = '0.88rem';
    stepsTitle.textContent = 'Step-by-Step Guide:';

    const ol = document.createElement('ol');
    ol.className = 'kids-steps';
    proj.steps.forEach(function (st) {
      const li = document.createElement('li');
      li.textContent = st;
      ol.appendChild(li);
    });

    const codePanel = buildCodePanel(proj.codeLabel, proj.code, 'Copy Code');

    const teacherBox = document.createElement('div');
    teacherBox.className = 'teacher-box';
    const tLabel = document.createElement('strong');
    tLabel.textContent = 'What You Can Show Your Teacher or Judges';
    const tText = document.createElement('span');
    tText.textContent = proj.teacherNote;
    teacherBox.appendChild(tLabel);
    teacherBox.appendChild(tText);

    kidsDetailEl.appendChild(badges);
    kidsDetailEl.appendChild(h3);
    kidsDetailEl.appendChild(desc);
    kidsDetailEl.appendChild(stepsTitle);
    kidsDetailEl.appendChild(ol);
    kidsDetailEl.appendChild(codePanel);
    kidsDetailEl.appendChild(teacherBox);
  }

  function renderKidsList() {
    if (!kidsListEl) return;
    kidsListEl.textContent = '';

    const visible = KIDS_PROJECTS.filter(function (p) {
      return activeKidsFilter === 'all' || p.mode === activeKidsFilter;
    });

    if (visible.length > 0 && visible.indexOf(selectedKidsProject) === -1) {
      selectedKidsProject = visible[0];
      renderKidsDetail(selectedKidsProject);
    }

    visible.forEach(function (p) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'kids-proj-btn-' + p.id;
      btn.className = 'kids-project-btn' + (p.id === selectedKidsProject.id ? ' active' : '');

      const titleSpan = document.createElement('span');
      titleSpan.className = 'kids-btn-title';
      titleSpan.textContent = p.title;

      const metaSpan = document.createElement('span');
      metaSpan.className = 'kids-btn-meta';
      metaSpan.textContent = p.modeLabel + ' · ' + p.grades;

      btn.appendChild(titleSpan);
      btn.appendChild(metaSpan);

      btn.addEventListener('click', function () {
        selectedKidsProject = p;
        renderKidsList();
        renderKidsDetail(p);
      });
      kidsListEl.appendChild(btn);
    });
  }

  if (kidsFilterEl) {
    const filterDefs = [
      { id: 'all', label: 'All (5)' },
      { id: 'cli', label: 'No-Code Commands (3)' },
      { id: 'library', label: 'JavaScript Library (2)' }
    ];
    filterDefs.forEach(function (f) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'kids-filter-' + f.id;
      btn.className = 'filter-pill' + (f.id === activeKidsFilter ? ' active' : '');
      btn.textContent = f.label;
      btn.addEventListener('click', function () {
        activeKidsFilter = f.id;
        Array.from(kidsFilterEl.children).forEach(function (c) {
          c.classList.toggle('active', c.id === 'kids-filter-' + f.id);
        });
        renderKidsList();
      });
      kidsFilterEl.appendChild(btn);
    });
  }
  renderKidsList();
  renderKidsDetail(selectedKidsProject);

  // =========================================================================
  // MODULE C2: INTERACTIVE 3D SAMPLES GALLERY (THREE.JS + ARCHIFY)
  // =========================================================================
  const samples3dFilterEl = document.getElementById('samples-3d-filter');
  const samples3dCardsEl = document.getElementById('samples-3d-cards');
  const samples3dFrame = document.getElementById('samples-3d-frame');
  const samples3dCaption = document.getElementById('samples-3d-caption');
  const samples3dOpenThree = document.getElementById('samples-3d-open-three');
  const samples3dOpenDiagram = document.getElementById('samples-3d-open-diagram');
  const samples3dOpenExplainer = document.getElementById('samples-3d-open-explainer');
  const samples3dOpenSource = document.getElementById('samples-3d-open-source');
  const viewModeBtns = Array.from(document.querySelectorAll('[data-viewmode]'));

  let active3dAudience = 'all';
  let active3dSample = THREE_SAMPLES[0];
  let active3dViewMode = 'three';

  function sync3dStage() {
    if (!active3dSample) return;
    let targetSrc = active3dSample.threePath;
    if (active3dViewMode === 'diagram') targetSrc = active3dSample.diagramPath;
    else if (active3dViewMode === 'explainer') targetSrc = active3dSample.explainerPath;

    if (samples3dFrame) samples3dFrame.setAttribute('src', targetSrc);
    if (samples3dCaption) samples3dCaption.textContent = active3dSample.caption;
    if (samples3dOpenThree) samples3dOpenThree.setAttribute('href', active3dSample.threePath);
    if (samples3dOpenDiagram) {
      samples3dOpenDiagram.setAttribute('href', active3dSample.diagramPath);
      samples3dOpenDiagram.textContent = 'Open ' + active3dSample.diagramLabel;
    }
    if (samples3dOpenExplainer) samples3dOpenExplainer.setAttribute('href', active3dSample.explainerPath);
    if (samples3dOpenSource) samples3dOpenSource.setAttribute('href', active3dSample.sourceUrl);

    viewModeBtns.forEach(function (b) {
      const active = b.getAttribute('data-viewmode') === active3dViewMode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function render3dSampleCards() {
    if (!samples3dCardsEl) return;
    samples3dCardsEl.textContent = '';

    const visible = THREE_SAMPLES.filter(function (s) {
      return active3dAudience === 'all' || s.audience === active3dAudience;
    });
    if (visible.length > 0 && visible.indexOf(active3dSample) === -1) {
      active3dSample = visible[0];
    }

    visible.forEach(function (sample) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'sample-3d-card-' + sample.id;
      btn.setAttribute('role', 'tab');
      const isSelected = sample.id === active3dSample.id;
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      btn.className =
        'sample-3d-card' +
        (sample.audience === 'kids' ? ' sample-kids' : '') +
        (isSelected ? ' active' : '');

      const badge = document.createElement('span');
      badge.className = 'sample-3d-badge';
      badge.textContent = sample.badge;

      const title = document.createElement('span');
      title.className = 'sample-3d-title';
      title.textContent = sample.title;

      const sub = document.createElement('span');
      sub.className = 'sample-3d-sub';
      sub.textContent = sample.subtitle;

      btn.appendChild(badge);
      btn.appendChild(title);
      btn.appendChild(sub);

      btn.addEventListener('click', function () {
        active3dSample = sample;
        render3dSampleCards();
        sync3dStage();
      });
      samples3dCardsEl.appendChild(btn);
    });
  }

  if (samples3dFilterEl) {
    const audDefs = [
      { id: 'all', label: 'All 3D Samples (4)' },
      { id: 'kids', label: 'Kids & School (2)' },
      { id: 'advanced', label: 'Advanced Technical (2)' }
    ];
    audDefs.forEach(function (a) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'samples-3d-aud-' + a.id;
      btn.className = 'filter-pill' + (a.id === active3dAudience ? ' active' : '');
      btn.textContent = a.label;
      btn.addEventListener('click', function () {
        active3dAudience = a.id;
        Array.from(samples3dFilterEl.children).forEach(function (c) {
          c.classList.toggle('active', c.id === 'samples-3d-aud-' + a.id);
        });
        render3dSampleCards();
        sync3dStage();
      });
      samples3dFilterEl.appendChild(btn);
    });
  }

  viewModeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      const mode = btn.getAttribute('data-viewmode');
      if (mode === 'three' || mode === 'diagram' || mode === 'explainer') {
        active3dViewMode = mode;
        sync3dStage();
      }
    });
  });

  render3dSampleCards();
  sync3dStage();

  // =========================================================================
  // MODULE D: ARCHIFY INTERACTIVE THEATER (24 COMPILED ARTIFACTS)
  // =========================================================================
  const tabsContainer = document.getElementById('archify-tabs');
  const stageFrame = document.getElementById('archify-stage-frame');
  const stageCaption = document.getElementById('archify-stage-caption');
  const stageOpenLink = document.getElementById('archify-open-full');
  let activeArtifactId = ARCHIFY_ARTIFACTS[0].id;

  function selectArtifact(art) {
    activeArtifactId = art.id;
    if (stageFrame) stageFrame.setAttribute('src', art.path);
    if (stageCaption) stageCaption.textContent = art.caption;
    if (stageOpenLink) stageOpenLink.setAttribute('href', art.path);
    if (tabsContainer) {
      Array.from(tabsContainer.children).forEach(function (btn) {
        const isActive = btn.getAttribute('data-art-id') === art.id;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
  }

  if (tabsContainer) {
    ARCHIFY_ARTIFACTS.forEach(function (art) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'tab');
      btn.className = 'artifact-tab' + (art.id === activeArtifactId ? ' active' : '');
      btn.setAttribute('data-art-id', art.id);
      btn.setAttribute('aria-selected', art.id === activeArtifactId ? 'true' : 'false');
      btn.textContent = art.label + ' [' + art.badge + ']';
      btn.addEventListener('click', function () {
        selectArtifact(art);
      });
      tabsContainer.appendChild(btn);
    });
    selectArtifact(ARCHIFY_ARTIFACTS[0]);
  }

  // =========================================================================
  // MODULE E: 24+ AI HARNESSES & ON-PREMISES CONFIGURATOR
  // =========================================================================
  const harnessListEl = document.getElementById('harness-list');
  const harnessSearchEl = document.getElementById('harness-search');
  const harnessDetailEl = document.getElementById('harness-detail');
  let selectedHarness = HARNESS_GUIDES[0];

  function renderHarnessDetail(item) {
    if (!harnessDetailEl) return;
    harnessDetailEl.textContent = '';

    const kicker = document.createElement('span');
    kicker.className = 'section-kicker';
    kicker.textContent = item.category + ' · ' + item.configFile;

    const title = document.createElement('h3');
    title.style.marginTop = '0.2rem';
    title.textContent = item.name;

    const desc = document.createElement('p');
    desc.style.color = 'var(--text-secondary)';
    desc.textContent = item.summary;

    const codePanel = buildCodePanel(item.configFile, item.snippet, 'Copy Snippet');

    const verifyNote = document.createElement('p');
    verifyNote.style.fontSize = '0.86rem';
    verifyNote.style.color = 'var(--text-muted)';
    verifyNote.textContent = 'Verify after setup: run "n1 doctor && n1 verify --local-only && n1 brief" inside your attached workspace.';

    harnessDetailEl.appendChild(kicker);
    harnessDetailEl.appendChild(title);
    harnessDetailEl.appendChild(desc);
    harnessDetailEl.appendChild(codePanel);
    harnessDetailEl.appendChild(verifyNote);
  }

  function renderHarnessList(filterText) {
    if (!harnessListEl) return;
    harnessListEl.textContent = '';
    const q = (filterText || '').trim().toLowerCase();
    HARNESS_GUIDES.filter(function (h) {
      return !q || h.name.toLowerCase().includes(q) || h.category.toLowerCase().includes(q) || h.configFile.toLowerCase().includes(q);
    }).forEach(function (h) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'harness-btn' + (h.id === selectedHarness.id ? ' active' : '');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = h.name;
      const badgeSpan = document.createElement('span');
      badgeSpan.className = 'harness-badge';
      badgeSpan.textContent = h.category;
      btn.appendChild(nameSpan);
      btn.appendChild(badgeSpan);
      btn.addEventListener('click', function () {
        selectedHarness = h;
        renderHarnessList(harnessSearchEl ? harnessSearchEl.value : '');
        renderHarnessDetail(h);
      });
      harnessListEl.appendChild(btn);
    });
  }

  if (harnessSearchEl) {
    harnessSearchEl.addEventListener('input', function () {
      renderHarnessList(harnessSearchEl.value);
    });
  }
  renderHarnessList('');
  renderHarnessDetail(selectedHarness);

  // =========================================================================
  // MODULE F: 4-TAB TECHNICAL REFERENCE HUB (CLI, MCP, CODEBASE, GOVERNANCE)
  // =========================================================================
  const refTabs = Array.from(document.querySelectorAll('.ref-tab-btn'));
  const refPanels = Array.from(document.querySelectorAll('.ref-panel'));

  refTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      const targetId = tab.getAttribute('data-ref-panel');
      refTabs.forEach(function (t) {
        const active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      refPanels.forEach(function (p) {
        p.hidden = p.id !== targetId;
      });
    });
  });

  // F.1 CLI Commands Explorer
  const cliTbody = document.getElementById('cli-tbody');
  const cliSearchEl = document.getElementById('cli-search');
  const cliPillsEl = document.getElementById('cli-pills');
  let activeCliCat = 'all';

  function renderCliTable() {
    if (!cliTbody) return;
    cliTbody.textContent = '';
    const q = (cliSearchEl ? cliSearchEl.value : '').trim().toLowerCase();
    CLI_COMMANDS.filter(function (c) {
      const catOk = activeCliCat === 'all' || c.cat === activeCliCat;
      const textOk = !q || c.cmd.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q) || c.cat.toLowerCase().includes(q);
      return catOk && textOk;
    }).forEach(function (c) {
      const tr = document.createElement('tr');
      const tdCat = document.createElement('td');
      tdCat.textContent = c.cat;

      const tdCmd = document.createElement('td');
      const codeCmd = document.createElement('code');
      codeCmd.textContent = c.cmd;
      tdCmd.appendChild(codeCmd);

      const tdDesc = document.createElement('td');
      tdDesc.textContent = c.desc;

      tr.appendChild(tdCat);
      tr.appendChild(tdCmd);
      tr.appendChild(tdDesc);
      cliTbody.appendChild(tr);
    });
  }

  if (cliPillsEl) {
    ['all', 'Lifecycle & Sensors', 'Replay & Audit', 'Memory & Authority', 'Bridge Crew & Sync'].forEach(function (cat) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill' + (cat === activeCliCat ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        activeCliCat = cat;
        Array.from(cliPillsEl.children).forEach(function (c) {
          c.classList.toggle('active', c.textContent === cat);
        });
        renderCliTable();
      });
      cliPillsEl.appendChild(btn);
    });
  }
  if (cliSearchEl) {
    cliSearchEl.addEventListener('input', renderCliTable);
  }
  renderCliTable();

  // F.2 MCP Tools & Resources
  const mcpToolsGrid = document.getElementById('mcp-tools-grid');
  const mcpResTbody = document.getElementById('mcp-resources-tbody');

  if (mcpToolsGrid) {
    MCP_TOOLS.forEach(function (t) {
      const card = document.createElement('article');
      card.className = 'mcp-card';

      const top = document.createElement('div');
      top.className = 'mcp-card-top';
      const code = document.createElement('code');
      code.textContent = t.name;
      const badge = document.createElement('span');
      badge.className = 'meta-chip';
      badge.textContent = t.guard;
      top.appendChild(code);
      top.appendChild(badge);

      const p = document.createElement('p');
      p.textContent = t.desc;

      card.appendChild(top);
      card.appendChild(p);
      mcpToolsGrid.appendChild(card);
    });
  }

  if (mcpResTbody) {
    MCP_RESOURCES.forEach(function (r) {
      const tr = document.createElement('tr');
      const tdUri = document.createElement('td');
      const codeUri = document.createElement('code');
      codeUri.textContent = r.uri;
      tdUri.appendChild(codeUri);

      const tdMime = document.createElement('td');
      const codeMime = document.createElement('code');
      codeMime.textContent = r.mime;
      tdMime.appendChild(codeMime);

      const tdDesc = document.createElement('td');
      tdDesc.textContent = r.desc;

      tr.appendChild(tdUri);
      tr.appendChild(tdMime);
      tr.appendChild(tdDesc);
      mcpResTbody.appendChild(tr);
    });
  }

  // F.3 Codebase Reference Explorer
  const codeTableBody = document.getElementById('code-ref-tbody');
  const codeSearchEl = document.getElementById('code-ref-search');
  const codePillsEl = document.getElementById('code-ref-pills');
  let activeCodeGroup = 'all';

  function renderCodeTable() {
    if (!codeTableBody) return;
    codeTableBody.textContent = '';
    const q = (codeSearchEl ? codeSearchEl.value : '').trim().toLowerCase();
    CODE_MODULES.filter(function (m) {
      const groupOk = activeCodeGroup === 'all' || m.group === activeCodeGroup;
      const textOk = !q || m.path.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q);
      return groupOk && textOk;
    }).forEach(function (m) {
      const tr = document.createElement('tr');
      const tdPath = document.createElement('td');
      const codePath = document.createElement('code');
      codePath.textContent = m.path;
      tdPath.appendChild(codePath);

      const tdSym = document.createElement('td');
      const codeSym = document.createElement('code');
      codeSym.textContent = m.symbol;
      tdSym.appendChild(codeSym);

      const tdDesc = document.createElement('td');
      tdDesc.textContent = m.desc;

      tr.appendChild(tdPath);
      tr.appendChild(tdSym);
      tr.appendChild(tdDesc);
      codeTableBody.appendChild(tr);
    });
  }

  if (codePillsEl) {
    ['all', 'core', 'persistence', 'watchers', 'crew', 'harness', 'utils', 'cli'].forEach(function (grp) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill' + (grp === activeCodeGroup ? ' active' : '');
      btn.textContent = grp;
      btn.addEventListener('click', function () {
        activeCodeGroup = grp;
        Array.from(codePillsEl.children).forEach(function (c) {
          c.classList.toggle('active', c.textContent === grp);
        });
        renderCodeTable();
      });
      codePillsEl.appendChild(btn);
    });
  }
  if (codeSearchEl) {
    codeSearchEl.addEventListener('input', renderCodeTable);
  }
  renderCodeTable();

  // =========================================================================
  // MODULE G: LIVE SEARCHABLE PLAIN-ENGLISH & TECHNICAL GLOSSARY
  // =========================================================================
  const glossaryListEl = document.getElementById('glossary-grid');
  const glossarySearchEl = document.getElementById('glossary-search');
  const glossaryPillsEl = document.getElementById('glossary-pills');
  const glossaryCountEl = document.getElementById('glossary-count');
  let activeGlossaryCat = 'all';

  function renderGlossary() {
    if (!glossaryListEl) return;
    glossaryListEl.textContent = '';
    const q = (glossarySearchEl ? glossarySearchEl.value : '').trim().toLowerCase();
    const filtered = GLOSSARY_TERMS.filter(function (g) {
      const catOk = activeGlossaryCat === 'all' || g.cat === activeGlossaryCat;
      const textOk = !q || g.term.toLowerCase().includes(q) || g.cat.toLowerCase().includes(q) || g.def.toLowerCase().includes(q);
      return catOk && textOk;
    });
    if (glossaryCountEl) {
      glossaryCountEl.textContent = filtered.length + ' terms shown';
    }
    filtered.forEach(function (g) {
      const card = document.createElement('article');
      card.className = 'glossary-item';

      const h4 = document.createElement('h4');
      h4.className = 'glossary-term';
      const tSpan = document.createElement('span');
      tSpan.textContent = g.term;
      const cSpan = document.createElement('span');
      cSpan.className = 'glossary-cat';
      cSpan.textContent = g.cat;
      h4.appendChild(tSpan);
      h4.appendChild(cSpan);

      const p = document.createElement('p');
      p.className = 'glossary-def';
      p.textContent = g.def;

      card.appendChild(h4);
      card.appendChild(p);
      glossaryListEl.appendChild(card);
    });
  }

  if (glossaryPillsEl) {
    ['all', 'Plain English', 'Event Sourcing', 'Authority', 'Bridge Crew', 'Security', 'Persistence', 'Cryptography', 'POSIX', 'Harnesses', 'Visualization'].forEach(function (cat) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-pill' + (cat === activeGlossaryCat ? ' active' : '');
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        activeGlossaryCat = cat;
        Array.from(glossaryPillsEl.children).forEach(function (c) {
          c.classList.toggle('active', c.textContent === cat);
        });
        renderGlossary();
      });
      glossaryPillsEl.appendChild(btn);
    });
  }

  if (glossarySearchEl) {
    glossarySearchEl.addEventListener('input', renderGlossary);
  }
  renderGlossary();
})();
