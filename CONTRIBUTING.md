# Contributing to KSP Delta-V Planner

Thanks for helping improve KSP Delta-V Planner! Contributions from KSP players,
mod users, developers, and first-time contributors are welcome. You do not need
to write code to help: testing calculations in-game, reporting discrepancies,
suggesting improvements, and fixing documentation are all valuable.

## Before you start

- Try the [live planner](https://antoniotoni.github.io/ksp-deltav/) and consult
  the [user guide](docs/USER_GUIDE.md) if you are unsure how a feature works.
- Search [existing issues](https://github.com/AntonioToni/ksp-deltav/issues),
  including closed ones, and check the
  [roadmap and milestones](https://github.com/AntonioToni/ksp-deltav/milestones).
- For substantial changes, new planet packs, or changes to calculation models,
  discuss the approach in an issue before investing time in implementation.
  Small, focused fixes and documentation corrections can go directly to a PR.

## Reporting issues and suggesting features

Use the [issue template chooser](https://github.com/AntonioToni/ksp-deltav/issues/new/choose)
to find the right form:

| Template | When to use it |
| --- | --- |
| Bug report | Something crashes, behaves unexpectedly, or looks wrong. |
| Calculation or data inconsistency | A budget, orbital value, antenna value, signal strength, science rate, or deployment result appears incorrect. |
| Feature request | A new capability, mod support, or usability improvement. |
| Question or other feedback | Usage questions, documentation corrections, or anything that does not fit the other forms. |

A useful report includes enough information to reproduce it: selected bodies
and route, planetary system, relevant settings, planner version or URL, and
what you expected versus what happened. For visual issues, include the browser,
device or viewport size, and a screenshot if possible.

For numerical discrepancies, include actual and expected values **with units**,
relevant KSP/mod versions, applicable difficulty and radio settings, and the
source of your comparison (in-game screenshot, configuration, or reference).
If a date-based signal result differs, include the game date or UT.

The planner uses documented reference estimates and explicit assumptions; it
is not a full flight simulator or end-to-end CommNet network simulator.
Differences from in-game results are worth reporting, but may reflect a known
limitation or a different configuration rather than a calculation bug.

## Development workflow

The project uses React, TypeScript, Vite, and Material UI with **Node.js 24 LTS**
and npm. No backend, API credentials, or environment variables are needed for
normal local development.

1. Fork the repository and clone your fork.
2. Start from the latest `main` and create a focused branch, for example
   `fix/relay-clearance` or `feature/new-planet-pack`.
3. Install dependencies and start the development server:

   ```sh
   npm ci
   npm run dev
   ```

4. Make your changes, add or update tests and documentation as appropriate, and
   commit with a clear, descriptive message.
5. Push the branch to your fork and open a pull request targeting `main`.

Maintainers can use a feature branch in the original repository instead of a
fork. Do not push implementation changes directly to `main`.

See the [developer guide](docs/DEVELOPMENT.md) for project structure, local setup,
test coverage, and details of the calculation architecture.

## Contribution standards

### Code and calculations

- Follow the existing TypeScript and React conventions. Reuse shared components,
  utilities, and theme tokens instead of duplicating logic.
- Keep changes focused. Avoid unrelated refactors, formatting churn, or
  dependencies.
- Keep numerical calculations separate from presentation and formatting. Make
  units explicit, convert consistently, and preserve meaningful precision.
- For changes to formulas, reference data, or mod support, document the source,
  version or pinned revision, assumptions, and limitations. Prefer authoritative
  mod configurations or original reference material where available.
- Do not silently invent missing data or treat an approximation as a verified
  result. Add reproducible regression tests and update the validation record
  when accuracy claims or reference values change.

Relevant references: [data and assumptions](docs/DATA.md),
[relay and signal planning](docs/RELAYS.md),
[validation](docs/VALIDATION.md), and [custom planet packs](docs/CUSTOM_PACKS.md).

### UI and accessibility

- Prioritize a simple, readable Basic experience; retain advanced controls and
  technical explanations without overwhelming the default layout.
- Keep essential configuration, status, and results visible without scrolling
  on typical 1920×1080 desktop displays at 100% zoom where practical. If the
  whole view cannot fit, prioritize the information needed to make a decision.
- Preserve readable text, responsive layouts, keyboard and touch interaction,
  focus indicators, and existing reduced-motion behavior. Avoid clipping
  results or disabling necessary scrolling to fit a layout.
- Include before/after screenshots for significant visual changes, ideally on
  desktop and mobile.

## Testing

Before requesting review of code changes, run:

```sh
npm test
npm run lint
npm run build
```

For changes to interactions, layouts, or browser behavior, install the test
browser if needed and run the browser suite:

```sh
npx playwright install chromium
npm run test:e2e
```

For changes affecting deployment or asset paths, also see
[deployment checks](docs/DEPLOYMENT.md) and use the relevant
`npm run test:pages` or `npm run test:deployment` scripts.

Add regression coverage for bugs and new functionality. For documentation-only
changes, check links and rendering. If you could not run a relevant check, say
so in the PR rather than reporting it as passed.

## Pull requests

Keep each PR focused on one issue or coherent change. In the description:

- Explain the motivation and summarize what changed.
- Link the related issue if there is one (use `Closes #123` only when the PR
  fully resolves it).
- List checks performed and any known limitations.
- Provide screenshots for UI changes or reference comparisons for numerical
  changes.

Same-repository PRs can receive an automated GitHub Pages preview; fork PRs do
not receive a trusted deployed preview automatically. See the
[deployment guide](docs/DEPLOYMENT.md) for details.

A maintainer will review the proposed changes before merging. Be open to
feedback and follow-up changes; inclusion in a particular release is not
guaranteed.

## Community and licensing

Please keep discussion constructive, welcoming, and respectful. Focus feedback
on the work, explain disagreements, and avoid posting private information,
credentials, or unredacted sensitive logs.

Project code is licensed under [GPL-3.0-only](LICENSE). Submit only material
you have the right to contribute under the applicable license and retain
third-party notices and attribution. Reference data and assets can have their
own terms; check the [data guide](docs/DATA.md) and [relay guide](docs/RELAYS.md)
before adding them.

Thanks for contributing, and happy planning!
