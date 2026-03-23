export default function Footer() {
  return (
    <footer className="w-full border-t border-border mt-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <p className="text-sm text-text-secondary text-center">
          Built by the team behind{" "}
          <a
            href="https://strale.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline"
          >
            Strale
          </a>
          {" — the trust layer for the agent economy."}
        </p>
        <p className="text-xs text-text-muted text-center mt-2">
          <a href="mailto:hello@strale.io" className="hover:underline">
            hello@strale.io
          </a>
        </p>
      </div>
    </footer>
  );
}
