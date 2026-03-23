# Schema Drift Detection Check

**Intent:** Detect mismatches between OpenAPI specs and actual API responses — the #1 cause of agent integration failures.

## How it works

### Endpoint selection
From the OpenAPI spec, selects up to 5 GET endpoints that:
- Don't require authentication (checks security schemes)
- Don't have path parameters (we can't guess valid IDs)
- Have documented response schemas (200 status)
- Prioritizes /health, /status, /capabilities, then shortest paths

### Schema comparison (2 levels deep)
For each successful JSON response:
- Compares top-level keys: missing from response = significant drift, extra in response = minor drift
- Compares value types: respects integer/number compatibility (JSON has only `number`)
- Recurses into object properties and first array element (up to depth 2)
- Resolves $ref pointers including allOf merging (up to 5 levels)

### Scoring
- **Pass**: all tested endpoints match spec (or no testable endpoints)
- **Warn**: minor drift only (extra undocumented keys, spec is a subset of reality)
- **Fail**: significant drift (missing keys, wrong types)
- Schema drift failure caps Comprehension category at yellow

### Edge cases handled
- No OpenAPI spec: pass with note
- All endpoints require auth: pass with note
- 4xx responses: skipped (likely require params we don't have)
- No response schemas: warn with note
- $ref resolution: handles nested refs, allOf merge, oneOf/anyOf

## Test results

**api.strale.io** (12 documented GET endpoints):
- `/health` — matches spec (1 key)
- `/v1/capabilities` — minor drift (1 extra undocumented key)
- `/v1/solutions` — minor drift (11 extra undocumented keys)
- `/v1/suggest/typeahead` — skipped (400, requires params)
- `/.well-known/agent-card.json` — no schema to compare
- Result: warn (extra keys but nothing missing)
- Comprehension: green (warn doesn't cap)

**strale.dev** (has spec, no public GET endpoints):
- Result: pass ("no GET endpoints documented")

**example.com** (no spec):
- Result: pass ("no spec found")

## Performance
Adds ~2-5 seconds per scan (5 HTTP requests with 10s timeout each, but most respond quickly). Runs in pass 2 (after OpenAPI discovery).

## What's next
- Consider supporting query parameter defaults from spec to test more endpoints
- Could test POST endpoints with documented request bodies (safe if spec documents test data)
- Add spec completeness score combining endpoint-completeness + schema-drift
