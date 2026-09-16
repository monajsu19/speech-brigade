import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Speech Brigade",
  description:
    "A polished NSDA speaking practice app for Impromptu and Extemporaneous rounds.",
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
