"use client";

import { useState } from "react";

interface SubscribeFormProps {
  domain: string;
}

export default function SubscribeForm({ domain }: SubscribeFormProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) return;

    setStatus("submitting");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (response.ok) {
        setStatus("success");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="text-center py-6 px-4 bg-tier-green-light rounded-lg border border-tier-green-border">
        <p className="text-sm font-medium text-tier-green-text">
          We&apos;ll email you when we detect changes to {domain}&apos;s agent-readiness.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-6 px-4 bg-surface rounded-lg border border-border">
      <p className="font-medium text-foreground text-sm">
        Want to know when your score changes?
      </p>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2 max-w-sm mx-auto">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          disabled={status === "submitting"}
          className="flex-1 h-9 px-3 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="h-9 px-4 bg-brand text-white text-sm font-medium rounded-md hover:bg-brand-hover transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {status === "submitting" ? "..." : "Notify me"}
        </button>
      </form>
      {status === "error" && (
        <p className="mt-2 text-xs text-tier-red">Something went wrong. Please try again.</p>
      )}
    </div>
  );
}
