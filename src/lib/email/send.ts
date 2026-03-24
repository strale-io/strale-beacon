import { Resend } from "resend";

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  return new Resend(key);
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://scan.strale.io";

interface ScoreChangeEmail {
  to: string;
  domain: string;
  slug: string;
  oldGreenCount: number;
  newGreenCount: number;
  total: number;
  improved: string[];
  declined: string[];
  unsubscribeToken: string;
}

export async function sendScoreChangeEmail({
  to,
  domain,
  slug,
  oldGreenCount,
  newGreenCount,
  total,
  improved,
  declined,
  unsubscribeToken,
}: ScoreChangeEmail): Promise<boolean> {
  const subject = `${domain} agent readiness: ${oldGreenCount}/${total} → ${newGreenCount}/${total}`;

  const lines: string[] = [
    "Your agent readiness score changed.",
    "",
    `Domain: ${domain}`,
    `Previous: ${oldGreenCount}/${total} agent-ready`,
    `Current: ${newGreenCount}/${total} agent-ready`,
    "",
  ];

  if (improved.length > 0) {
    lines.push(`Nice work — ${improved.join(", ")} improved.`);
  }
  if (declined.length > 0) {
    lines.push(`Heads up — ${declined.join(", ")} declined.`);
  }
  if (improved.length > 0 || declined.length > 0) {
    lines.push("");
  }

  lines.push(`See your updated report: ${SITE_URL}/results/${slug}`);
  lines.push("");
  lines.push("—");
  lines.push("Strale Beacon");
  lines.push(`Unsubscribe: ${SITE_URL}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`);

  try {
    const { error } = await getResend().emails.send({
      from: "Strale Beacon <noreply@strale.io>",
      to,
      subject,
      text: lines.join("\n"),
    });

    if (error) {
      console.error(`Failed to send email to ${to}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Failed to send email to ${to}:`, err);
    return false;
  }
}
