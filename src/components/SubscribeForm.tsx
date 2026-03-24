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
      <p className="text-[14px] text-[#15803D]">
        We&apos;ll email you when we detect changes to {domain}&apos;s agent-readiness.
      </p>
    );
  }

  return (
    <div>
      <h3 className="text-[14px] font-medium text-foreground mb-3">
        Get notified when your score changes
      </h3>
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          disabled={status === "submitting"}
          className="max-w-[300px] flex-1 px-3 py-2 text-[13px] rounded-md border border-[#D1D5DB] bg-white text-foreground placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-foreground/20 focus:border-foreground disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="px-4 py-2 bg-foreground text-background text-[13px] font-medium rounded-md hover:bg-[#374151] transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {status === "submitting" ? "..." : "Notify me"}
        </button>
        {status === "error" && (
          <span className="text-[12px] text-[#B91C1C]">Something went wrong.</span>
        )}
      </form>
    </div>
  );
}
