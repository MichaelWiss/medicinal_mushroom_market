// High-level send helpers (Cell 4.1).
//
// Render a React Email template, ship it through the Resend client.
// Callers (Stripe webhook, subscription engine) should use these
// helpers rather than touching `getEmailClient()` directly so that
// template + envelope construction stays in one place.

import 'server-only';
import { render } from '@react-email/render';
import * as React from 'react';
import { getEmailClient, type EmailSendResult } from './client';
import {
  BackorderEmail,
  DispatchEmail,
  InvoiceEmail,
  OrderConfirmationEmail,
  QuoteEmail,
  type BackorderProps,
  type DispatchProps,
  type InvoiceProps,
  type OrderConfirmationProps,
  type QuoteProps,
} from './templates';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export function orderUrl(orderId: string): string {
  return `${SITE_URL.replace(/\/$/, '')}/orders/${orderId}`;
}

async function dispatchSend(
  to: string,
  subject: string,
  element: React.ReactElement,
  tags: { name: string; value: string }[],
): Promise<EmailSendResult> {
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return getEmailClient().send({ to, subject, html, text, tags });
}

export function sendOrderConfirmation(
  to: string,
  props: OrderConfirmationProps,
): Promise<EmailSendResult> {
  return dispatchSend(
    to,
    `Order ${props.orderRef} confirmed`,
    <OrderConfirmationEmail {...props} />,
    [
      { name: 'kind', value: 'order_confirmation' },
      { name: 'order_id', value: props.orderRef },
    ],
  );
}

export function sendBackorderNotice(
  to: string,
  props: BackorderProps,
): Promise<EmailSendResult> {
  return dispatchSend(
    to,
    `Order ${props.orderRef} — partial stock`,
    <BackorderEmail {...props} />,
    [
      { name: 'kind', value: 'backorder' },
      { name: 'order_id', value: props.orderRef },
    ],
  );
}

export function sendDispatchNotice(
  to: string,
  props: DispatchProps,
): Promise<EmailSendResult> {
  return dispatchSend(
    to,
    `Order ${props.orderRef} dispatched`,
    <DispatchEmail {...props} />,
    [
      { name: 'kind', value: 'dispatch' },
      { name: 'order_id', value: props.orderRef },
    ],
  );
}

export function sendQuote(
  to: string,
  props: QuoteProps,
): Promise<EmailSendResult> {
  return dispatchSend(
    to,
    `Bulk quote ${props.quoteRef.slice(0, 8).toUpperCase()} ready for review`,
    <QuoteEmail {...props} />,
    [
      { name: 'kind', value: 'quote' },
      { name: 'quote_id', value: props.quoteRef },
    ],
  );
}

/**
 * Send a Net-30 invoice notification with the rendered PDF attached.
 * `pdfBase64` must be the base64-encoded contents of the invoice PDF.
 */
export async function sendInvoice(
  to: string,
  props: InvoiceProps,
  pdfBase64: string,
  pdfFilename: string,
): Promise<EmailSendResult> {
  const element = <InvoiceEmail {...props} />;
  const html = await render(element);
  const text = await render(element, { plainText: true });
  return getEmailClient().send({
    to,
    subject: `Invoice ${props.invoiceNumber} — order ${props.orderRef}`,
    html,
    text,
    tags: [
      { name: 'kind', value: 'invoice' },
      { name: 'order_id', value: props.orderRef },
      { name: 'invoice_number', value: props.invoiceNumber },
    ],
    attachments: [
      {
        filename: pdfFilename,
        content: pdfBase64,
        contentType: 'application/pdf',
      },
    ],
  });
}
