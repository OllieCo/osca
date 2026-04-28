import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "ospa — Admin Console",
  description: "Platform operator control plane for ospa",
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  )
}
