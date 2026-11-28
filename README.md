# Number One (`n1`)

**The project memory notebook that never forgets — for kids, students, creators, teams, and AI helpers.**

[![npm version](https://img.shields.io/npm/v/%40shadow-software-platform%2Fnumberone.svg?color=cb3837)](https://www.npmjs.com/package/@shadow-software-platform/numberone)
[![CI](https://github.com/Shadow-Software-Platform/numberone/actions/workflows/ci.yml/badge.svg)](https://github.com/Shadow-Software-Platform/numberone/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Shadow-Software-Platform/numberone/actions/workflows/codeql.yml/badge.svg)](https://github.com/Shadow-Software-Platform/numberone/actions/workflows/codeql.yml)
[![Documentation Website](https://github.com/Shadow-Software-Platform/numberone/actions/workflows/pages.yml/badge.svg)](https://shadow-software-platform.github.io/numberone/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-059669.svg)](./LICENSE)

> **Visit the Main Documentation Website:**  
> **[https://shadow-software-platform.github.io/numberone/](https://shadow-software-platform.github.io/numberone/)**  
> Starts with an expanded plain-English guide and an interactive **Kids & School Projects Lab**, then opens into the complete technical reference, 16 interactive visual architecture maps, copy-paste setup for 24+ AI tools, code explorer, and searchable dictionary.

---

## What Is Number One? (In Everyday Words)

Imagine you are working on an important project — maybe a science fair experiment, a video game for coding club, a book report, or a piece of software at work.

Every time you start a new AI chat, switch to a different AI tool, or come back to your folder a week later, the same frustrating things happen:
- **Good thinking disappears** — you remember *what* you changed, but not *why* you chose it.
- **Old mistakes repeat** — an AI helper tries the exact same broken idea you already ruled out yesterday.
- **Important rules get forgotten** — a fresh chat doesn't know the ground rules you already agreed on.
- **Telling the story is hard** — at the end, nobody has a clear timeline of everything you tried and learned.

**Number One fixes all of that.** It sits quietly inside your project folder like a **smart, un-erasable notebook** paired with **three friendly project checkers**.

### Five Everyday Superpowers

1. **A Project Diary That Writes Itself**  
   Number One quietly keeps track of your saves, notes, ideas, choices, and milestones in one neat, tamper-evident log right inside your folder.
2. **A "Don't Make That Mistake Again" Shield**  
   Whenever something fails or breaks — and when you figure out how to fix it — Number One remembers the lesson so neither you nor an AI helper wastes time hitting the same dead end twice.
3. **Project Rules That Always Stick**  
   You can set simple ground rules for your project. Even if an AI chat resets or forgets, Number One speaks up first and keeps your rules in charge.
4. **Three Built-In Project Helpers**  
   Anytime you want a second opinion, Number One brings together three helpers who check your folder and give you clear `0–100` scores and simple to-do tips:
   - **The Builder Helper** *(Engineering Officer)* — Checks that your project is organized, clearly explained, and runs smoothly.
   - **The Safety Helper** *(Security Officer)* — Watches out for accidental passwords, unsafe shortcuts, or risky settings.
   - **The Launch Helper** *(Bridge Officer)* — Checks that your tests work and you're ready to share your project safely.
5. **A Storyteller & Time Machine**  
   Turn everything you built into a clean, chapter-by-chapter **Project Documentary** you can read or hand in — or rewind the clock to see what your project looked like at any earlier step.

Everything runs **privately on your own computer** with no account required, automatically hides accidental passwords before saving notes, and works with **any AI tool** — or with **no AI at all**.

---

## Great for Kids & School Projects!

Kids, students, coding clubs, and teachers can use Number One both as an **easy project notebook** and as a **JavaScript library** inside school coding projects!

### Idea 1: Science Fair Experiment Notebook (No Coding Needed!)

Testing which paper airplane design flies farthest? Save your hypotheses, failed tests, and big discoveries — then print a ready-to-read lab report for your teacher or tri-fold board:

```bash
n1 attach . --name "Paper Airplane Science Fair"
n1 think "Hypothesis: Adding small wingtips will help the plane fly straighter."
n1 dead-end --approach "Taped two pennies to the tail" --reason "Plane stalled and dropped early!"
n1 lesson --title "Put weight near the nose" --resolution "One paperclip on the nose flew 9.4 meters!"
n1 documentary --out my-science-fair-report.md
```

### Idea 2: Build a "Smart Study Buddy" in JavaScript (Using the `@shadow-software-platform/numberone` Library!)

Learning JavaScript in school or coding club? You can `import` Number One right into your own `.mjs` file to build a Study Buddy that remembers tricky quiz mistakes and reminds you before test day:

```javascript
import { NumberOneAgent } from '@shadow-software-platform/numberone';

const buddy = new NumberOneAgent('./my-study-notebook');
buddy.attach({ workspaceName: 'Math Study Buddy', installHooks: false, installShims: false });

// Save a lesson from a tricky homework problem
buddy.captureLesson({
  title: 'Find a common denominator before adding fractions',
  problem: 'Missed 1/2 + 1/3 on practice sheet #2',
  rootCause: 'Added the top and bottom numbers straight across',
  resolution: 'Convert to 3/6 + 2/6 = 5/6',
  preventionRule: 'Always make the bottom numbers match FIRST!',
  tags: ['math', 'fractions']
});

// Before your quiz, ask your Study Buddy what to watch out for!
const tips = buddy.consult({ intent: 'adding fractions quiz', tags: ['math', 'fractions'] });
console.log('Remember:', tips.lessons[0].lesson.preventionRule);
```

> **Want more school project ideas — including interactive 3D visualizations?**  
> Try our **[Interactive 3D Samples Gallery (Three.js + Archify)](https://shadow-software-platform.github.io/numberone/#samples-3d)** (fly 3D paper airplanes on a Science Fair runway or drive a 3D rover through an `L2` safety laser gate!), browse all runnable samples in **[`examples/README.md`](./examples/README.md)**, or read the full **[Kids & School Projects Guide (`docs/KIDS_AND_SCHOOL_PROJECTS.md`)](./docs/KIDS_AND_SCHOOL_PROJECTS.md)**!

---

## Try It in 3 Simple Steps

All you need is [Node.js](https://nodejs.org/) (version 22 or newer) installed on your computer.

```bash
# 1. Install Number One once on your computer
npm install -g @shadow-software-platform/numberone

# 2. Go into any project folder and turn Number One on
cd my-project
n1 attach .

# 3. Start recording your story, check your project, or read your project summary!
n1 brief
n1 party --topic "Is our project clean, safe, and ready to share?"
n1 documentary --out my-project-story.md
```

> **Using an AI coding assistant?**  
> Running `n1 attach .` automatically drops friendly instruction files into your folder so popular AI tools know to check Number One first. See the **[Interactive Setup Helper](https://shadow-software-platform.github.io/numberone/#installation)** or **[All-Tool Setup Guide](./docs/INSTALLATION.md)** for copy-paste instructions covering 24+ AI tools.

---

## Where to Go Next

Whether you want a friendly walkthrough, 3D interactive school projects, or every deep engineering detail, pick the guide that fits you best:

| Guide | Best For |
|---|---|
| **[Main Documentation Website (GitHub Pages)](https://shadow-software-platform.github.io/numberone/)** | **Best starting place!** Opens with the expanded plain-English walkthrough, Kids & School Projects Lab, and **4 live Three.js 3D samples**, followed by full technical specs, 24 interactive Archify visual diagrams, 24+ AI tool setup helper, code explorer, and searchable dictionary. |
| **[Interactive 3D Samples (`examples/README.md`)](./examples/README.md)** | Hands-on runnable samples with **Three.js 3D visualizations** & **Archify** diagrams — 2 for kids & school projects (Paper Airplane Flight Lab, RoboHawks Safety Arena) + 2 for advanced engineers (SHA-256 Hash-Chain Helix, BMAD Command Bridge). |
| **[Kids & School Projects Guide](./docs/KIDS_AND_SCHOOL_PROJECTS.md)** | Students, kids, coding clubs, parents, and teachers looking for fun, runnable terminal & JavaScript library projects. |
| **[Full Technical Architecture Guide](./docs/TECHNICAL_GUIDE.md)** | Software engineers and architects who want the complete deep-dive technical specification, commands, codebase map, and governance details in Markdown. |
| **[Setup for 24+ AI Tools](./docs/INSTALLATION.md)** | Connecting Number One to Claude Code, Codex, Cursor, Windsurf, Antigravity, Gemini CLI, Copilot, Cline, Zed, Aider, and more — or using it with no AI at all. |
| **[Offline, Private & Company Server Guide](./docs/ONPREM.md)** | Running Number One completely offline, in containers, or with self-hosted company tools. |
| **[Complete Code & API Reference](./docs/CODE_REFERENCE.md)** | Developers reading exact modules, classes, library methods, and command options. |
| **[Interactive Visual Diagrams Guide](./docs/ARCHIFY_GUIDE.md)** | Exploring all 24 compiled Archify visual maps, sample explainers, narrated story videos, and 3D codebase analysis. |
| **[A–Z Dictionary / Glossary](./docs/GLOSSARY.md)** | Looking up any technical word or project term in plain, clear definitions. |

---

## Free & Open Source License

Number One is free and open source under the **[GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)](./LICENSE)** (see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE)).

In plain English:
- **Free to use** for school projects, hobbies, personal work, and teams.
- **Your own projects stay 100% yours** — using Number One on your schoolwork, writing, or code never changes who owns your work or what license your project uses.
- **Shared improvements stay open** — if someone modifies Number One itself and distributes it or runs a modified version as an online service for others, they must share their improvements under the same open license.
