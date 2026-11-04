# Lerch Frontend & Interaction Prototype Pool (`IDEAS-FRONTEND.md`)

**Allocated Range:** `600–699` (Ports `3600–3699`)  
**Focus:** Interfaces, views, interaction mechanics, client-side reactivity, progressive item lifecycle, blocker triage UX, real-time collaborative surfaces, analytics dashboards, and SSR/legal boundaries.  
**Database Mode:** `DB=none` (in-memory / seeded JSON fixtures) or lightweight state stores so UI iterations stay fast and isolated from backend schema locks.

---

## 1. `MANDATORY` Scope Runs (Core UX, Lifecycle, Blockers & Real-Time Collaboration)

### `run-600`: Progressive Item Creation, Lifecycle States & Kanban Sizing Hygiene
* **Tier & Modules:** `MANDATORY` · Core un-scored foundation + `W1` 🟢 *(Folds in original `run-603: Progressive Item Creation / Fewest Steps Rule`)*
* **DB:** `none` | **Port:** `3600`
* **What it does:** Tests turning a raw thought into a tracked item in the fewest keystrokes via fast inline capture with keyboard syntax (`Buy bread #groceries @mw !critical`), carrying it through `unstarted`, `started`, `done`, and `discarded` across default (`backlog`, `in progress`, `done`) and custom (*design*, *build*, *QA*) `kanban` columns, plus `archived` state and review-as-a-fresh-item. Evaluates visual prompts when an item's `effort` exceeds 1 day (prompting breakdown into child subtasks) and optional Definition of Ready / Done checklists.
* **Questions addressed:**
  * `§2.1 Q1` 🥈 Is there a need for a default `new` state distinct from `unstarted` (e.g., an inbox/triage tray before an item sits on a column)?
  * `§2.1 Q2` 🥈 Who may move an item to another column, and can a gate block that move?
  * `§2.1 Q3` 🥈 How should the product apply the rule "something you cannot finish in a day is not a task" alongside items that scale up to epics and projects?
  * `§2.1 Q4` 🥈 What else belongs to an item's lifetime, past the need and the states?
  * `§2.1 Q5` 🥈/🥉 Are definition of ready, definition of done, and status workflows part of default templates or part of every item, and are they one concept or three?
* **How we arrive at an answer:** Side-by-side UX test of creating, moving, and breaking down 20 items: measures exact keystrokes/clicks per action, determines whether a separate `new` state adds friction vs. filtering `unstarted` items without a column, and tests whether soft visual warnings beat hard blocking gates on column moves.

---

### `run-601`: The Dependency, Blocker Triage & Outcome Scoring Lab
* **Tier & Modules:** `MANDATORY` · Core un-scored foundation + `W2` 🟡 / `W6` 🟡 triggers (`DA1` 🟡 prep) *(Folds in original `run-600: The Dependency & Blocker Interaction Lab`)*
* **DB:** `none` | **Port:** `3601`
* **What it does:** Explores how a human interacts with blockers, cross-project dependencies (e.g., *"cut the bread"* under *"dinner"* blocked by *"bread knife"* under *"buy cutlery"*), and calendar clashes without drowning in a tangled spaghetti graph. Tests three core interaction mechanics alongside the 4-step **Blocker severity** (`I cannot do anything` $\to$ `just nice to have`) and 4-step **Item score** (`doesn't work` $\to$ `excellent`):
  1. **Ego-Graph Drawer:** Slide-over panel focused strictly on the selected item's immediate blockers and immediate dependents, with 1-click hops to re-center.
  2. **Stoplight Triage Table:** Dense dashboard view where blocked items bubble up with high-contrast severity tags that expand inline to show blocker details and resolution steps.
  3. **Cascading Pushback Timeline:** Minimal horizontal view where dragging a blocker visually shifts dependent items with clear cause-and-effect indicators.
* **Questions addressed:**
  * `§2.3 Q1` 🥇 Are a blocker, a cross-project dependency, and a calendar clash the same feature in the UI?
  * `§2.3 Q2` 🥈 Blockers land on a dashboard where severity is triaged. What does the item itself show, and do other dependencies surface the same way?
  * `§2.3 Q3` 🥈 Where is an item's score kept in the UI, and where is a blocker's severity kept before it is triaged?
* **How we arrive at an answer:** Directly compares the Ego-Graph Drawer, Stoplight Triage Table, and Cascading Pushback Timeline (plus Definition-of-Ready dependency badges) to decide what the item card shows vs. the triage dashboard, and whether blockers, cross-project dependencies, and calendar clashes unify under one interaction model.

