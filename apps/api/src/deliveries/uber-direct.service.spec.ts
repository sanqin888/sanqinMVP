import type { HttpService } from '@nestjs/axios';
import { UberDirectService } from './uber-direct.service';

const ORIGINAL_ENV = process.env;

describe('UberDirectService characterization', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      UBER_DIRECT_API_BASE: 'https://api.uber.test',
      UBER_DIRECT_CUSTOMER_ID: 'customer-1',
      UBER_DIRECT_SERVER_TOKEN: 'server-token',
      UBER_DIRECT_AUTH_SCHEME: 'Token',
      UBER_DIRECT_STORE_BUSINESS_NAME: 'SanQ Roujiamo',
      UBER_DIRECT_STORE_CONTACT: 'SanQ Staff',
      UBER_DIRECT_STORE_PHONE: '+14165550000',
      UBER_DIRECT_STORE_ADDRESS_LINE1: '4750 Yonge St',
      UBER_DIRECT_STORE_CITY: 'Toronto',
      UBER_DIRECT_STORE_PROVINCE: 'ON',
      UBER_DIRECT_STORE_POSTAL_CODE: 'M2N 0J6',
      UBER_DIRECT_STORE_COUNTRY: 'Canada',
      UBER_DIRECT_CURRENCY: 'CAD',
    };
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-09-05T20:00:00.000Z').getTime());
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it('maps the canonical delivery request into the current Uber Direct payload and normalizes provider truth', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        delivery_id: 'uber-delivery-1',
        external_delivery_id: 'SQT2609051234',
        status: 'pending',
        tracking_url: 'https://tracking.example/uber-delivery-1',
        delivery_fee_cents: '799',
      },
    });
    const service = new UberDirectService({
      axiosRef: { post },
    } as unknown as HttpService);

    await expect(
      service.createDelivery({
        orderRef: 'SQT2609051234',
        pickupCode: '1234',
        reference: 'POS-1234',
        totalCents: 2599,
        items: [
          { name: 'Roujiamo', quantity: 2, priceCents: 999 },
          { name: '  ', quantity: 1, priceCents: 100 },
        ],
        destination: {
          name: 'Jane Doe',
          phone: '+14165550123',
          addressLine1: '100 King St W',
          city: 'Toronto',
          province: 'ON',
          postalCode: 'M5X 1A9',
          country: 'Canada',
          instructions: 'Lobby pickup',
          tipCents: 250,
        },
        pickupReadyAt: new Date('2026-09-05T20:10:00.000Z'),
      }),
    ).resolves.toEqual({
      deliveryId: 'uber-delivery-1',
      externalDeliveryId: 'SQT2609051234',
      status: 'pending',
      trackingUrl: 'https://tracking.example/uber-delivery-1',
      deliveryCostCents: 799,
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'https://api.uber.test/v1/customers/customer-1/deliveries',
      expect.objectContaining({
        external_delivery_id: 'SQT2609051234',
        manifest_reference: 'POS-1234',
        pickup_name: 'SanQ Staff',
        pickup_business_name: 'SanQ Roujiamo',
        pickup_address: '4750 Yonge St, Toronto, ON, M2N 0J6, Canada',
        pickup_phone_number: '+14165550000',
        dropoff_name: 'Jane Doe',
        dropoff_address: '100 King St W, Toronto, ON, M5X 1A9, Canada',
        dropoff_phone_number: '+14165550123',
        dropoff_instructions: 'Lobby pickup',
        manifest_items: [{ name: 'Roujiamo', quantity: 2, price: 999 }],
        manifest_total_value: 2599,
        manifest_currency_code: 'CAD',
        tip: 250,
        pickup_ready: '2026-09-05T20:10:00.000Z',
        pickup_deadline: '2026-09-05T20:25:00.000Z',
        dropoff_ready: '2026-09-05T20:30:00.000Z',
        dropoff_deadline: '2026-09-05T21:00:00.000Z',
      }),
      {
        headers: {
          Authorization: 'Token server-token',
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: 20000,
      },
    );
  });

  it('rejects a database UUID orderRef before making any provider request', async () => {
    const post = jest.fn();
    const service = new UberDirectService({
      axiosRef: { post },
    } as unknown as HttpService);

    await expect(
      service.createDelivery({
        orderRef: '8a3d4c0e-4750-4f6a-9138-000000000201',
        totalCents: 1000,
        items: [],
        destination: {
          name: 'Jane Doe',
          phone: '+14165550123',
          addressLine1: '100 King St W',
          city: 'Toronto',
          province: 'ON',
          postalCode: 'M5X 1A9',
        },
      }),
    ).rejects.toThrow('orderRef must not be a UUID');

    expect(post).not.toHaveBeenCalled();
  });
});
