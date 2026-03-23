import Link from "next/link";
import StraleLogo from "./StraleLogo";

export default function Header() {
  return (
    <header className="w-full">
      <div className="max-w-[1152px] mx-auto px-8 h-20 flex items-center justify-between">
        <Link href="/">
          <StraleLogo showBeacon />
        </Link>

        <Link
          href="/about"
          className="text-[14px] font-medium text-text-secondary hover:text-foreground transition-colors"
        >
          About
        </Link>
      </div>
    </header>
  );
}
