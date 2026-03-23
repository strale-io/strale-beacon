import Link from "next/link";
import StraleLogo from "./StraleLogo";

export default function Header() {
  return (
    <header className="w-full border-b border-border">
      <div className="max-w-5xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between">
        <Link href="/">
          <StraleLogo showBeacon />
        </Link>

        <Link
          href="/about"
          className="text-sm font-medium text-text-secondary hover:text-foreground transition-colors"
        >
          About
        </Link>
      </div>
    </header>
  );
}
