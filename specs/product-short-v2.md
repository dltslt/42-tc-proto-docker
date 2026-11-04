# Lerch — Product Context for Prototypes

This file gives the product vision and baseline mechanics for Lerch prototypes. Domain entities and field invariants live in `data-foundation.md`. Each prototype brief defines the specific scenario to explore on top of this baseline.

## 1. Vision

Lerch (a nod to Lurch, the quiet butler who turns up when someone rings) is a hub for the next relevant piece of work. It stays out of the way and keeps every ordinary change short:

- **Team-first & passive communication:** Designed around a team first, while single-person use runs on the same core. Updating the work itself is how the team stays informed—no separate reporting step.
- **Minimum steps & scope-aware views:** Any ordinary action takes the fewest steps possible. Views show only the fields that belong to the current level and scope, and a value entered in one place is present in all the others.
- **Agnostic, modular core:** The same core stretches from a personal list to a multi-team organization. Views, templates, and actions sit on top like widgets that a team can adopt, adjust, or leave out.

## 2. Baseline

Every prototype shares these four product mechanics:

- **Spaces & actors:** Every item belongs to one `Space` (`personal` or `organization`), which is the context holding the work and its members. Actors are human users (`human`) or autonomous agents (`agent`), and either can contribute to or lead an item.
- **Items & recursive hierarchy:** `Item` is the unit of work or goal at any scale (`project`, `epic`, `story`, `task`; nesting a `task` under a `task` makes a subtask). The hierarchy is not a fixed schema—it follows the work as larger goals break down into smaller child items.
- **Progressive creation:** A single line (`title`) is enough to create an item. Other fields fill in later once someone starts working on it.
- **State & kanban:** Every item has an intrinsic lifecycle `state` (`unstarted`, `started`, `done`, `discarded`). On a board view, an item sits in a `kanban` column (defaults: `backlog`, `in progress`, `done`; teams can add custom columns such as *design*, *build*, *QA*). Columns group items visually and may correlate with `state`, but do not define it.

## 3. Directions a Brief May Explore

A prototype brief explores one specific direction on top of the baseline and supplies the rules for it; do not build these unless prompted:

- Blockers & dependencies
- Tags & content links
- Item scoring & task sizing rules
- Scheduling & calendar availability
- Artifacts & activity events
- Additional views, dashboards & mobile surfaces
- Search, import & export
- Real-time collaboration & notifications
- Social features
- External API, agents & AI assistance
- Database engines
- Real-time transports & synchronization
- Server-side rendering vs. client rendering boundaries
- Integrations, tooling & container setups

## 4. Working Rules

1. **Build only the baseline plus the brief's slice:** carry that scenario vertically through interface, server routes, and storage.
2. **Follow `data-foundation.md`:** use the shared domain invariants and baseline field names, adding only the refinements your brief requires.
3. **Report what the run showed:** in your final summary, state the scenario tested, what it demonstrated, and any refinements added on top of the baseline.
