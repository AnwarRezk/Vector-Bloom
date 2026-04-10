import type { Metadata } from "next";
import "@fontsource/inter/variable.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vector Bloom",
  description:
    "A vibrant, lightweight word2vec visualizer for exploring embeddings and analogy arithmetic.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
