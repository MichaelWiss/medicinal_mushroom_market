// React Email templates (Cell 4.1).
//
// Three transactional emails called from the Stripe webhook
// (Cell 3.4) and the subscription engine (Cell 4.3):
//
//   • OrderConfirmationEmail  — sent after `checkout.session.completed`
//   • BackorderEmail          — sent when allocate_batch returns null
//   • DispatchEmail           — sent when ops marks an order `dispatched`
//
// Templates intentionally keep markup minimal (Container / Section /
// Heading / Text / Hr / Link) so they render acceptably in every
// major mail client without a bespoke design pass.

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

type Money = number; // pence

const gbp = (pence: Money) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    pence / 100,
  );

export type OrderLinePresentation = {
  speciesName: string;
  format: string;
  quantity: number;
  unitPrice: Money;
};

export type OrderConfirmationProps = {
  orderRef: string;
  totalPrice: Money;
  dispatchDate: string | null;
  lines: OrderLinePresentation[];
  orderUrl: string;
};

export function OrderConfirmationEmail(props: OrderConfirmationProps) {
  const { orderRef, totalPrice, dispatchDate, lines, orderUrl } = props;
  return (
    <Html>
      <Head />
      <Preview>Order {orderRef} confirmed</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            Order confirmed
          </Heading>
          <Text style={p}>
            Thanks — we&apos;ve received payment for order <b>{orderRef}</b>.
            {dispatchDate ? ` Dispatch is scheduled for ${dispatchDate}.` : ''}
          </Text>

          <Hr style={hr} />

          <Section>
            {lines.map((line, i) => (
              <Text key={i} style={lineRow}>
                <b>{line.speciesName}</b> — {line.format} × {line.quantity} ·{' '}
                {gbp(line.unitPrice * line.quantity)}
              </Text>
            ))}
          </Section>

          <Hr style={hr} />

          <Text style={total}>Total: {gbp(totalPrice)}</Text>

          <Section style={ctaWrap}>
            <Link href={orderUrl} style={cta}>
              View order
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export type BackorderProps = {
  orderRef: string;
  speciesNames: string[];
  orderUrl: string;
};

export function BackorderEmail(props: BackorderProps) {
  const { orderRef, speciesNames, orderUrl } = props;
  return (
    <Html>
      <Head />
      <Preview>Order {orderRef} — partial stock</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            We&apos;re short on stock
          </Heading>
          <Text style={p}>
            Order <b>{orderRef}</b> couldn&apos;t be fully allocated. The
            following items are on backorder:
          </Text>
          <Section>
            {speciesNames.map((name, i) => (
              <Text key={i} style={lineRow}>
                • {name}
              </Text>
            ))}
          </Section>
          <Text style={p}>
            We&apos;ll allocate from the next passing batch and email you
            again with a dispatch date. No further action is needed.
          </Text>
          <Section style={ctaWrap}>
            <Link href={orderUrl} style={cta}>
              View order
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export type DispatchProps = {
  orderRef: string;
  trackingNumber: string | null;
  dispatchDate: string | null;
  orderUrl: string;
};

export type QuoteProps = {
  quoteRef: string;
  quoteUrl: string;
  expiresAt: string | null;
};

export function QuoteEmail(props: QuoteProps) {
  const { quoteRef, quoteUrl, expiresAt } = props;
  return (
    <Html>
      <Head />
      <Preview>Your bulk quote is ready</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            Your bulk quote is ready
          </Heading>
          <Text style={p}>
            Quote <b>{quoteRef.slice(0, 8).toUpperCase()}</b> has been
            prepared for your company. Review the line items and accept
            to convert it into a confirmed order.
          </Text>
          {expiresAt ? (
            <Text style={p}>
              This quote expires on <b>{new Date(expiresAt).toISOString().slice(0, 10)}</b>.
            </Text>
          ) : null}
          <Section style={ctaWrap}>
            <Link href={quoteUrl} style={cta}>
              Review &amp; approve
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export function DispatchEmail(props: DispatchProps) {
  const { orderRef, trackingNumber, dispatchDate, orderUrl } = props;
  return (
    <Html>
      <Head />
      <Preview>Order {orderRef} dispatched</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            Your order is on its way
          </Heading>
          <Text style={p}>
            Order <b>{orderRef}</b> has been dispatched
            {dispatchDate ? ` on ${dispatchDate}` : ''}
            {trackingNumber ? `. Tracking: ${trackingNumber}.` : '.'}
          </Text>
          <Section style={ctaWrap}>
            <Link href={orderUrl} style={cta}>
              Track order
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export type InvoiceProps = {
  invoiceNumber: string;
  orderRef: string;
  totalPrice: Money;
  dueDate: string;
  orderUrl: string;
};

export function InvoiceEmail(props: InvoiceProps) {
  const { invoiceNumber, orderRef, totalPrice, dueDate, orderUrl } = props;
  return (
    <Html>
      <Head />
      <Preview>Invoice {invoiceNumber} — order {orderRef}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            Net-30 invoice
          </Heading>
          <Text style={p}>
            Order <b>{orderRef}</b> has been confirmed under your Net-30
            terms. Invoice <b>{invoiceNumber}</b> for{' '}
            <b>{gbp(totalPrice)}</b> is attached as a PDF.
          </Text>
          <Text style={p}>
            Payment is due by <b>{dueDate}</b>. Please reference invoice
            number {invoiceNumber} when paying.
          </Text>
          <Section style={ctaWrap}>
            <Link href={orderUrl} style={cta}>
              View order
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// --- Inline styles -----------------------------------------------------

const body: React.CSSProperties = {
  backgroundColor: '#f4f1ea',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  padding: '24px 0',
};

const container: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 8,
  margin: '0 auto',
  maxWidth: 560,
  padding: 32,
};

const h1: React.CSSProperties = {
  color: '#0b1d3a',
  fontSize: 24,
  fontWeight: 600,
  margin: '0 0 16px',
};

const p: React.CSSProperties = {
  color: '#1f2937',
  fontSize: 14,
  lineHeight: 1.6,
  margin: '0 0 16px',
};

const lineRow: React.CSSProperties = {
  color: '#1f2937',
  fontSize: 14,
  lineHeight: 1.6,
  margin: '0 0 4px',
};

const total: React.CSSProperties = {
  color: '#0b1d3a',
  fontSize: 16,
  fontWeight: 600,
  margin: '0 0 24px',
  textAlign: 'right',
};

const hr: React.CSSProperties = {
  borderColor: '#e5e0d6',
  margin: '24px 0',
};

const ctaWrap: React.CSSProperties = {
  textAlign: 'center',
  marginTop: 24,
};

const cta: React.CSSProperties = {
  backgroundColor: '#0b1d3a',
  borderRadius: 4,
  color: '#ffffff',
  display: 'inline-block',
  fontSize: 14,
  fontWeight: 600,
  padding: '12px 24px',
  textDecoration: 'none',
};
