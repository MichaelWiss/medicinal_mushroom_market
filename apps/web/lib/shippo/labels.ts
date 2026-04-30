// Shippo label generation (Cell 6.1).
//
// `createLabel` composes the two-step Shippo flow:
//   1. POST /shipments  → returns rates from configured carrier accounts.
//   2. POST /transactions → purchases the chosen rate, returns label PDF + tracking.
//
// Cold-chain parcels (`coldChain: true`) set Shippo's signature confirmation
// hint and forward an `order_id` metadata string so the tracking webhook
// (Cell 6.3) can correlate updates back to a Mycelium order.

import 'server-only';
import { getShippoClient, ShippoError } from './client';

export interface ShippoAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string; // ISO-2 (e.g. 'US')
  phone?: string;
  email?: string;
}

export interface ShippoParcel {
  length: number;
  width: number;
  height: number;
  distanceUnit: 'in' | 'cm';
  weight: number;
  massUnit: 'lb' | 'kg' | 'oz' | 'g';
}

export interface CreateLabelInput {
  from: ShippoAddress;
  to: ShippoAddress;
  parcel: ShippoParcel;
  /** Mycelium order id; surfaced as Shippo metadata for webhook correlation. */
  orderId: string;
  /** Adds signature confirmation + records cold-chain note in metadata. */
  coldChain?: boolean;
  /**
   * Optional service-level token (e.g. `'usps_priority'`). If omitted, the
   * cheapest returned rate is used.
   */
  servicelevelToken?: string;
  /** Optional carrier-account id to restrict rating to one carrier. */
  carrierAccount?: string;
}

export interface CreateLabelResult {
  trackingNumber: string;
  trackingUrl: string;
  labelUrl: string;
  transactionId: string;
  carrier: string;
  rateAmount: string;
  rateCurrency: string;
}

interface ShippoRate {
  object_id: string;
  amount: string;
  currency: string;
  provider: string;
  servicelevel: { token: string; name: string };
  carrier_account?: string;
}

interface ShippoShipment {
  object_id: string;
  status: string;
  rates: ShippoRate[];
  messages?: Array<{ source?: string; code?: string; text: string }>;
}

interface ShippoTransaction {
  object_id: string;
  status: 'SUCCESS' | 'ERROR' | 'QUEUED' | 'WAITING';
  tracking_number: string;
  tracking_url_provider: string;
  label_url: string;
  rate: string;
  messages?: Array<{ source?: string; code?: string; text: string }>;
}

const SHIPPO_API_VERSION = '2018-02-08';

export async function createLabel(
  input: CreateLabelInput,
): Promise<CreateLabelResult> {
  const client = getShippoClient();

  if (!client.available) {
    throw new ShippoError(
      'SHIPPO_API_KEY is not set; cannot generate live shipping label.',
      500,
      null,
    );
  }

  const metadata = JSON.stringify({
    order_id: input.orderId,
    cold_chain: Boolean(input.coldChain),
  });

  const shipment = await client.request<ShippoShipment>('/shipments/', {
    method: 'POST',
    headers: { 'Shippo-API-Version': SHIPPO_API_VERSION },
    body: JSON.stringify({
      address_from: toShippoAddress(input.from),
      address_to: toShippoAddress(input.to),
      parcels: [toShippoParcel(input.parcel)],
      metadata,
      async: false,
      extra: input.coldChain
        ? { signature_confirmation: 'STANDARD' }
        : undefined,
    }),
  });

  if (!shipment?.rates?.length) {
    const detail =
      shipment?.messages?.map((m) => m.text).join('; ') ??
      'Shippo returned no rates for the requested shipment.';
    throw new ShippoError(detail, 422, shipment);
  }

  const rate = pickRate(
    shipment.rates,
    input.servicelevelToken,
    input.carrierAccount,
  );
  if (!rate) {
    throw new ShippoError(
      `No matching Shippo rate (servicelevel=${input.servicelevelToken ?? 'cheapest'})`,
      422,
      shipment.rates,
    );
  }

  const transaction = await client.request<ShippoTransaction>(
    '/transactions/',
    {
      method: 'POST',
      headers: { 'Shippo-API-Version': SHIPPO_API_VERSION },
      body: JSON.stringify({
        rate: rate.object_id,
        label_file_type: 'PDF',
        async: false,
        metadata,
      }),
    },
  );

  if (transaction.status !== 'SUCCESS') {
    const detail =
      transaction.messages?.map((m) => m.text).join('; ') ??
      `Shippo transaction status=${transaction.status}`;
    throw new ShippoError(detail, 422, transaction);
  }

  return {
    trackingNumber: transaction.tracking_number,
    trackingUrl: transaction.tracking_url_provider,
    labelUrl: transaction.label_url,
    transactionId: transaction.object_id,
    carrier: rate.provider,
    rateAmount: rate.amount,
    rateCurrency: rate.currency,
  };
}

function pickRate(
  rates: ShippoRate[],
  servicelevelToken?: string,
  carrierAccount?: string,
): ShippoRate | undefined {
  let pool = rates;
  if (carrierAccount) {
    pool = pool.filter((r) => r.carrier_account === carrierAccount);
  }
  if (servicelevelToken) {
    return pool.find((r) => r.servicelevel.token === servicelevelToken);
  }
  return [...pool].sort(
    (a, b) => Number.parseFloat(a.amount) - Number.parseFloat(b.amount),
  )[0];
}

function toShippoAddress(a: ShippoAddress) {
  return {
    name: a.name,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone,
    email: a.email,
  };
}

function toShippoParcel(p: ShippoParcel) {
  return {
    length: String(p.length),
    width: String(p.width),
    height: String(p.height),
    distance_unit: p.distanceUnit,
    weight: String(p.weight),
    mass_unit: p.massUnit,
  };
}
