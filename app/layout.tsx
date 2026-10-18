import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://speech-studio-nsda.zeldatf2potato.chatgpt.site";
const siteDescription =
  "Mojo Speech Prep is a free Competitive Speech & Debate speaking practice web app for high school and college students, coaches, teachers, and schools practicing Extemporaneous Speaking and Impromptu Speaking.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Mojo Speech Prep | Competitive Speech & Debate Practice",
    template: "%s | Mojo Speech Prep",
  },
  description: siteDescription,
  applicationName: "Mojo Speech Prep",
  authors: [{ name: "JD Hopper", url: "https://www.jdhopper.org" }],
  creator: "JD Hopper",
  publisher: "JD Hopper",
  category: "Education",
  keywords: [
    "Competitive Speech & Debate",
    "Competitive Speech and Debate practice",
    "speech and debate practice",
    "extemporaneous speaking practice",
    "impromptu speaking practice",
    "high school speech practice",
    "college speech practice",
    "speech team practice tool",
    "debate team practice tool",
    "forensics speech practice",
    "public speaking timer",
    "extemp questions",
    "impromptu topics",
    "speech coach classroom tool",
    "school speech and debate",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Mojo Speech Prep | Competitive Speech & Debate Practice",
    description: siteDescription,
    siteName: "Mojo Speech Prep",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mojo Speech Prep | Competitive Speech & Debate Practice",
    description: siteDescription,
  },
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/mojo-speech-prep-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Topic spinner fonts: Playfair Display for the reel, DM Sans for its buttons. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300..700;1,400&family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap"
        />
      </head>
      <body>
        {/* Sits just above the page's top, so only a phone's pull past the top reveals it. */}
        <div className="overscroll-spinner" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
