import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://protocolos-webmcp.christian-lopez-1.chatgpt.site'),
  title: 'ProtocolOS — Agent-ready workflow operations',
  description: 'A synthetic subject workflow workspace built for people and their agents.',
  openGraph: {
    title: 'ProtocolOS — Agent-ready workflow operations',
    description: 'Structured workflows, ready for people and agents.',
    type: 'website',
    images: [{ url: '/protocolos-logo.png', width: 1536, height: 1024, alt: 'ProtocolOS platform logo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ProtocolOS — Agent-ready workflow operations',
    description: 'Structured workflows, ready for people and agents.',
    images: ['/protocolos-logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