---

### `run-602`: The Lerch Shell, Zoom Engine (*Registerkarten*) & "Next Relevant Work" Hub
* **Tier & Modules:** `MANDATORY` · Core un-scored foundation (`project` $\to$ `epic` $\to$ `story` $\to$ `task` $\to$ `subtask`) *(Folds in original `run-601: The Lerch Shell & Zoom Engine`)*
* **DB:** `none` | **Port:** `3602`
* **What it does:** Tests making the application feel like a spatial notebook rather than page-by-page web routing as complexity scales from a 10-item personal shopping list to a 5-level multi-project engineering tree. Evaluates:
  * **Notebook edge tab labels (*Registerkarten*):** Representing zoom depth (`Space` $\to$ `Project` $\to$ `Epic` $\to$ `Task` $\to$ `Subtask`) and progressively revealing fields (`effort`, `scheduled_time`, `artifacts`, child rollups) only when appropriate to the current scale.
  * **Global keyboard command palette (`Ctrl+P` / `Cmd+K`):** For instant zoom switching, navigation, and 1-step actions.
  * **"Next Relevant Work" Hub:** A butler focus panel surfacing the next actionable item.
* **Questions addressed:**
  * `§1.4 Q1` 🥇 What makes work the next relevant thing to show?
  * `§1.4 Q2` 🥇 What does the agnostic core keep, apart from the views, templates, and actions a use takes up or leaves?
  * `§1.4 Q3` 🥈 What does a person see change when the complexity scales?
* **How we arrive at an answer:** Validates which fields stay hidden at overview depth vs. zoomed item depth, proves whether *Registerkarten* + `Cmd+K` eliminate page-routing friction, and tests a deterministic formula for the "Next Relevant Work" slot (unblocked + `started` or highest-priority `unstarted` + scheduled today).

---

### `run-603`: Live Collaborative Item Editing, Field Locks & Presence Cursors
* **Tier & Modules:** `MANDATORY` · `W7` 🟡 (Real-time collaborative features), `W2` 🟡 (WebSockets)
* **DB:** `none` (simulated multi-pane WebSocket loop in-browser) | **Port:** `3603`
* **What it does:** Renders a split-screen two-user workspace connected over a live local channel. User A and User B simultaneously edit the same item's `description` and drag cards across `kanban` columns. Tests the UX of live typing indicators, field lock badges (*"Locked by Alex — editing description"*), local draft saving (`localStorage` recovery on disconnect), and optimistic board drag reconciliation.
* **Questions addressed:**
  * `§2.9 Q1` 🥈 & `Module W7` 🟡 How do live typing in `description` and edit locking combine in the UI when multiple users edit the same item at once, and how are concurrent kanban moves visually resolved?
* **How we arrive at an answer:** Directly compares paragraph/field-level lock UI (where clicking "Edit Description" locks the markdown editor for User A while streaming live read-only preview text to User B) against simultaneous dual-cursor editing, confirming which UX feels cleanest and most predictable during a 42 evaluation demo.

---

### `run-604`: Passive Communication vs. In-App Notification Center
* **Tier & Modules:** `MANDATORY` · `W6` 🟡 (Notification system for C/U/D), `W2` 🟡
* **DB:** `none` | **Port:** `3604`
* **What it does:** Simulates activity across all 7 notification entity types (`Item`, `Artifact`, `Blocker`, `Organization`, `Membership`, `Friend request`, `Private message`). Tests how ambient board updates (subtle glow/badge when you are already viewing the active space) combine with the unread Notification Bell drawer (for events in spaces you are *not* currently looking at, excluding self-actions).
* **Questions addressed:**
  * `§2.9 Q3` 🥈 How should people be notified beyond the in-app notification list and passive communication?
  * `§2.9 Q4` 🥉 Do items need `@mentions`, and how much notification is too much once a state or a blocker is already visible to the team?
  * `Module W6` 🟡 Defines the exact notification list UI, grouping, mark-as-read interaction, and click-to-navigate behavior.
* **How we arrive at an answer:** Demonstrates whether auto-marking notifications as read when a user opens the target item/space eliminates notification fatigue, and tests if lightweight `@username` parsing in comments/descriptions is worth adding to highlight direct pings.

---

