# Member Work Sync Debugging

`member-work-sync` stores member-scoped control-plane state under each team member:

```text
~/.claude/teams/<team>/members/<member-key>/.member-work-sync/
  status.json
  reports.json
  outbox.json
  journal.jsonl
```

`member-key` is the normalized, percent-encoded member name. The canonical name is stored in:

```text
~/.claude/teams/<team>/members/<member-key>/member.meta.json
```

Use the journal for local debugging:

```bash
tail -f ~/.claude/teams/<team>/members/<member-key>/.member-work-sync/journal.jsonl
```

The journal is append-only JSONL and records sync decisions, not raw agent transcripts. Useful events:

- `reconcile_started`, `agenda_loaded`, `decision_made`, `status_written`
- `report_received`, `report_accepted`, `report_rejected`
- `nudge_planned`, `nudge_delivered`, `nudge_skipped`, `nudge_retryable`, `nudge_superseded`
- `member_busy`, `watchdog_cooldown_active`, `team_inactive`, `legacy_fallback_used`

Team-level shared/index state remains under:

```text
~/.claude/teams/<team>/.member-work-sync/
  indexes/
  report-token-secret.json
```

The indexes are implementation details used to avoid scanning every member directory on the hot path.
