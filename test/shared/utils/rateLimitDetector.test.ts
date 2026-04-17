import { describe, expect, it } from 'vitest';

import {
  isRateLimitMessage,
  parseRateLimitResetTime,
} from '../../../src/shared/utils/rateLimitDetector';

describe('isRateLimitMessage', () => {
  it('detects the canonical substring', () => {
    expect(isRateLimitMessage("You've hit your limit")).toBe(true);
    expect(
      isRateLimitMessage("You've hit your limit. Your limit will reset at 3pm (PST).")
    ).toBe(true);
  });

  it('returns false for unrelated text', () => {
    expect(isRateLimitMessage('All good here')).toBe(false);
    expect(isRateLimitMessage('hit the limit')).toBe(false); // missing "You've"
    expect(isRateLimitMessage('')).toBe(false);
  });
});

describe('parseRateLimitResetTime', () => {
  // ---------------------------------------------------------------------
  // Relative durations
  // ---------------------------------------------------------------------

  it('parses "resets in N hours"', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const result = parseRateLimitResetTime(
      "You've hit your limit. Resets in 2 hours.",
      now
    );
    expect(result?.toISOString()).toBe('2026-04-17T14:00:00.000Z');
  });

  it('parses "resets in N minutes"', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const result = parseRateLimitResetTime(
      "You've hit your limit. Will reset in 45 minutes.",
      now
    );
    expect(result?.toISOString()).toBe('2026-04-17T12:45:00.000Z');
  });

  it('parses "resets in about 30 minutes" with filler words', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const result = parseRateLimitResetTime(
      'Your limit will reset in about 30 minutes.',
      now
    );
    expect(result?.toISOString()).toBe('2026-04-17T12:30:00.000Z');
  });

  it('parses fractional hours', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const result = parseRateLimitResetTime('Resets in 1.5 hours.', now);
    expect(result?.toISOString()).toBe('2026-04-17T13:30:00.000Z');
  });

  // ---------------------------------------------------------------------
  // Absolute clock times with timezone
  // ---------------------------------------------------------------------

  it('parses "resets at 3pm (PST)"', () => {
    // 3pm PST = 23:00 UTC (PST = UTC-8)
    const now = new Date('2026-04-17T12:00:00Z'); // earlier than 23:00 UTC
    const result = parseRateLimitResetTime(
      "You've hit your limit. Your limit will reset at 3pm (PST).",
      now
    );
    expect(result?.toISOString()).toBe('2026-04-17T23:00:00.000Z');
  });

  it('parses "resets at 3:30 pm (PST)"', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const result = parseRateLimitResetTime(
      'Your limit will reset at 3:30 pm (PST).',
      now
    );
    expect(result?.toISOString()).toBe('2026-04-17T23:30:00.000Z');
  });

  it('parses 24-hour time with UTC', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const result = parseRateLimitResetTime(
      'Your limit will reset at 15:30 UTC.',
      now
    );
    expect(result?.toISOString()).toBe('2026-04-17T15:30:00.000Z');
  });

  it('rolls forward to tomorrow when the time has already passed today', () => {
    // 3pm PST = 23:00 UTC; if "now" is 23:30 UTC, the parsed 23:00 should
    // roll to tomorrow rather than return a time in the past.
    const now = new Date('2026-04-17T23:30:00Z');
    const result = parseRateLimitResetTime('Resets at 3pm (PST).', now);
    expect(result?.toISOString()).toBe('2026-04-18T23:00:00.000Z');
  });

  it('handles 12am (midnight) correctly', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    const result = parseRateLimitResetTime('Resets at 12am UTC.', now);
    // Same day midnight is already in the past relative to noon; rolls to next day.
    expect(result?.toISOString()).toBe('2026-04-18T00:00:00.000Z');
  });

  it('handles 12pm (noon) correctly', () => {
    const now = new Date('2026-04-17T06:00:00Z');
    const result = parseRateLimitResetTime('Resets at 12pm UTC.', now);
    expect(result?.toISOString()).toBe('2026-04-17T12:00:00.000Z');
  });

  // ---------------------------------------------------------------------
  // Unparseable / ambiguous cases
  // ---------------------------------------------------------------------

  it('returns null when no reset time is present', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    expect(parseRateLimitResetTime("You've hit your limit.", now)).toBeNull();
    expect(parseRateLimitResetTime('', now)).toBeNull();
  });

  it('returns null for unknown timezone abbreviations', () => {
    // CEST is not in our whitelist — don't guess.
    const now = new Date('2026-04-17T12:00:00Z');
    expect(parseRateLimitResetTime('Resets at 3pm (CEST).', now)).toBeNull();
  });

  it('returns null for invalid clock values', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    expect(parseRateLimitResetTime('Resets at 25:00 UTC.', now)).toBeNull();
    expect(parseRateLimitResetTime('Resets at 10:99 UTC.', now)).toBeNull();
  });

  it('returns null for negative relative durations', () => {
    const now = new Date('2026-04-17T12:00:00Z');
    // Regex requires \d+ so "-2" won't match; we'd get null anyway, but verify.
    expect(parseRateLimitResetTime('Resets in -2 hours.', now)).toBeNull();
  });
});