### `run-605`: Organization Space Switcher, Admin Roster & SSR Legal Entry Shell
* **Tier & Modules:** `MANDATORY` · `U5` 🟡 (Organization system), `U1` 🟢 (Auth & profiles), `W8` 🟢 (SSR & Privacy/ToS)
* **DB:** `none` | **Port:** `3605`
* **What it does:** Prototypes the public SSR entry flow (landing page, sign-in/sign-up, non-placeholder Privacy Policy & Terms of Service pages, and GDPR data/account controls) transitioning into the client-rendered workspace shell with the `personal` vs. `organization` Space Switcher, organization creation modal, admin member management (`add`/`remove` existing users), and cross-space item visibility boundaries.
* **Questions addressed:**
  * `§2.8 Q1` 🥇 What do the policies allow a person to see and do in the UI, and how are read-only vs. editable states shown?
  * `§2.8 Q2` 🥈 Can a dependency cross a space in the UI, and how do `project` items inside a space differ visually from `Space` containers?
  * `§4.3 Q2` 🥈 What are the remaining UI/UX data privacy / GDPR requirements alongside Privacy Policy and Terms of Service (`W8`)?
* **How we arrive at an answer:** Verifies the exact SSR vs. CSR route split (`routeRules` in Nuxt), confirms that `Space` is clearly understood as the top-level organizational perimeter while `project` is a top-level `Item` inside a space, and locks in the admin roster UI for `U5`.

---

## 2. `BONUS` Scope Runs (Analytics, Search/Bulk Ops, Artifacts, Social & Scheduling)

### `run-606`: Personal Welcome Analytics Dashboard & Interactive Chart-to-PDF Pipeline
* **Tier & Modules:** `BONUS` · `DA1` 🟡 (Advanced analytics dashboard), `W2` 🟡
* **DB:** `none` | **Port:** `3606`
* **What it does:** Builds the post-login personal welcome dashboard featuring the 4 required interactive charts (Finished items/week line chart, Open items per `kanban` column bar chart, Items by `space` pie chart, Items by `blocker` severity bar chart). Clicking any chart segment cross-filters the dashboard; live `W2` mock events animate chart updates; includes date-range selectors (`7d`, `30d`, custom), CSV export, and client-side print/canvas PDF snapshot generation.
* **Questions addressed:**
  * `§2.6 Q6` 🥈 & `Module DA1` 🟡 How does the personal welcome dashboard aggregate and filter items visually across spaces, which chart rendering approach (e.g., lightweight SVG / Chart.js / Unovis) works best, and can client-side print/canvas PDF generation satisfy the PDF snapshot requirement cleanly?
* **How we arrive at an answer:** Compares SVG/Canvas charting libraries for bundle size, hover/click drill-down responsiveness, and fidelity when exporting a multi-chart snapshot to PDF.

---

### `run-607`: Advanced Search Bar, Multi-Select Bulk Action Bar & Import Error Triage UI
* **Tier & Modules:** `BONUS` · `W11` 🟡 (Advanced search), `DA2` 🟡 (Data export, import & bulk actions)
* **DB:** `none` | **Port:** `3607`
* **What it does:** Combines the `W11` faceted search bar (filters for `space`, `state`, `kanban`, `tag`, `contributor`, date range + sort + 20-item pagination controls) with the `DA2` list view: multi-row checkbox selection with a floating bulk-action bar (move column, change state, tag, delete) and an interactive CSV/JSON Import Wizard that highlights invalid rows with inline row numbers and reasons.
* **Questions addressed:**
  * `§2.7 Q1` 🥈 How do search filters, sorting, and pagination combine in the list view?
  * `§2.7 Q2` 🥈 & `Module DA2` 🟡 In the import UI, is a pre-commit validation table (showing valid vs. invalid rows before confirming import) better than post-upload partial failure?
* **How we arrive at an answer:** Tests user recovery from a broken CSV upload—proving whether a 2-step "Preview & Fix / Skip Invalid Rows" modal solves the partial vs. all-or-nothing dilemma cleanly in the frontend.

---

