# Number One for Kids & School Projects

> **Welcome, young builders, students, coding clubs, parents, and teachers!**  
> You can also explore these school project examples interactively on our **[Main Documentation Website](https://onimurasame.github.io/numberone/#kids-lab)**.

Have you ever worked on a cool school project — like a science fair experiment, a video game in coding club, a robot, or a group presentation — and then realized:
- *"Wait, what did I try yesterday that broke it?"*
- *"Why did we decide to build it this way?"*
- *"My AI helper forgot our project rules again!"*
- *"My teacher wants a full lab notebook showing EVERY step we tried — not just the final poster!"*

**Number One (`n1`)** is like a **magic, un-erasable project notebook** that lives right inside your project folder. You can use it in two super easy ways:
1. **Simple Commands (No coding needed!)** — Type short commands like `n1 think`, `n1 dead-end`, `n1 lesson`, and `n1 documentary` in your terminal to track any school project.
2. **As a JavaScript Library in Your Own Code** — Import `numberone` in a Node.js school coding project (`import { NumberOneAgent } from 'numberone'`) to build smart notebooks, quiz coaches, safety checkers, or robotics logs!

---

## Before You Start (2-Minute Setup)

Ask a parent, teacher, or mentor to help you check that **Node.js (version 22 or newer)** is installed on your computer.

- **To use the simple commands (`n1`) in any project folder:**
  ```bash
  npm install -g numberone
  ```
- **To use `numberone` as a JavaScript library inside a school coding project:**
  ```bash
  mkdir my-school-project
  cd my-school-project
  npm init -y
  npm pkg set type=module
  npm install numberone
  ```

> **Good to know:** Number One runs **100% on your own computer**. You do **not** need to create an online account, pay anything, or upload your homework to the internet!

---

## Example 1: Science Fair Experiment Lab Notebook (No Coding Needed!)

**Great for:** Grades 5–12 · Science Fair, Biology, Physics, Engineering Design Projects  
**What you'll make:** A real scientific lab journal that tracks every hypothesis, failed test, and breakthrough — and turns it all into a neat report you can print for your tri-fold board!

Suppose you're testing **which paper airplane fold flies the farthest**.

```bash
# Step 1: Create your project folder and turn on Number One
mkdir paper-airplane-fair
cd paper-airplane-fair
n1 attach . --name "Paper Airplane Science Fair"

# Step 2: Write down your starting hypothesis (your idea!)
n1 think "Hypothesis: Adding small upturned wingtips will keep the dart glider flying straighter." --tags science,hypothesis

# Step 3: Record an experiment that DIDN'T work (scientists love saving dead ends!)
n1 dead-end \
  --approach "Taped two pennies to the tail of the plane" \
  --reason "Made the plane nose-up, stall, and drop after 1.2 meters" \
  --tags flight-test

# Step 4: Save the big lesson you discovered!
n1 lesson \
  --title "Weight belongs near the nose, not the tail" \
  --problem "Plane stalled and dove backward in Trial #2" \
  --root-cause "Center of gravity was too far behind the wings" \
  --resolution "Moved a single paperclip to the front nose crease; distance jumped to 9.4 meters" \
  --prevention "Always test balance point near the front third of the wing before throwing" \
  --tags flight-test,aerodynamics

# Step 5: Record your final design decision and WHY you picked it
n1 decision \
  --title "Use the Heavy-Nose Dart design for the finals" \
  --decision "Submit the dart fold with 1 paperclip on the nose and 1cm wingtips" \
  --rationale "Flew an average of 9.4 meters across 10 trials — 3 meters farther than the glider" \
  --rejected "Tail-weighted dart,Wide flat glider"

# Step 6: Turn your entire notebook into a teacher-ready Science Fair Report!
n1 documentary --out science-fair-lab-notebook.md
```

**What you can hand in to your teacher:** Open `science-fair-lab-notebook.md`! It automatically organizes every date, hypothesis, failed trial, discovery, and final decision into neat chapters showing your full scientific method from day one!

---

## Example 2: Coding Club Video Game With an AI Helper (CLI + 3 Project Helpers!)

**Great for:** Grades 6–12 · Scratch-to-JavaScript, Web Games, Coding Club, Hackathons  
**What you'll make:** A space-dodger or platformer web game where your rules stay protected — even if you switch AI assistants or start a brand-new chat!

```bash
# Step 1: Turn on Number One inside your game folder
cd my-space-game
n1 attach . --name "Asteroid Dodger Game"

# Step 2: Start watching your files quietly in the background
n1 watch

# Step 3: Set a project ground rule so an AI helper never breaks your game controls!
n1 directive \
  --title "Keep arrow-key controls working and avoid eval" \
  --directive "Always keep keyboard arrow keys working for school Chromebooks and never use eval() in game scripts." \
  --rationale "Chromebooks don't all have touchscreens, and eval() can crash or make the game unsafe." \
  --forbid "eval(" \
  --severity blocking

# Step 4: Check an idea against your rules BEFORE changing your code
n1 arbitrate --action "Parse high scores with eval(savedScore)"
# Result: BLOCK! Number One stops the unsafe idea immediately!

n1 arbitrate --action "Parse high scores with JSON.parse(savedScore)"
# Result: APPROVE! Safe to build!

# Step 5: Run your game tests through Number One
# If a test breaks and you fix it later, Number One AUTOMATICALLY writes a Lesson Learned!
n1 exec -- npm test

# Step 6: Before Friday Demo Day, ask the 3 Project Helpers to inspect your game!
n1 party --topic "Check if Asteroid Dodger is ready for Friday Coding Club Demo Day!"

# Step 7: Stop the background watcher when you're done for the day
n1 watch stop
```

**Why kids love this:** Even if you start a brand-new AI chat tomorrow, just run `n1 brief` (or connect your AI editor) and the AI immediately knows your game's rules, past bugs, and what NOT to retry!

---

## Example 3: Build a "Smart Study Buddy" App (Using the `numberone` Library in JavaScript!)

**Great for:** Grades 7–12 · Computer Science Class, JavaScript Projects, Personal Study Tool  
**What you'll build:** Your very own JavaScript program that imports `NumberOneAgent` from `numberone`, remembers mistakes from past homework, warns you away from old traps before a quiz, and writes a printable study guide!

Save this file as **`study-buddy.mjs`** inside your project folder (after running `npm install numberone`):

```javascript
import { NumberOneAgent } from 'numberone';

// 1. Create a study notebook in a folder called "my-study-notebook"
const buddy = new NumberOneAgent('./my-study-notebook');
buddy.attach({
  workspaceName: '7th Grade Math & Science Study Buddy',
  installHooks: false,
  installShims: false
});

// 2. Record what you are studying today
buddy.recordThinking({
  thought: 'Practicing adding fractions and converting decimals for Friday quiz!',
  tags: ['math', 'fractions']
});

// 3. Save a common mistake so you stop falling for it
buddy.recordFailedAttempt({
  approach: 'Added top and bottom numbers straight across (1/2 + 1/3 = 2/5)',
  reason: 'Incorrect! You must find a common denominator before adding fractions.',
  tags: ['math', 'fractions']
});

// 4. Capture a Lesson Learned you can reuse before any test
buddy.captureLesson({
  title: 'Match the bottom numbers (common denominator) before adding fractions',
  problem: 'Missed fraction addition problems on Worksheet #2',
  rootCause: 'Added numerators and denominators directly instead of finding a common denominator',
  resolution: 'Convert 1/2 to 3/6 and 1/3 to 2/6, then add the tops to get 5/6',
  preventionRule: 'Always check if denominators match FIRST before adding or subtracting!',
  failedApproaches: ['Adding tops and bottoms straight across'],
  tags: ['math', 'fractions'],
  severity: 'high'
});

// 5. Right before your quiz, ask your Study Buddy what to remember!
const advice = buddy.consult({
  intent: 'adding fractions on Friday math quiz',
  tags: ['math', 'fractions']
});

console.log('=== STUDY REMINDERS FOR YOUR QUIZ ===');
for (const match of advice.lessons) {
  console.log(`- Lesson: ${match.lesson.title}`);
  console.log(`  Tip:    ${match.lesson.preventionRule}`);
}
for (const trap of advice.failedAttempts) {
  console.log(`- Watch out (past mistake): ${trap.approach}`);
  console.log(`  Why: ${trap.reason}`);
}

// 6. Generate a neat study journal you can save or print!
const story = buddy.buildDocumentary();
console.log(`\nCreated a ${story.chapters.length}-chapter Study Documentary!`);
```

Run it in your terminal:
```bash
node study-buddy.mjs
```

**Try expanding this for extra credit!**
- Add a prompt with Node's `readline` so classmates can type in their own subjects (`history`, `spelling`, `biology`) and search their past lessons anytime!
- Save `story.markdown` to a file (`fs.writeFileSync('study-guide.md', story.markdown)`) to print before exams!

---

## Example 4: Robotics & Maker Club Safety Guard + Time Machine (JavaScript Library!)

**Great for:** Grades 7–12 · Robotics Club (FIRST / VEX / Arduino / Raspberry Pi), Maker Faires, CS Projects  
**What you'll build:** A JavaScript program that uses `numberone` to track robot build jobs, **automatically block unsafe test plans**, travel back in time to inspect earlier build steps, and verify that nobody accidentally changed your engineering notebook!

Save this file as **`robot-journal.mjs`**:

```javascript
import { NumberOneAgent } from 'numberone';

// 1. Start an engineering notebook for your robotics team
const robot = new NumberOneAgent('./robotics-notebook');
robot.attach({
  workspaceName: 'RoboHawks Line-Follower Bot',
  installHooks: false,
  installShims: false
});

// 2. Open a build task for the team
const sensorTask = robot.openIssue({
  title: 'Calibrate line-following light sensor for gym lights',
  description: 'Measure white tape vs. black track readings under the overhead gym lamps',
  kind: 'task',
  priority: 'high',
  tags: ['sensors', 'robotics']
});

// 3. Add a club safety rule that Number One will strictly enforce!
robot.issueDirective({
  title: 'Indoor motor speed safety cap',
  directive: 'Keep motor power at or below 80% during indoor classroom table tests.',
  rationale: 'At 100% power the robot skidded off the test table last Tuesday.',
  forbiddenPatterns: ['MOTOR_POWER=100', 'setSpeed\\(100\\)'],
  severity: 'blocking',
  scopeTags: ['motors']
});

// 4. Test two ideas against your club's safety rules!
const riskyIdea = robot.arbitrate({
  action: 'Run the robot with setSpeed(100) on the classroom table',
  intent: 'Classroom speed test',
  tags: ['motors']
});

const safeIdea = robot.arbitrate({
  action: 'Run the robot with setSpeed(75) for smooth cornering',
  intent: 'Classroom speed test',
  tags: ['motors']
});

console.log('Risky idea verdict:', riskyIdea.verdict); // BLOCK
console.log('Safe idea verdict: ', safeIdea.verdict);  // APPROVE_WITH_CONDITIONS

// 5. Mark the calibration task finished!
robot.resolveIssue(
  String(sensorTask.payload.issueId),
  'Calibrated light sensor threshold to 420 under gym lights!'
);

// 6. Use the Time Machine! Peek at what the notebook looked like back at event #3
const pastSnapshot = robot.replay({ untilSeq: 3 });
console.log(`Time-travel to step #${pastSnapshot.lastSeq}: ${Object.keys(pastSnapshot.issues).length} open task(s)`);

// 7. Double-check the tamper-proof seal on your engineering notebook!
const integrity = await robot.verifyIntegrity(false);
console.log(`Notebook seal valid? ${integrity.valid} (${integrity.totalEvents} verified entries)`);
```

Run it in your terminal:
```bash
node robot-journal.mjs
```

**Why robotics judges love this:** Competitions like FIRST Robotics award points for an **authentic Engineering Notebook**. Number One gives every entry a tamper-evident digital seal (`verifyIntegrity`) and lets you print a chronological documentary (`buildDocumentary()`) proving every test, safety rule, and fix!

---

## Example 5: Group School Project & Fairness Log (History, Book Report, or Class Website)

**Great for:** Grades 5–12 · Group Presentations, History Projects, Class Websites, Newsletter Teams  
**What you'll make:** A shared task checklist and decision log inside your project folder so everyone knows what they're working on and why the group chose its topic!

```bash
# Step 1: Turn on Number One in your group's shared folder
cd ancient-egypt-project
n1 attach . --name "Ancient Egypt Group Project"

# Step 2: Add tasks for each teammate
n1 issue open --title "Write pyramid building timeline (Maya)" --kind task --priority high
n1 issue open --title "Draw Nile River map poster (Leo)" --kind task --priority high
n1 issue open --title "Create 5-question trivia game for class (Sam)" --kind story --priority medium

# Step 3: Record big group decisions so nobody forgets later
n1 decision \
  --title "Focus our presentation on everyday life + engineering" \
  --decision "Split our 6-minute talk into 2 minutes on pyramids, 2 on Nile farming, and 2 on trivia" \
  --rationale "Everyone gets equal speaking time and the class gets to play our trivia game!" \
  --rejected "Reading a 10-page essay aloud"

# Step 4: Check your group's task list anytime
n1 issue

# Step 5: When a teammate finishes their job, mark it resolved using its ID from `n1 issue`
# n1 issue resolve iss-01... --resolution "Timeline finished and double-checked with textbook!"

# Step 6: Create a final project summary to turn in with your poster or slides
n1 documentary --out group-project-journey.md
```

---

## Kid-Friendly Mini Dictionary (Developer Words Made Simple!)

If you explore the main technical docs, you might bump into fancy words. Here is what they actually mean:

| Fancy Word | What It Means in Everyday English |
|---|---|
| **Workspace** | The folder on your computer where all your project files live. |
| **Library** | A toolbox of ready-made code (like `numberone`) that you can `import` into your own JavaScript program. |
| **Event Stream** | A diary where every new note gets added to the bottom and old pages are never ripped out. |
| **Replay / Time-Travel** | Reading the diary from Page 1 up to any page you pick so you can see what your project looked like in the past! |
| **Dead-End** | An idea you tried that didn't work — saved so you (and your AI helpers) don't accidentally try it again. |
| **Lesson Learned** | A helpful tip you discovered after fixing a mistake or finishing an experiment. |
| **Directive** | A project ground rule (like *"don't set the robot speed to 100%"*) that stays in charge even if an AI chat forgets. |
| **Documentary** | A neat, chapter-by-chapter story of your whole project that Number One writes for you automatically. |
| **Hash / Tamper-Evident Seal** | A special math fingerprint for each diary entry — if anyone secretly changes an old page, the seal catches it right away! |
| **Bridge Crew** | Number One's three friendly built-in checkers: the **Builder Helper** (Engineering), **Safety Helper** (Security), and **Launch Helper** (Bridge). |

---

## A Quick Note for Parents & Teachers

- **100% Private & Local by Default:** Everything Number One saves stays inside a hidden `.numberone/` folder right on the student's own computer. No sign-ups, no cloud logins, no ads, and no telemetry sent anywhere.
- **Automatic Password & Secret Protection:** Even if a student accidentally pastes an API key or password into a note or test log, Number One scrubs it out automatically before saving.
- **Teaches Great Real-World Habits:** Kids naturally learn the scientific method, documenting failed trials without embarrassment, writing down *why* decisions were made, checking safety rules before acting, and turning messy work into a clear story.
- **Easy to Grade or Review:** Ask students to run `n1 documentary --out my-project-story.md` and submit that Markdown file alongside their project — you'll see their full creative journey, not just the finished result!
- **Free & Open Source:** Licensed under [GNU AGPL-3.0-or-later](../LICENSE). Using Number One for school projects never affects ownership of a student's own work.

---

## Want to Explore More?

- **[Back to the Friendly README](../README.md)**
- **[Interactive Documentation Website (with live Kids & School Lab!)](https://onimurasame.github.io/numberone/)**
- **[Ready to Level Up? Full Technical Guide](./TECHNICAL_GUIDE.md)**
