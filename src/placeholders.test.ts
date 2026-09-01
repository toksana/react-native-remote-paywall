import { resolvePlaceholders, resolveText } from './placeholders';
import type { PackageDefinition, ResolvedProduct } from './schema';
import type { RenderContext } from './renderContext';

const annual: PackageDefinition = {
  id: 'annual',
  productId: 'com.example.app.pro.annual',
  title: 'Annual',
};

const annualProduct: ResolvedProduct = {
  productId: 'com.example.app.pro.annual',
  price: '$39.99',
  period: 'year',
  pricePerUnit: '$3.33',
  introPrice: '$19.99',
  trialLength: '7 days',
};

const contextWith = (
  overrides: Partial<RenderContext> = {}
): RenderContext => ({
  packages: [annual],
  products: { [annualProduct.productId]: annualProduct },
  selectedPackageId: annual.id,
  onSelectPackage: jest.fn(),
  onAction: jest.fn(),
  ...overrides,
});

describe('resolvePlaceholders', () => {
  it.each([
    ['{{package.title}}', 'Annual'],
    ['{{package.price}}', '$39.99'],
    ['{{package.period}}', 'year'],
    ['{{package.pricePerUnit}}', '$3.33'],
    ['{{package.introPrice}}', '$19.99'],
    ['{{package.trialLength}}', '7 days'],
  ])('resolves %s', (input, expected) => {
    // Arrange / Act
    const result = resolvePlaceholders(input, annual, annualProduct);

    // Assert
    expect(result).toBe(expected);
  });

  it('returns the input unchanged when it holds no token', () => {
    // Arrange
    const input = 'Cancel anytime in Settings.';

    // Act
    const result = resolvePlaceholders(input, annual, annualProduct);

    // Assert
    expect(result).toBe(input);
  });

  it('resolves several tokens in one string', () => {
    // Arrange
    const input = 'Then {{package.price}} per {{package.period}}.';

    // Act
    const result = resolvePlaceholders(input, annual, annualProduct);

    // Assert
    expect(result).toBe('Then $39.99 per year.');
  });

  it('tolerates whitespace inside the braces', () => {
    // Arrange / Act
    const result = resolvePlaceholders(
      '{{  package.price  }}',
      annual,
      annualProduct
    );

    // Assert
    expect(result).toBe('$39.99');
  });

  // The closed token set is public contract: an unknown token must vanish, not
  // leak the raw `{{...}}` to a paying user. See the Placeholders section of
  // SCHEMA.md.
  it.each([
    '{{package.currency}}',
    '{{package.}}',
    '{{user.name}}',
    '{{price}}',
  ])('renders the unsupported token %s as nothing', (input) => {
    // Arrange / Act
    const result = resolvePlaceholders(input, annual, annualProduct);

    // Assert
    expect(result).not.toContain('{{');
  });

  it('renders a supported token the store did not return as an empty string', () => {
    // Arrange
    const withoutTrial: ResolvedProduct = {
      productId: annual.productId,
      price: '$39.99',
    };

    // Act
    const result = resolvePlaceholders(
      'Try free for {{package.trialLength}}',
      annual,
      withoutTrial
    );

    // Assert — the documented footgun: copy must survive the empty tail.
    expect(result).toBe('Try free for ');
  });

  it.each([
    ['no package and no product', undefined, undefined],
    ['a package but no product', annual, undefined],
    ['a product but no package', undefined, annualProduct],
  ])('does not throw with %s', (_case, pkg, product) => {
    // Arrange
    const input = '{{package.title}} — {{package.price}}';

    // Act / Assert
    expect(() => resolvePlaceholders(input, pkg, product)).not.toThrow();
  });
});

describe('resolveText', () => {
  it('resolves against the selected package', () => {
    // Arrange
    const monthly: PackageDefinition = {
      id: 'monthly',
      productId: 'com.example.app.pro.monthly',
      title: 'Monthly',
    };
    const ctx = contextWith({
      packages: [annual, monthly],
      products: {
        ...contextWith().products,
        [monthly.productId]: { productId: monthly.productId, price: '$4.99' },
      },
      selectedPackageId: monthly.id,
    });

    // Act
    const result = resolveText('{{package.title}} — {{package.price}}', ctx);

    // Assert
    expect(result).toBe('Monthly — $4.99');
  });

  it('empties every token when the selected id matches no package', () => {
    // Arrange
    const ctx = contextWith({ selectedPackageId: 'does-not-exist' });

    // Act
    const result = resolveText('{{package.title}} {{package.price}}', ctx);

    // Assert
    expect(result).toBe(' ');
  });

  it('empties price tokens when the store has not resolved the product yet', () => {
    // Arrange — the cold-start window: the document renders before products land.
    const ctx = contextWith({ products: {} });

    // Act
    const result = resolveText('{{package.title}} for {{package.price}}', ctx);

    // Assert
    expect(result).toBe('Annual for ');
  });
});
