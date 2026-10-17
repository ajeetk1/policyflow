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

function SignupForm() {
  const auth = usePolicyAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Your password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);

    try {
      await auth.signup(email.trim(), password, name.trim());
      router.replace(getSafeDestination(searchParams.get("next")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create your account.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link href="/" className="auth-brand">Policy Flow</Link>
        <p className="auth-eyebrow">GET STARTED</p>
        <h1>Create your account</h1>
        <p className="auth-description">
          Create a workspace to upload policies and evaluate decisions.
        </p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="signup-name">Full name</label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            maxLength={255}
            required
          />

          <label htmlFor="signup-email">Email address</label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />

          <label htmlFor="signup-password">Password</label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            maxLength={128}
            required
          />

          {error && <p className="auth-error" role="alert">{error}</p>}

          <button type="submit" disabled={submitting || !auth.loaded}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
        <Link href="/" className="auth-back">← Back to dashboard</Link>
      </section>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="auth-page">Loading…</main>}>
      <SignupForm />
    </Suspense>
  );
}
   