### `run-608`: Inline Link Auto-Capture, File Upload Dropzone & Bidirectional Artifact Chain
* **Tier & Modules:** `BONUS` · `W12` 🟢 (File upload and management) + Core Artifact mechanics
* **DB:** `none` | **Port:** `3608`
* **What it does:** Tests typing or pasting a URL in an item's description or quick-input to see whether Lerch should auto-create a `kind: "link"` artifact or show a non-intrusive *"Create Artifact?"* pill. Also builds the `W12` drag-and-drop file upload zone (`kind: "file"`) with client-side MIME/size validation, progress bars, image/PDF/markdown inline preview modals, and bidirectional navigation (viewing all ancestor/descendant artifacts along an item's hierarchy chain, and clicking an artifact to see every item linked to it).
* **Questions addressed:**
  * `§2.5 Q1` 🥈 When a link is typed, does Lerch offer to make an artifact, or make one on its own?
  * `§2.5 Q2` 🥈 Can Lerch suggest linking an existing artifact on its own (e.g., matching URL domain or title)?
* **How we arrive at an answer:** Compares automatic link extraction vs. a 1-click confirmation chip when typing markdown links, and verifies the complete `W12` evaluation checklist in the UI.

---

### `run-609`: Social Hub: Friends Presence Drawer, User Profiles & 1-to-1 Chat
* **Tier & Modules:** `BONUS` (+ `MANDATORY` `U1`) · `W3` 🟡 (User interaction: chat, profile, friends), `U3` 🟢, `U6` 🟢
* **DB:** `none` | **Port:** `3609`
* **What it does:** Prototypes the non-intrusive social layer so it stays harmonious with Lerch's quiet "butler" ethos: user profile cards (avatar upload, bio, shared organizations, 2FA QR enrollment modal, API key manager), friend request management, live online/offline status dots, and a collapsible 1-to-1 private chat drawer between friends alongside item-level chronological comment threads.
* **Questions addressed:**
  * `§2.9 Q2` 🥈 How is 1-to-1 friend chat accessed without cluttering the work board, and what does the UI show for non-friends in the same organization?
  * `§2.9 Q5` 🥉 Which social features sit prominently in the workspace vs. tucked into the user profile / social drawer for `ft_transcendence`?
* **How we arrive at an answer:** Validates a layout where item comments live directly on the item detail drawer (work communication) while friend list, profiles, and 1-to-1 DMs live in a clean header slide-over drawer (satisfying `U1` and `W3` without turning the kanban board into a chat app).

---

### `run-610`: Multi-Projection Synchronization, Effort & Single-Lane Timeview
* **Tier & Modules:** `MANDATORY` / `BONUS` Core Scheduling & Multi-View Mechanics · `§2.4`, `§2.6` *(Folds in original `run-602: Multi-Projection Synchronization`)*
* **DB:** `none` | **Port:** `3610`
* **What it does:** Renders the same items simultaneously across three projections—a **Kanban board**, a **flat List**, and the compact horizontal **Timeview** lane layout (where non-overlapping items share a single horizontal time lane, and overlapping items stack to reveal calendar clashes)—alongside personal availability windows and workload capacity bars (`effort` vs. available hours).
* **Questions addressed:**
  * `Original run-602` When the same items are rendered simultaneously as a Kanban board, a flat list, and a calendar/timeline, how does client reactivity handle updates without jank or full re-renders?
  * `§2.4 Q1` 🥈 Do items need due dates, priorities, and estimates beyond `effort` and a `scheduled_time` slot?
  * `§2.4 Q2` 🥈 What does "the to-do-when as a first-class goal" mean in practice?
  * `§2.6 Q2` 🥈 Beyond the welcome dashboard (`DA1`) and kanban board, which views matter most (List, Timeview, Calendar)?
* **How we arrive at an answer:** Measures client-side frame times (`requestAnimationFrame` / Vue reactivity profiling) when dragging an item in one projection while the other two update live, and proves whether scheduling an item onto a concrete time slot ("to-do-when") naturally replaces abstract priority numbers and separate due dates.

---

## 3. `BUFFER` & `FULL PRODUCT` Scope Runs (Bare Minimum)

