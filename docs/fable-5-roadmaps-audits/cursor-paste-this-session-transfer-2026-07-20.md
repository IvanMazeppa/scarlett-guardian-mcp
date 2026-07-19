# Paste-ready — transfer THIS Grok session into Cursor

**Use:** New Cursor Agents chat (coordination / GM+NPC discussion).  
**Not** Thread 9 Sol implementer. **Not** necessarily the old Fable multi-week thread.  
**Full context:** `handover-this-grok-session-to-cursor-2026-07-20.md`

---

## Attach these files first

- `handover-this-grok-session-to-cursor-2026-07-20.md`
- `handover-grok-build-to-cursor-2026-07-19.md`
- `cooperative-multi-agent-workflow-2026-07-19.md`
- `story-status-nurburgring-2026-07-19.md`
- `master-roadmap-2026-07.md`
- `executor-preferences-grok-build-2026-07.md`
- `fable5-living-gm-feasibility-2026-07-18.md`
- `ideas-parking-living-gm-truman-2026-07-18.md`
- `guardian-npc-state-management-design-2026-07.md`
- `cursor-thread-9-setup-2026-07-19.md`
- Optional: `guardian-dramaturg-design-2026-07.md`

Mode: **Agent**. Model: **Grok 4.5** (promo OK).

---

## Paste everything below this line

```text
You are continuing a Grok Build coordination session that is being transferred into Cursor
to save weekly Grok CLI tokens (promo: Grok 4.5 is 50% off here; CLI budget ~60% used).

## Who you are in this chat
- Coordination + product/architecture discussion seat for Operator (maz3ppa).
- You may write/update design notes under scarlett-guardian-mcp/docs/fable-5-roadmaps-audits/.
- You are NOT the Thread 9 implementer (WP-5.9 code). That is a separate chat.
- You are NOT automatically Fable’s entire multi-week history — that is another thread
  (session 1401cf7a, often titled "Health check results"). Use the attached docs as truth.

## Mandatory reads (attached)
1. handover-this-grok-session-to-cursor-2026-07-20.md  ← this transfer
2. handover-grok-build-to-cursor-2026-07-19.md
3. cooperative-multi-agent-workflow-2026-07-19.md
4. master-roadmap-2026-07.md (§1 + §13)
5. executor-preferences-grok-build-2026-07.md
6. story-status-nurburgring-2026-07-19.md
7. fable5-living-gm-feasibility-2026-07-18.md
8. ideas-parking-living-gm-truman-2026-07-18.md
9. guardian-npc-state-management-design-2026-07.md (D9)
10. cursor-thread-9-setup-2026-07-19.md

## Where we left off
- Track day complete; RP Thread 9 / Affalterbach runway next for story.
- Engineering: 5.1–5.8 shipped; WP-5.9 scope frozen in Thread 9 Sol (npc_state_changes,
  knowledge human-always); Operator was cleared to send "go" — check if code landed.
- Duplex mixed (bridge_cache vs absent) = TM teething; do not expand into Phase 3 rewrite here.
- Living GM: designed, parked; five operator questions still open.
- Operator wants MORE DISCUSSION on: (A) Living GM, (B) NPCs, (C) general how-the-stack-functions
  model — before more big implementation.

## Your first reply (do this only)
1. ACK the transfer and list the three Cursor seats (this chat / Fable / Thread 9 Sol).
2. Give a plain-language one-page map of how the stack functions today (play path vs world machinery vs not-yet-built Living GM).
3. Propose a short discussion agenda for GM + NPCs (questions for Operator, not code).
4. Do NOT implement WP-5.9, Living GM code, or duplex fixes unless Operator explicitly assigns a WP id.
5. If Operator wants design notes written to disk, propose a filename under fable-5-roadmaps-audits/ first.

Standing laws: sequential WPs; pressure≠outcomes; one hot-path LLM; staging for canon;
knowledge human-always; cassettes frozen; project_source_files human-gated.
```

---

## After first reply

Talk GM + NPCs + system model.  
When ready for code: send Sol to Thread 9 with a frozen WP id — do not mix.
