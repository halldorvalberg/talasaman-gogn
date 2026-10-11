// Text formatting shared by the views. Numbers and dates use Icelandic format.

/** Compare two strings in Icelandic alphabetical order (á after a, þ æ ö at the end). */
export const compareIcelandic = new Intl.Collator('is').compare;

/** 1234 → '1.234' */
export const formatNumber = (n) => n.toLocaleString('is-IS');

/** An ISO timestamp as a local Icelandic date and time. */
export const formatTime = (iso) => new Date(iso).toLocaleString('is-IS');

/** A count with the right noun: plural(1, 'table', 'tables') → '1 table'. */
export const plural = (n, one, many) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** '1 person' / '7 people' */
export const people = (n) => plural(n, 'person', 'people');

/** { lat, lng } → '64.14° N, 21.95° W' */
export function formatCoord({ lat, lng }) {
  const part = (v, pos, neg) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
  return `${part(lat, 'N', 'S')}, ${part(lng, 'E', 'W')}`;
}

/** Seconds as a clock: 185.4 → '3:05' */
export function formatClock(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * The first `max` characters of a text, cut at a word (unless that would lose
 * over 40% of it), with '…' if shortened.
 */
export function excerpt(text, max = 200) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > max * 0.6 ? lastSpace : max).trimEnd()}…`;
}

/** Where a table met: 'Fjölbrautaskóli Suðurlands · Borð 3'. */
export const tableAt = ({ location, table }) => `${location} · Borð ${table}`;

/**
 * A summary recording's title: 'gervigreind · Fjölbrautaskóli Suðurlands'.
 * The place but not the table, so a recording can't be traced to one table.
 */
export const recordingTitle = (row) => `${row.topic} · ${row.location}`;
