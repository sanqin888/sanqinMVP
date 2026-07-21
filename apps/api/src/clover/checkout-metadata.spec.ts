import { parseCheckoutMetadata } from './checkout-metadata';

const metadataWithCustomer = (customer: Record<string, unknown>) => ({
  fulfillment: 'pickup',
  customer,
  items: [
    {
      productStableId: 'c1234567890abcdefghijklmn',
      quantity: 1,
      priceCents: 1000,
    },
  ],
  subtotalCents: 1000,
  taxCents: 130,
});

describe('parseCheckoutMetadata customer contacts', () => {
  it('姓名和邮箱存在而电话缺失时通过', () => {
    const result = parseCheckoutMetadata(
      metadataWithCustomer({
        firstName: 'San',
        lastName: 'Qin',
        email: 'customer@example.com',
      }),
    );

    expect(result.customer).toEqual({
      firstName: 'San',
      lastName: 'Qin',
      email: 'customer@example.com',
    });
    expect(result.customer).not.toHaveProperty('phone');
  });

  it('姓名和电话存在而邮箱缺失时通过并规范化加拿大电话号码', () => {
    const result = parseCheckoutMetadata(
      metadataWithCustomer({
        firstName: 'San',
        lastName: 'Qin',
        phone: '(416) 555-1234',
      }),
    );

    expect(result.customer.phone).toBe('+14165551234');
    expect(result.customer).not.toHaveProperty('email');
  });

  it('邮箱和电话都缺失时拒绝', () => {
    expect(() =>
      parseCheckoutMetadata(
        metadataWithCustomer({ firstName: 'San', lastName: 'Qin' }),
      ),
    ).toThrow('customer email or phone is required');
  });

  it.each([
    { firstName: '', lastName: 'Qin' },
    { firstName: 'San', lastName: '' },
  ])('姓或名缺失时拒绝: %o', (customer) => {
    expect(() =>
      parseCheckoutMetadata(
        metadataWithCustomer({ ...customer, email: 'customer@example.com' }),
      ),
    ).toThrow('customer firstName and lastName are required');
  });

  it('email 和 phone 只有空格时视为缺失', () => {
    expect(() =>
      parseCheckoutMetadata(
        metadataWithCustomer({
          firstName: 'San',
          lastName: 'Qin',
          email: '   ',
          phone: '   ',
        }),
      ),
    ).toThrow('customer email or phone is required');
  });

  it('email 和 phone 同时存在时通过', () => {
    const result = parseCheckoutMetadata(
      metadataWithCustomer({
        firstName: 'San',
        lastName: 'Qin',
        email: 'customer@example.com',
        phone: '+1 416 555 1234',
      }),
    );

    expect(result.customer).toMatchObject({
      email: 'customer@example.com',
      phone: '+14165551234',
    });
  });

  it('拒绝格式无效的邮箱和加拿大电话号码', () => {
    expect(() =>
      parseCheckoutMetadata(
        metadataWithCustomer({
          firstName: 'San',
          lastName: 'Qin',
          email: 'not-an-email',
        }),
      ),
    ).toThrow('customer email must be a valid email');

    expect(() =>
      parseCheckoutMetadata(
        metadataWithCustomer({
          firstName: 'San',
          lastName: 'Qin',
          phone: '12345',
        }),
      ),
    ).toThrow('customer phone must be a valid Canadian phone number');
  });
});
