// Canonical PostHog event catalogue (Cell 7.1).
//
// Every backend event flows through `track()` with a value from this
// module so we have one source of truth for event names + property
// shapes. Funnel definitions in PostHog reference these literals
// directly — keep them stable.

export const PH_EVENTS = {
  CATALOG_VIEW: 'catalog_view',
  SPECIES_VIEW: 'species_view',
  ADD_TO_CART: 'add_to_cart',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  SUBSCRIPTION_CREATED: 'subscription_created',
  BATCH_ALLOCATED: 'batch_allocated',
  BACKORDER_TRIGGERED: 'backorder_triggered',
} as const;

export type PHEventName = (typeof PH_EVENTS)[keyof typeof PH_EVENTS];

// Per-event property shapes. Optional fields stay optional so callers
// can drop-ship the capture without forcing data they don't have at
// that point in the flow.
export type PHEventProps = {
  [PH_EVENTS.CATALOG_VIEW]: {
    speciesCount: number;
  };
  [PH_EVENTS.SPECIES_VIEW]: {
    speciesId: string;
    speciesCommonName?: string;
    tier?: 'spot' | 'agreement' | 'oem';
  };
  [PH_EVENTS.ADD_TO_CART]: {
    speciesId: string;
    format: string;
    quantity: number;
    unitPricePence: number;
  };
  [PH_EVENTS.CHECKOUT_STARTED]: {
    orderId: string;
    paymentMethod: 'card' | 'net30';
    totalPence: number;
    lineItemCount: number;
  };
  [PH_EVENTS.CHECKOUT_COMPLETED]: {
    orderId: string;
    paymentMethod: 'card' | 'net30';
    totalPence: number;
    lineItemCount: number;
  };
  [PH_EVENTS.SUBSCRIPTION_CREATED]: {
    subscriptionId: string;
    speciesId: string;
    frequency: 'weekly' | 'biweekly' | 'monthly';
    quantity: number;
  };
  [PH_EVENTS.BATCH_ALLOCATED]: {
    orderId: string;
    orderItemId: string;
    speciesId: string;
    batchId: string;
    quantity: number;
  };
  [PH_EVENTS.BACKORDER_TRIGGERED]: {
    orderId: string;
    speciesId: string;
    quantity: number;
  };
};
