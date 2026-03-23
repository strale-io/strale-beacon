import Link from "next/link";

export default function Header() {
  return (
    <header className="w-full border-b border-border">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-foreground tracking-tight">Strale</span>
          <span className="text-lg font-medium text-brand tracking-tight">Beacon</span>
        </Link>

        <a
          href="https://strale.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-text-secondary hover:text-foreground transition-colors"
        >
          strale.dev
        </a>
      </div>
    </header>
  );
}
