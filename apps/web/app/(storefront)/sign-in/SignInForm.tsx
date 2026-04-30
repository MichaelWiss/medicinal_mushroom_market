'use client';

// Magic-link request form. Calls supabase.auth.signInWithOtp with the
// PKCE-friendly emailRedirectTo pointing at our /auth/callback route. The
// callback exchanges the returned code for a cookie session.

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

type Status = 'idle' | 'sending' | 'sent' | 'error';

export function SignInForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    setStatus('sending');
    setError(null);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      next,
    )}`;

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo,
        // Don't auto-create accounts from the storefront sign-in box;
        // company-admin invites are the only path to a new account.
        shouldCreateUser: false,
      },
    });

    if (err) {
      setStatus('error');
      setError(err.message);
      return;
    }
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div
        className="border-dot p-8 text-[13px] leading-[1.6] text-ink2"
        role="status"
        aria-live="polite"
      >
        <div className="font-serif text-[22px] italic text-ink">
          Check your inbox
        </div>
        <p className="mt-3">
          We sent a magic link to <span className="text-ink">{email}</span>.
          Open it on this device to sign in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border-dot p-8" noValidate>
      <label
        htmlFor="email"
        className="block text-[9px] uppercase tracking-wider4 text-ink3"
      >
        Work email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="buyer@company.com"
        className="mt-3 w-full border-b-[3px] border-dotted border-[color:var(--dot)] bg-transparent py-2 font-serif text-[20px] italic text-ink outline-none placeholder:text-ink3"
        // Password-manager extensions inject inline `style` attributes
        // (background-image icons) onto credential inputs after SSR,
        // which trips React's hydration check. Suppress here only.
        suppressHydrationWarning
      />
      <button
        type="submit"
        disabled={status === 'sending'}
        className="mt-6 inline-flex items-center gap-2 border-[3px] border-dotted border-[color:var(--dot)] px-5 py-2 font-sans text-[10px] font-medium uppercase tracking-wider3 text-ink2 transition-colors hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'sending' ? 'Sending…' : 'Send magic link'}
      </button>
      {error ? (
        <p
          className="mt-4 text-[12px] text-[color:var(--yellow)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <p className="mt-6 text-[11px] leading-[1.6] text-ink3">
        Mycelium is invitation-only. If your company has an account, your
        admin can invite you from the operations console.
      </p>
    </form>
  );
}
