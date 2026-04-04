# Agent Guide — stationadmin-shuffle

This file provides orientation for AI agents and automated tools working in this repository.

## What This Repository Is

Shuffle algorithm scripts for the [laut.fm](https://laut.fm) StationAdmin radio automation platform. The scripts run server-side on laut.fm and are not a web application or service — there is no server to start, no database, and no environment variables required.

## Repository Layout

```
src/          Source files deployed to laut.fm
test/         Unit tests (Node.js 18+)
  resources/  JSON track fixtures used by tests
tools/        Standalone API utility scripts (require a laut.fm API token)
doc/          Developer documentation
```

## Algorithm Scripts

| Script | Purpose | Documentation |
|--------|---------|---------------|
| [`src/StationAdmin.ts`](src/StationAdmin.ts) | Main shuffle algorithm (TypeScript source) | [`doc/StationAdmin.md`](doc/StationAdmin.md) |
| [`src/StationAdmin.js`](src/StationAdmin.js) | Compiled output — **this is what gets deployed** | [`doc/StationAdmin.md`](doc/StationAdmin.md) |
| [`src/BlockSelect_v1.js`](src/BlockSelect_v1.js) | Block-selection algorithm | [`doc/BlockSelect.md`](doc/BlockSelect.md) |
| [`src/Resume.js`](src/Resume.js) | Resume/continuation algorithm | [`doc/Resume.md`](doc/Resume.md) |

## Build

Requires Node.js and TypeScript. The build compiles `StationAdmin.ts` → `StationAdmin.js`, runs Prettier on the output, and prepends the version header from the TypeScript source.

```bash
npm run build
```

**What the build does:**
1. `cd src && npx tsc` — compiles [`src/StationAdmin.ts`](src/StationAdmin.ts) to [`src/StationAdmin.js`](src/StationAdmin.js) using [`src/tsconfig.json`](src/tsconfig.json) (target: ES2020, comments stripped)
2. `npx prettier --write StationAdmin.js` — formats the output
3. Prepends the first two lines of the `.ts` file (version comment + date) to the `.js` file

`BlockSelect_v1.js` and `Resume.js` are plain JavaScript and require no build step.

## Test

```bash
npm test
```

Runs [`test/StationAdminTests.js`](test/StationAdminTests.js) with the Node.js built-in test framework (Node.js 18+ required). Tests cover the compiled [`src/StationAdmin.js`](src/StationAdmin.js) only — `BlockSelect_v1.js` and `Resume.js` have no automated tests.

Each test scenario runs 5 times with different random seeds (via the [Alea](https://github.com/coverslide/node-alea) PRNG injected through `opts.random`) and a fixed `opts.time` timestamp for deterministic scheduling. See [`doc/StationAdmin.md`](doc/StationAdmin.md#testing) for details.

```bash
# Build and test in one step
npm run build-and-test
```

## Making Changes

- **Edit [`src/StationAdmin.ts`](src/StationAdmin.ts)**, then run `npm run build` to regenerate [`src/StationAdmin.js`](src/StationAdmin.js). Never edit the `.js` file directly — it is overwritten by the build.
- **`BlockSelect_v1.js` and `Resume.js`** are edited directly (no build step).
- After any logic change, run `npm test` to verify correctness.
- Update the version comment at the top of [`src/StationAdmin.ts`](src/StationAdmin.ts) and the version history in [`doc/StationAdmin.md`](doc/StationAdmin.md) when releasing a new version.

## Documentation

| File | Contents |
|------|----------|
| [`doc/StationAdmin.md`](doc/StationAdmin.md) | Full reference for the main shuffle algorithm: purpose, all `opts` parameters, input/output format, algorithm phases, and testing approach |
| [`doc/BlockSelect.md`](doc/BlockSelect.md) | Reference for the BlockSelect_v1 block-selection algorithm |
| [`doc/Resume.md`](doc/Resume.md) | Reference for the Resume continuation algorithm |
