export default function Footer() {
  return (
    <footer className="w-full border-t border-border">
      <div className="max-w-[1152px] mx-auto px-8 py-8">
        <p className="text-sm text-text-secondary text-center">
          Built by the team behind{" "}
          <a
            href="https://strale.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline decoration-border-strong underline-offset-2 hover:decoration-foreground transition-colors"
          >
            Strale
          </a>
          {" — the trust layer for the agent economy."}
        </p>
        <p className="text-xs text-text-muted text-center mt-2">
          <a href="mailto:hello@strale.io" className="hover:text-text-secondary transition-colors">
            hello@strale.io
          </a>
        </p>
      </div>
    </footer>
  );
}
