import { readFileSync } from 'node:fs';

import {
  ALLOWED_URL_SCHEMES,
  CACHE_PREFIX,
  EVENT,
  ID_PATTERN,
} from './constants';

describe('EVENT', () => {
  // The onEvent names are public contract: a host wires analytics to these
  // strings and a rename breaks their dashboards silently. SCHEMA.md is where
  // they are published, so the table there and this object have to agree.
  it('matches the names published in SCHEMA.md', () => {
    // Arrange — jest runs from rootDir, so SCHEMA.md sits at the cwd.
    const schemaDoc = readFileSync('SCHEMA.md', 'utf8');
    const section = schemaDoc.split('### `onEvent` names')[1] ?? '';
    const documented = [...section.matchAll(/^\| `([a-z_]+)` \|/gm)].map(
      (match) => match[1]
    );

    // Act
    const implemented = Object.values(EVENT);

    // Assert — a non-empty list also proves the section was actually found,
    // rather than the whole check passing vacuously on a bad path.
    expect(documented.length).toBeGreaterThan(0);
    expect([...documented].sort()).toEqual([...implemented].sort());
  });

  it('has no duplicate values', () => {
    // Arrange / Act
    const values = Object.values(EVENT);

    // Assert
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('ID_PATTERN', () => {
  it.each(['default', 'winback_2026', 'black-friday', 'a', 'A1_-b'])(
    'accepts %s',
    (id) => {
      // Arrange / Act / Assert
      expect(ID_PATTERN.test(id)).toBe(true);
    }
  );

  // An id is a URL path segment, a storage key and an analytics dimension at
  // once, so traversal and absolute URLs have to be impossible by construction.
  it.each([
    ['an empty string', ''],
    ['a traversal segment', '../secrets'],
    ['a slash', 'a/b'],
    ['a full URL', 'https://evil.example.com/x'],
    ['a dot', 'default.json'],
    ['whitespace', 'my id'],
    ['65 characters', 'a'.repeat(65)],
  ])('rejects %s', (_case, id) => {
    // Arrange / Act / Assert
    expect(ID_PATTERN.test(id)).toBe(false);
  });

  it('rejects a traversal id even on a repeated test, having no global flag', () => {
    // Arrange — a /g regex carries lastIndex between calls and would alternate.
    // Act / Assert
    expect(ID_PATTERN.test('../secrets')).toBe(false);
    expect(ID_PATTERN.test('../secrets')).toBe(false);
  });
});

describe('ALLOWED_URL_SCHEMES', () => {
  it('keeps the trailing colon on every entry', () => {
    // Arrange / Act / Assert — without it, `httpsx://` matches a `https` prefix.
    expect(ALLOWED_URL_SCHEMES.every((scheme) => scheme.endsWith(':'))).toBe(
      true
    );
  });
});

describe('CACHE_PREFIX', () => {
  it('carries a version segment, so a future envelope misses old entries', () => {
    // Arrange / Act / Assert
    expect(CACHE_PREFIX).toMatch(/:v\d+:/);
  });
});
