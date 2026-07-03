import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shop Console",
  description: "Local AI harness for auditing and enhancing a Shopify store",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
