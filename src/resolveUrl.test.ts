import { assertValidId, pickUrl, resolveUrl } from './resolveUrl';

describe('assertValidId', () => {
  it.each(['default', 'a', 'A1_-', 'x'.repeat(64)])('accepts %s', (id) => {
    // Act / Assert
    expect(() => assertValidId(id)).not.toThrow();
  });

  it.each([
    ['empty string', ''],
    ['too long', 'x'.repeat(65)],
    ['contains a slash', 'a/b'],
    ['contains a dot', 'a.json'],
    ['contains a space', 'a b'],
    ['is a full URL', 'https://evil.example.com'],
    ['is a path traversal', '../secrets'],
  ])('rejects %s with a RangeError', (_label, id) => {
    // Act / Assert
    expect(() => assertValidId(id)).toThrow(RangeError);
  });
});

describe('resolveUrl', () => {
  it('joins endpoint and id with a slash', () => {
    // Arrange
    const endpoint = 'https://cdn.example.com/paywalls';

    // Act
    const url = resolveUrl(endpoint, 'default');

    // Assert
    expect(url).toBe('https://cdn.example.com/paywalls/default.json');
  });

  it('strips one or more trailing slashes from endpoint', () => {
    // Act
    const url = resolveUrl('https://cdn.example.com/paywalls///', 'default');

    // Assert
    expect(url).toBe('https://cdn.example.com/paywalls/default.json');
  });

  it('never appends a query string', () => {
    // Act
    const url = resolveUrl('https://cdn.example.com', 'default');

    // Assert
    expect(url).not.toContain('?');
  });
});

describe('pickUrl', () => {
  it('uses resolveUrl(endpoint, id) when no buildUrl is given', () => {
    // Act
    const url = pickUrl({ endpoint: 'https://cdn.example.com' }, 'default');

    // Assert
    expect(url).toBe('https://cdn.example.com/default.json');
  });

  it('lets buildUrl fully override URL construction, ignoring endpoint', () => {
    // Arrange
    const buildUrl = (id: string) => `https://other.example.com/v2/${id}`;

    // Act
    const url = pickUrl(
      { endpoint: 'https://cdn.example.com', buildUrl },
      'default'
    );

    // Assert
    expect(url).toBe('https://other.example.com/v2/default');
  });
});