* **`run-611` (`BUFFER` · `W10` 🔴 · `§2.6`):** **Custom 10-Component Design System Showcase** — Defines and tests the exact 10 zero-dependency reusable Vue components (`Button`, `Badge`, `Modal`, `Drawer`, `Select`, `Tooltip`, `Tabs`, `Toast`, `DataTable`, `Card`) on a living styleguide page to claim `W10`.
* **`run-612` (`BUFFER` · `U4` 🔴 · `§1.2`, `§2.8 Q1` 🥇):** **Role-Based View & Policy Matrix Editor** — Tests an admin policy matrix UI toggling what `admin`, `member`, and `guest` roles can see or edit (including the "see nothing above first note" rule).
* **`run-613` (`BUFFER` · `U7` 🔴 · `§2.6`, `§2.9 Q5` 🥉):** **User Activity Insights & XP Leaderboard Surface** — Prototypes a personal/team contribution insights view and optional experience-point leaderboard kept strictly separate from the 4-step item quality `score`.
* **`run-614` (`BUFFER` · `W9` 🟡 & `FULL PRODUCT` · `§2.6 Q1 & Q5` 🥇/🥈):** **Installable PWA & Mobile Single-Swipe Action Console** — Tests an installable offline-capable mobile viewport where left/right swipes trigger quick actions (*execute, log, refuse, reschedule, report blocker, create*) vs. expanding the full interface.
* **`run-615` (`BUFFER` · `AI3` 🟡 · `§2.6 Q2` 🥈, `§2.10 Q5` 🥉):** **Prompted Summary Dashboard & Multimodal Log Capture UI** — Tests a prompt bar that dynamically renders a filtered summary dashboard and a voice/image/text quick-log input modal.
* **`run-616` (`FULL PRODUCT` · `§2.6 Q2–Q4` 🥈/🥉):** **Widget-Grid Workspace Builder & Space Templates** — Tests assembling a space layout from draggable grid widgets (Kanban + Timeview + Blockers) and switching between default templates (*Personal List*, *Team Sprint*, *Multi-Project Org*).
* **`run-617` (`FULL PRODUCT` · `§2.5 Q3` 🥈):** **Meetings, Journals & Knowledge Base Split-Editor** — Tests writing meeting/journal notes in markdown and highlighting lines to spawn new `Item` records or link existing `Artifact` documentation.
* **`run-618` (`BUFFER` · `A4` 🟡 · `§4.1`):** **Cross-Browser CSS Grid, Drag-and-Drop & WebSocket Verification Matrix** — Automated/manual visual check harness across Chromium, Firefox, and WebKit (Epiphany/Safari) for `A4`.

---

## 4. Frontend Question & Module Coverage Summary

| Target | Covered By | Primary Output Decision |
|---|---|---|
| `§2.1 Q1–Q5` 🥈/🥉 (States, gates, 1-day sizing, DoR/DoD) | `run-600` | Lifecycle state rules, column gates, and sizing prompt UX |
| `§2.3 Q1–Q3` 🥇/🥈 (Blockers, cross-project deps, scoring) | `run-601` | Item blocker badge vs triage dashboard & 4-step score UI |
| `§1.4 Q1–Q3` 🥇/🥈 (Next relevant work & scaling UI) | `run-602` | Progressive field disclosure & "Next Up" selection UX |
| `§2.9 Q1` 🥈 · `W7` 🟡 · `W2` 🟡 (Collab description & locks) | `run-603` | Live description lock/preview UX & concurrent board drag |
| `§2.9 Q3–Q4` 🥈/🥉 · `W6` 🟡 (Notification UX & noise) | `run-604` | Notification drawer mechanics & passive vs active alerts |
| `§2.8 Q1–Q2` 🥇/🥈 · `§4.3 Q2` 🥈 · `U5` 🟡 · `W8` 🟢 | `run-605` | Space switcher, admin member modal, and SSR legal pages |
| `§2.6 Q6` 🥈 · `DA1` 🟡 (Personal analytics & PDF export) | `run-606` | 4-chart interactive welcome page & PDF snapshot method |
| `§2.7 Q1–Q2` 🥈 · `W11` 🟡 · `DA2` 🟡 (Search, bulk, import) | `run-607` | Search/filter bar, bulk selection bar & import preview wizard |
| `§2.5 Q1–Q2` 🥈 · `W12` 🟢 (Link auto-capture & file upload) | `run-608` | Link-to-artifact prompt vs auto-create & file preview modal |
| `§2.9 Q2, Q5` 🥈/🥉 · `W3` 🟡 · `U1` 🟢 (Friends, profiles, chat) | `run-609` | Header social/chat drawer keeping work surfaces clutter-free |
| `§2.4 Q1–Q2` 🥈 · `§2.6 Q2` 🥈 (Effort, allocations, Timeview) | `run-610` | "To-do-when" scheduling vs due dates & single-lane Timeview |
| `BUFFER` & `FULL PRODUCT` (`W10`, `U4`, `U7`, `W9`, `AI3`, `A4`, Grid, Journals) | `run-611` – `run-618` | Fast UI validation for buffer points and post-transcendence vision |

