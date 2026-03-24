export default function Footer() {
  return (
    <footer className="w-full">
      <div className="max-w-[880px] mx-auto px-8 pb-8">
        <div className="flex items-center justify-between text-[13px] text-[#B0B0B0]">
          <p>
            Built by{" "}
            <a
              href="https://strale.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-[#9CA3AF] transition-colors"
            >
              Strale
            </a>
            {" — trust and quality infrastructure for AI agents."}
          </p>
          <a
            href="mailto:hello@strale.io"
            className="hover:text-[#9CA3AF] transition-colors"
          >
            hello@strale.io
          </a>
        </div>
      </div>
    </footer>
  );
}
