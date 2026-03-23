export default function Footer() {
  return (
    <footer className="w-full">
      <div className="max-w-[1152px] mx-auto px-8 py-5">
        <p className="text-[12px] text-[#B0B0B0] text-center">
          Built by the team behind{" "}
          <a
            href="https://strale.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text-secondary transition-colors"
          >
            Strale
          </a>
          {" — the trust layer for the agent economy. "}
          <a href="mailto:hello@strale.io" className="hover:text-text-secondary transition-colors">
            hello@strale.io
          </a>
        </p>
      </div>
    </footer>
  );
}
