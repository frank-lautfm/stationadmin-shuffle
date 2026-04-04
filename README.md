# stationadmin-shuffle

Shuffle algorithm scripts for [laut.fm](https://laut.fm).

Algorithms can be configured using the Station Admin application. 


## Repository Structure

```
stationadmin-shuffle/
├── src/          # Main shuffle algorithm scripts (deployed to laut.fm server)
├── test/         # Unit tests and test fixtures
│   └── resources/  # JSON fixture files for tests
├── tools/        # Standalone utility scripts (call the laut.fm API directly)
└── doc/          # Developer documentation
```

## Main Scripts (`src/`)

| File | Description |
|------|-------------|
| [`StationAdmin.ts`](src/StationAdmin.ts) | TypeScript source for the main shuffle algorithm |
| [`StationAdmin.js`](src/StationAdmin.js) | Compiled JavaScript — this is what gets deployed to laut.fm |
| [`BlockSelect_v1.js`](src/BlockSelect_v1.js) | Block selection algorithm |
| [`Resume.js`](src/Resume.js) | Resume/continuation algorithm |

## Build

Requires Node.js and TypeScript (`npx tsc`).

```bash
# Compile TypeScript → JavaScript
npm run build

# Run tests
npm test

# Build and test in one step
npm run build-and-test
```

The build compiles [`src/StationAdmin.ts`](src/StationAdmin.ts) to [`src/StationAdmin.js`](src/StationAdmin.js), runs Prettier on the output, and prepends the file header from the TypeScript source.

## Tests (`test/`)

Tests use the Node.js built-in test framework (Node.js 18+).

```bash
npm test
```

Test fixtures (JSON track lists) are in [`test/resources/`](test/resources/).

## Tools (`tools/`)

Standalone scripts that call the laut.fm API directly. Require a valid API token.

| Script | Description |
|--------|-------------|
| [`shuffleplaylist.js`](tools/shuffleplaylist.js) | Shuffle a playlist on a live station |
| [`readplaylisttracks.js`](tools/readplaylisttracks.js) | Read tracks from a playlist |
| [`24h.js`](tools/24h.js) | Fetch 24h track statistics |

## Documentation

| File | Description |
|------|-------------|
| [`doc/StationAdmin.md`](doc/StationAdmin.md) | Full documentation for the main shuffle algorithm |
| [`doc/BlockSelect.md`](doc/BlockSelect.md) | Documentation for the BlockSelect_v1 block-selection algorithm |
| [`doc/Resume.md`](doc/Resume.md) | Documentation for the Resume continuation algorithm |
