import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "../SiteFooter";

// Shared frame for the Privacy Policy and Terms of Service pages.
export function LegalPage({
  title,
  subtitle,
  updated,
  children,
}: {
  title: string;
  subtitle: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <Link className="legal-back" href="/">
        ← Back to Speech Brigade
      </Link>
      <header className="legal-header">
        <h1>{title}</h1>
        <p className="legal-subtitle">{subtitle}</p>
        <p className="legal-updated">Last updated: {updated}</p>
      </header>
      <div className="legal-body">{children}</div>
      <SiteFooter />
    </main>
  );
}

export const CONTACT_EMAIL = "speechbrigade@gmail.com";
export const LEGAL_UPDATED = "October 16, 2026";
