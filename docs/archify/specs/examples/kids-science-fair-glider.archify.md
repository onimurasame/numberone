# How does the Paper Airplane Science Fair Lab turn flight trials into 3D visuals and a printable report? {#kids-glider-explainer}

Every hypothesis, stalled dead-end flight, balance discovery, and final wingtip decision is saved by `NumberOneAgent` in a tamper-evident local notebook — powering both a **Three.js 3D Flight Lab** and a **9-chapter Science Fair Documentary**.

- `agent.recordFailedAttempt()` saves Trial #2's tail-weight stall (`1.4m`) so teammates never repeat the flop.[](source:dead_end_log)
- `agent.captureLesson()` records nose paperclip balance (`9.4m`) and symmetrical `1cm` wingtips (`10.6m`).[](source:lesson_log)
- `agent.consult()` warns classmates before retrying tail weights and surfaces verified aerodynamics tips.[](source:consult_call)
- `scene.js` renders all 4 parabolic flight curves and paper airplanes in Three.js with a live time-travel scrubber.[](source:three_glider)

@answer scope="Kids & School Project Sample · Grades 5–12 · Zero Cloud Account Required"
@meta locale=en style=product repo_url=https://github.com/Shadow-Software-Platform/numberone.git repo_revision=fc10c03081e1eb7b0c75c8828ec1be77b7de8e14
@source dead_end_log title="Log Tail-Weight Stall Dead End" path=examples/kids-science-fair-glider/run.mjs lines=56:64
@source lesson_log title="Capture Verified Aerodynamics Lesson" path=examples/kids-science-fair-glider/run.mjs lines=65:80
@source consult_call title="Consult Notebook Before Retrying" path=examples/kids-science-fair-glider/run.mjs lines=109:117
@source three_glider title="Build 3D Paper Airplane Geometry" path=docs/site/examples/kids-science-fair-glider/scene.js lines=68:116

## How do science fair notes become a 3D flight replay? {#glider-pipeline}

@architecture id=glider-pipe title="Science Fair Notebook to Three.js Runway"
| role frontend | Student Input |
| role backend | NumberOneAgent |
| role database | .numberone/ Stream |
| role security | Integrity & Shield |
| role cloud | 3D Runway & Report |
| notes | Hypotheses & Trials | frontend | source:dead_end_log |
| agent | NumberOneAgent | backend | source:lesson_log |
| stream | SHA-256 Diary | database |
| shield | Dead-End Shield | security | source:consult_call |
| three | Three.js 3D Lab + Report | cloud | source:three_glider |
| notes > agent | think / dead-end / lesson |
| agent > stream | hash-chained events | emphasis |
| stream > shield | consult() + verify() |
| stream > three | data.json + documentary | emphasis |

@steps id=glider-steps
| attach | Initialize Notebook | `agent.attach()` creates a private `.numberone/` notebook right inside the project folder. | glider-pipe | agent |
| fail | Save Flopped Trials | `recordFailedAttempt()` saves Trial #2's tail-weight stall so nobody tries it again. | glider-pipe | notes |
| learn | Capture Discoveries | `captureLesson()` links the stall root cause to the 1-paperclip nose fix. | glider-pipe | stream |
| warn | Consult Before Changing | `agent.consult()` immediately warns classmates against tail weights. | glider-pipe | shield |
| visualize | Explore in 3D & Print | Three.js animates all 4 flights while `buildDocumentary()` writes a 9-chapter report. | glider-pipe | three |

## What code captures a Science Fair lesson? {#glider-code}

@code source=lesson_log language=js

```mermaid title="Measured Flight Distance Across 4 Science Fair Trials (meters)"
xychart-beta
  x-axis ["Trial 1 Baseline", "Trial 2 Tail-Weight", "Trial 3 Nose Clip", "Trial 4 Wingtips"]
  y-axis "Distance (m)" 0 --> 12
  bar "Flight Distance" [5.8, 1.4, 9.4, 10.6]
```

@facts
| Verified Stream Entries | `9` tamper-evident SHA-256 events |
| Winning Flight Distance | `10.6 m` (+82% over baseline classic fold) |
| Printable Output | `9`-chapter Science Fair Documentary (`Markdown`) |

## Try this sample yourself {#glider-checklist}

- [ ] Run `node examples/kids-science-fair-glider/run.mjs` from the repository root.
- [ ] Open the interactive **Three.js 3D Flight Lab** and click Trial #2 (red stall arc) vs. Trial #4 (green winner).
- [ ] Drag the **Time-Travel Scrubber** from `seq #1` to `seq #9` to watch the experiment unfold step by step.
- [ ] Swap in your own science fair trials (plant growth, bridge strength, or solar oven temps) and generate your own documentary!
