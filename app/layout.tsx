import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://speech-studio-nsda.zeldatf2potato.chatgpt.site";
const siteDescription =
  "Speech Brigade is a free National Speech & Debate Association speaking practice web app for high school and college students, coaches, teachers, and schools practicing Extemporaneous Speaking and Impromptu Speaking.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Speech Brigade | National Speech & Debate Association Practice",
    template: "%s | Speech Brigade",
  },
  description: siteDescription,
  applicationName: "Speech Brigade",
  authors: [{ name: "JD Hopper", url: "https://www.jdhopper.org" }],
  creator: "JD Hopper",
  publisher: "JD Hopper",
  category: "Education",
  keywords: [
    "National Speech & Debate Association",
    "National Speech and Debate Association practice",
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
    title: "Speech Brigade | National Speech & Debate Association Practice",
    description: siteDescription,
    siteName: "Speech Brigade",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Speech Brigade | National Speech & Debate Association Practice",
    description: siteDescription,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
