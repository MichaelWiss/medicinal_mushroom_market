// Net-30 invoice PDF (Cell 5.1).
//
// Rendered with `@react-pdf/renderer` on the server, attached to the
// invoice email and surfaced on the order detail page. Layout is
// intentionally minimal — production would add VAT, payment terms,
// remit-to addressing, etc.

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  type DocumentProps,
} from '@react-pdf/renderer';
import * as React from 'react';

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#0b1d3a',
  },
  h1: {
    fontSize: 22,
    marginBottom: 6,
    fontFamily: 'Helvetica-Bold',
  },
  meta: { marginBottom: 24, color: '#5e6a7d' },
  sectionTitle: {
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: '#5e6a7d',
    marginBottom: 6,
  },
  row: { flexDirection: 'row' },
  cellSpecies: { flex: 3 },
  cellQty: { flex: 1, textAlign: 'right' },
  cellPrice: { flex: 1.2, textAlign: 'right' },
  cellTotal: { flex: 1.2, textAlign: 'right' },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#0b1d3a',
    paddingBottom: 4,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderColor: '#d4dae2',
    paddingVertical: 6,
  },
  totalsBlock: {
    marginTop: 24,
    alignSelf: 'flex-end',
    width: '40%',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalsRowGrand: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: '#0b1d3a',
    paddingTop: 6,
    marginTop: 6,
  },
  footer: { marginTop: 36, fontSize: 9, color: '#5e6a7d' },
});

export type InvoiceLine = {
  speciesName: string;
  formatLabel: string;
  quantity: number;
  /** Per-unit price in pence after any tier discount. */
  unitPricePence: number;
};

export type InvoicePdfProps = {
  invoiceNumber: string;
  orderId: string;
  companyName: string;
  buyerEmail: string;
  /** ISO yyyy-mm-dd. */
  issuedDate: string;
  /** ISO yyyy-mm-dd — issued + 30 days. */
  dueDate: string;
  lines: InvoiceLine[];
  totalPence: number;
  shippingAddress?: string | undefined;
};

const fmtGBP = (pence: number) =>
  `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function InvoicePdf(props: InvoicePdfProps): React.ReactElement<DocumentProps> {
  return (
    <Document
      title={`Invoice ${props.invoiceNumber}`}
      author="Mycelium B2B"
      subject={`Net-30 invoice for order ${props.orderId}`}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Invoice {props.invoiceNumber}</Text>
        <Text style={styles.meta}>
          Order {props.orderId} · Issued {props.issuedDate} · Due {props.dueDate} (Net 30)
        </Text>

        <View style={{ marginBottom: 18 }}>
          <Text style={styles.sectionTitle}>Bill to</Text>
          <Text>{props.companyName}</Text>
          <Text>{props.buyerEmail}</Text>
          {props.shippingAddress ? (
            <Text style={{ marginTop: 4, color: '#5e6a7d' }}>
              {props.shippingAddress}
            </Text>
          ) : null}
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.cellSpecies, styles.sectionTitle]}>Item</Text>
          <Text style={[styles.cellQty, styles.sectionTitle]}>Qty</Text>
          <Text style={[styles.cellPrice, styles.sectionTitle]}>Unit</Text>
          <Text style={[styles.cellTotal, styles.sectionTitle]}>Total</Text>
        </View>

        {props.lines.map((line, i) => (
          <View key={i} style={styles.tableRow} wrap={false}>
            <View style={styles.cellSpecies}>
              <Text>{line.speciesName}</Text>
              <Text style={{ color: '#5e6a7d', marginTop: 2 }}>
                {line.formatLabel}
              </Text>
            </View>
            <Text style={styles.cellQty}>{line.quantity}</Text>
            <Text style={styles.cellPrice}>{fmtGBP(line.unitPricePence)}</Text>
            <Text style={styles.cellTotal}>
              {fmtGBP(line.unitPricePence * line.quantity)}
            </Text>
          </View>
        ))}

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{fmtGBP(props.totalPence)}</Text>
          </View>
          <View style={styles.totalsRowGrand}>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>Total due</Text>
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>
              {fmtGBP(props.totalPence)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Payment is due {props.dueDate}. Please reference invoice{' '}
          {props.invoiceNumber} when paying. Late payments may attract
          interest at the statutory rate.
        </Text>
      </Page>
    </Document>
  );
}
