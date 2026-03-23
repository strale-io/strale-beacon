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
      setStatus(response.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <p className="text-sm text-center text-tier-green-text">
        We&apos;ll email you when we detect changes to {domain}&apos;s agent-readiness.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center justify-center gap-2 flex-wrap">
      <span className="text-sm text-text-secondary">Get notified when your score changes:</span>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        required
        disabled={status === "submitting"}
        className="h-8 px-3 text-sm rounded-[4px] border border-border-strong bg-background text-foreground placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground disabled:opacity-50 w-48"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="h-8 px-3 bg-foreground text-background text-sm font-medium rounded-[4px] hover:bg-interactive-hover transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {status === "submitting" ? "..." : "Notify me"}
      </button>
      {status === "error" && (
        <span className="text-xs text-tier-red">Something went wrong.</span>
      )}
    </form>
  );
}
