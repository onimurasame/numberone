# How does the RoboHawks Safety Arena block unsafe motor speeds and rewind build history? {#kids-robotics-explainer}

`NumberOneAgent` protects a school robotics team with an enforceable `L2` indoor motor speed cap (`<= 80%`), verifies every driver plan through `AuthorityEngine.arbitrate()`, and replays build history step by step inside a **Three.js 3D Robotics Arena**.

- `robot.issueDirective()` registers a `blocking` `L2` rule forbidding `setSpeed(100)` on indoor tables.[](source:safety_rule)
- `robot.arbitrate()` immediately emits `BLOCK` for 100% throttle while approving both `setSpeed(75)` and a negation-aware compliant plan (`"Do not use setSpeed(100)..."`).[](source:arbitrate_plans)
- `robot.replay({ untilSeq })` powers the 3D Time-Travel slider so students watch foam rails and safety arches activate in chronological order.[](source:replay_loop)
- `scene.js` drops a glowing crimson Three.js laser barrier whenever a plan is `BLOCK`ed.[](source:three_gate)

@answer scope="Kids & Robotics Club Sample · Grades 6–12 · Live Three.js Laser Gate + Time Machine"
@meta locale=en style=product repo_url=https://github.com/onimurasame/numberone.git repo_revision=fc10c03081e1eb7b0c75c8828ec1be77b7de8e14
@source safety_rule title="Issue L2 Blocking Motor Speed Cap" path=examples/kids-robotics-arena/run.mjs lines=70:80
@source arbitrate_plans title="Arbitrate Unsafe vs Safe Driver Plans" path=examples/kids-robotics-arena/run.mjs lines=81:101
@source replay_loop title="Time-Travel Replay Loop" path=examples/kids-robotics-arena/run.mjs lines=117:138
@source three_gate title="Animate L2 Barrier & Rover Halt" path=docs/site/examples/kids-robotics-arena/scene.js lines=290:322

## How does L2 authority stop an unsafe robot plan? {#robotics-flow}

@sequence id=robot-seq title="Driver Plan vs L2 Safety Gate"
| actor student | Student Driver | external |
| actor auth | AuthorityEngine | security | source:arbitrate_plans |
| actor store | StreamStore | database | source:replay_loop |
| actor arena | Three.js Arena | frontend | source:three_gate |
| phase | Check Speed Command Before Running |
| student | auth | arbitrate('setSpeed(100)') | security |
| auth | store | check L2 blocking rule | emphasis |
| store | auth | forbidden pattern matched | return |
| auth | arena | verdict = BLOCK | security |
| arena | student | Drop crimson laser & halt rover | return |

@code source=arbitrate_plans language=js

## Why does affirmative-clause parsing matter for kids & AI helpers? {#negation-compare}

| Submitted Driver Plan | Contains `setSpeed(100)`? | Number One Verdict | 3D Arena Behavior |
| --- | --- | --- | --- |
| Plan A: `Run using setSpeed(100)` | Yes (affirmative) | `BLOCK` {bad:Blocked} | Crimson laser drops & rover stops |
| Plan B: `Run smooth lap at setSpeed(75)` | No | `APPROVE_WITH_CONDITIONS` {good:Cleared} | Emerald gate opens & rover cruises |
| Plan C: `Do not use setSpeed(100); run 68%` | Yes (negated compliance) | `APPROVE_WITH_CONDITIONS` {good:Smart Pass} | Sky-blue gate opens (zero false alarm!) |

@facts
| Active Blocking Directives | `1` (`Indoor motor power safety cap <= 80%`) |
| Notebook Integrity Seal | `9/9` verified SHA-256 stream events |
| Competition Readiness | Exports a judge-ready Engineering Notebook documentary |

## Explore the Robotics Arena {#robotics-checklist}

- [ ] Run `node examples/kids-robotics-arena/run.mjs` to see all 3 live arbitration verdicts in your terminal.
- [ ] In the **Three.js 3D Arena**, click **Plan A (100%)** and watch the rover safely halt at the red `L2` laser gate.
- [ ] Switch to **Plan B (75%)** or **Plan C (68%)** and watch the barrier lift so the rover glides along the black line track.
- [ ] Drag the **Time-Travel Scrubber** back to `seq #2` to see the table before the foam guardrails and safety arch were installed!
