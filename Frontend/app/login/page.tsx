"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { usePolicyAuth } from "../../components/AuthProvider";

function getSafeDestination(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/?page=Policies";
  }
  return value;
}

function LoginForm() {
  const auth = usePolicyAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await auth.login(email.trim(), password);
      router.replace(getSafeDestination(searchParams.get("next")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="auth-brand">Policy Flow</Link>
        <p className="auth-eyebrow">WELCOME BACK</p>
        <h1>Sign in to your workspace</h1>
        <p className="auth-description">
          Access your policies, review extracted rules, and manage decisions.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
            required
          />

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" disabled={submitting || !auth.loaded}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        
        <p className="auth-switch">
          Don't have an account? <Link href="/signup">Create one</Link>
        </p>
        <Link href="/" className="auth-back">← Back to dashboard</Link>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-page">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}

