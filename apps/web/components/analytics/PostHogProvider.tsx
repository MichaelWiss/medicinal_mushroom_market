'use client';

// Browser PostHog provider (Cell 7.1).
//
// Mounted once at the root layout. When `NEXT_PUBLIC_POSTHOG_KEY` is
// unset (local dev without a project) the provider becomes a no-op
// pass-through. Otherwise it bootstraps `posthog-js` exactly once and
// re-identifies the visitor whenever Supabase auth state changes.
//
// We deliberately do NOT enable autocapture for now — this is a B2B
// app where event taxonomy is curated; autocapture would flood PostHog
// with noisy clicks. Page-view capture stays on so funnels work out
// of the box.

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { createClient } from '@/lib/supabase/browser';

let initialised = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    if (!initialised) {
      posthog.init(key, {
        api_host:
          process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        capture_pageview: true,
        capture_pageleave: true,
        autocapture: false,
        person_profiles: 'identified_only',
        // First-party reverse proxy can be wired here later; for now
        // the SDK talks to the EU ingest endpoint directly.
      });
      initialised = true;
    }

    // Sync identification with Supabase auth. Anonymous visitors keep
    // PostHog's auto-generated distinct_id; authenticated buyers are
    // re-identified to their `auth.users.id` so server captures
    // deduplicate against browser captures.
    const supabase = createClient();
    let cancelled = false;

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) {
        posthog.identify(user.id, {
          email: user.email ?? undefined,
        });
      } else {
        posthog.reset();
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        posthog.identify(session.user.id, {
          email: session.user.email ?? undefined,
        });
      } else if (event === 'SIGNED_OUT') {
        posthog.reset();
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
