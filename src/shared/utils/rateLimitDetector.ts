/**
 * Detects rate limit messages from Claude and parses reset time from them.
 */

const RATE_LIMIT_SUBSTRING = "You've hit your limit";

/**
 * Returns true if the message text contains the rate limit indicator.
 */
export function isRateLimitMessage(text: string): boolean {
  return text.includes(RATE_LIMIT_SUBSTRING);
}

// ---------------------------------------------------------------------------
// Reset-time parsing
// ---------------------------------------------------------------------------

/**
 * Maps known Claude timezone abbreviations to fixed UTC offsets in minutes.
 * We only include zones Claude's API has been observed to emit. Unknown zones
 * fall back to the user's local timezone (parser returns null when the zone is
 * ambiguous without more context).
 */
const TIMEZONE_OFFSETS_MIN: Record<string, number> = {
  UTC: 0,
  GMT: 0,
  // North America — standard times
  EST: -5 * 60,
  CST: -6 * 60,
  MST: -7 * 60,
  PST: -8 * 60,
  // North America — daylight times
  EDT: -4 * 60,
  CDT: -5 * 60,
  MDT: -6 * 60,
  PDT: -7 * 60,
};

/**
 * Attempts to parse the reset time from a Claude rate-limit message.
 *
 * Supported formats (case-insensitive):
 *   - "limit will reset at 3pm (PST)"
 *   - "limit will reset at 3:30 pm (PST)"
 *   - "limit will reset at 15:30 UTC"
 *   - "resets at 3pm"                   (local time assumed)
 *   - "resets in 2 hours"
 *   - "resets in 45 minutes"
 *
 * Returns `null` when the reset time cannot be extracted reliably.
 *
 * @param text  the full rate-limit message text
 * @param now   reference "now" used to resolve wall-clock times and relative
 *              offsets (exposed for testability; defaults to `new Date()`)
 */
export function parseRateLimitResetTime(text: string, now: Date = new Date()): Date | null {
  if (!text) return null;

  const relative = parseRelativeResetDuration(text);
  if (relative !== null) {
    return new Date(now.getTime() + relative);
  }

  return parseAbsoluteResetClockTime(text, now);
}

// ---------------------------------------------------------------------------
// Relative durations: "resets in 2 hours", "resets in 45 minutes"
// ---------------------------------------------------------------------------

const RELATIVE_RESET_RE =
  /reset(?:s|ting)?\s+in\s+(?:about\s+|around\s+|~\s*)?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|h|m|s)\b/i;

function parseRelativeResetDuration(text: string): number | null {
  const match = RELATIVE_RESET_RE.exec(text);
  if (!match) return null;

  const amount = Number.parseFloat(match[1]!);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const unit = match[2]!.toLowerCase();
  if (unit.startsWith('sec') || unit === 's') return Math.round(amount * 1000);
  if (unit.startsWith('min') || unit === 'm') return Math.round(amount * 60 * 1000);
  if (unit.startsWith('hour') || unit.startsWith('hr') || unit === 'h') {
    return Math.round(amount * 60 * 60 * 1000);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Absolute clock times: "resets at 3pm (PST)", "resets at 15:30 UTC"
// ---------------------------------------------------------------------------

/**
 * Captures the clock time + optional timezone abbreviation from phrases like
 * "reset at 3pm (PST)" or "resets at 15:30 UTC".
 */
const ABSOLUTE_RESET_RE =
  /reset(?:s|ting)?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([A-Z]{2,5})\)|([A-Z]{2,5}))?/i;

function parseAbsoluteResetClockTime(text: string, now: Date): Date | null {
  const match = ABSOLUTE_RESET_RE.exec(text);
  if (!match) return null;

  const hourRaw = Number.parseInt(match[1]!, 10);
  const minuteRaw = match[2] ? Number.parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase() ?? null;
  const tzAbbr = (match[4] ?? match[5] ?? '').toUpperCase();

  if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw)) return null;
  if (minuteRaw < 0 || minuteRaw > 59) return null;

  let hour = hourRaw;
  if (ampm === 'pm' && hour < 12) hour += 12;
  else if (ampm === 'am' && hour === 12) hour = 0;

  if (hour < 0 || hour > 23) return null;

  // Timezone resolution:
  //   - known abbreviation → compute UTC wall time
  //   - no abbreviation    → treat as user-local time
  //   - unknown abbreviation (e.g. "CEST" not in map) → bail out; don't guess
  let candidate: Date;
  if (!tzAbbr) {
    candidate = buildLocalToday(now, hour, minuteRaw);
  } else if (tzAbbr in TIMEZONE_OFFSETS_MIN) {
    candidate = buildUtcTodayWithOffset(now, hour, minuteRaw, TIMEZONE_OFFSETS_MIN[tzAbbr]!);
  } else {
    return null;
  }

  // If the computed time is in the past (e.g. "3pm" parsed while it's already
  // 4pm), roll forward by one day.
  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidate;
}

function buildLocalToday(now: Date, hour: number, minute: number): Date {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function buildUtcTodayWithOffset(
  now: Date,
  hour: number,
  minute: number,
  offsetMinutes: number
): Date {
  // The caller's "hour:minute" is expressed in the target zone. Anchor the
  // calendar date in that zone too — not in UTC — otherwise we get a 24h
  // error when the zone-local day differs from UTC's day (e.g. 01:00 UTC is
  // still "yesterday" for any negative-offset zone like PST).
  const zoned = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const offsetMs = offsetMinutes * 60 * 1000;
  return new Date(
    Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate(), hour, minute, 0, 0) -
      offsetMs
  );
}
