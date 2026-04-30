// Resend transport (Cell 4.1).
//
// Single shared singleton. Reads `RESEND_API_KEY` and an optional
// `EMAIL_FROM` (default: `Mycelium <onboarding@resend.dev>` so local
// dev works against Resend's sandbox sender without DNS setup).
//
// When `RESEND_API_KEY` is unset (the local-dev default until ops
// provisions a key) the client returns a no-op shim that logs the
// payload to the server console. This lets Cell 3.4's webhook +
// Cell 4.3's subscription engine call into the email layer without
// blowing up in environments that have not been wired to Resend yet.

import 'server-only';
import { Resend } from 'resend';

export type EmailAttachment = {
  filename: string;
  /** Base64-encoded file contents. */
  content: string;
  contentType?: string;
};

export type EmailEnvelope = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  attachments?: EmailAttachment[];
};

export type EmailSendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export interface EmailClient {
  send(envelope: EmailEnvelope): Promise<EmailSendResult>;
}

const FROM = process.env.EMAIL_FROM ?? 'Mycelium <onboarding@resend.dev>';

let client: EmailClient | null = null;

function buildClient(): EmailClient {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      async send(envelope) {
        // Local-dev fallback. Surfaces in `pnpm --filter web dev` logs
        // so engineers can copy-paste the rendered HTML into a browser.
        console.warn(
          '[email] RESEND_API_KEY unset — skipping send',
          JSON.stringify({
            to: envelope.to,
            subject: envelope.subject,
            tags: envelope.tags,
          }),
        );
        return { ok: true, id: 'dev-noop' };
      },
    };
  }

  const resend = new Resend(key);
  return {
    async send(envelope) {
      const payload: Parameters<typeof resend.emails.send>[0] = {
        from: FROM,
        to: envelope.to,
        subject: envelope.subject,
        html: envelope.html,
      };
      if (envelope.text !== undefined) payload.text = envelope.text;
      if (envelope.replyTo !== undefined) payload.replyTo = envelope.replyTo;
      if (envelope.tags !== undefined) payload.tags = envelope.tags;
      if (envelope.attachments !== undefined) {
        payload.attachments = envelope.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          ...(a.contentType ? { contentType: a.contentType } : {}),
        }));
      }
      const { data, error } = await resend.emails.send(payload);
      if (error || !data) {
        return { ok: false, error: error?.message ?? 'unknown send error' };
      }
      return { ok: true, id: data.id };
    },
  };
}

export function getEmailClient(): EmailClient {
  if (!client) client = buildClient();
  return client;
}
