"use client";

import Link from "next/link";

// The site-wide footer: the tip jar, the founders, and the Privacy and Terms links. Inside the app
// the founders link opens the founders popup; elsewhere (Privacy, Terms) it goes home and opens it there.
export function SiteFooter({ onMeetFounders }: { onMeetFounders?: () => void }) {
  const founders = (
    <>
      <span className="footer-founder-faces" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/founders/jd-hopper-avatar.jpg" alt="" width={48} height={48} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/founders/mona-su-avatar.jpg" alt="" width={48} height={48} />
      </span>
      Meet the founders <span aria-hidden="true">→</span>
    </>
  );
  return (
    <footer className="home-footer">
      <a
        className="home-footer-tip"
        href="https://buymeacoffee.com/speechbrigade"
        target="_blank"
        rel="noreferrer"
        aria-label="Leave a tip to keep Speech Brigade free"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
        </svg>
        Leave a tip
      </a>
      {onMeetFounders ? (
        <button className="home-footer-founders" type="button" onClick={onMeetFounders}>
          {founders}
        </button>
      ) : (
        <Link className="home-footer-founders" href="/#founders">
          {founders}
        </Link>
      )}
      <span className="home-footer-legal">
        <a href="/privacy/">Privacy</a>
        <a href="/terms/">Terms</a>
      </span>
    </footer>
  );
}
