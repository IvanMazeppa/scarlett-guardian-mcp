# WP-3.1 evidence — DuplexCache shadow sidecar (server) — 2026-07-16

**Status:** done  
**Owner:** Grok Build  
**Roadmap:** D6 §2.2 / master WP-3.1

## Delivered

| Piece | Location |
|-------|----------|
| `DuplexCache` + resolve/store helpers | `src/guardian/duplex-cache.ts` |
| `POST /duplex-cache` (auth + zod) | `src/guardian/server.ts` |
| `GET /duplex-cache` stats (no bodies) | same |
| Preflight merge (caller wins) | `src/guardian/tools/preflight.ts` |
| Report field `duplex_source` | `src/guardian/report/models.ts` |
| Telemetry reads `report.duplex_source` | `src/guardian/telemetry.ts` |
| TTL config | `GUARDIAN_DUPLEX_CACHE_TTL_MS` (default 45 min) |
| Unit tests | `tests/duplex-cache.test.ts` |

## Rules implemented

1. **Caller wins** — non-empty `scarlett_previous_message` never overwritten by cache.
2. **Cache fill** — empty caller + fresh cache → `duplex_source: "bridge_cache"`.
3. **Absent only when both empty** — `DUPLEX_INPUT_MISSING` only then.
4. **TTL** — stale entries ignored (no wrong-turn critique).
5. **Ambiguity** — without `thread_key`, cache serves only if exactly one thread is fresh.

## Verification

```text
npm run build   # green
npm test        # includes duplex-cache tests
npm run eval:fast  # 16/16
```

## Smoke (after Guardian restart)

```bash
# store (bridge will do this later)
curl -sS -X POST http://127.0.0.1:8790/duplex-cache \
  -H 'Content-Type: application/json' \
  -d '{"scarlett_message":"Scarlett on the Nordschleife radio: aero planted, Jag älskar dig.","thread_key":"default"}'

# inspect (no message body)
curl -sS http://127.0.0.1:8790/duplex-cache
```

## Next

- **WP-3.2** — userscript v2 shadow mode (scrape + POST this endpoint)
- Live proof of `duplex_source: "bridge_cache"` is **WP-3.4**
