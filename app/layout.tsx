import type React from "react"
import type { Metadata } from "next"
// import { Inter, Space_Grotesk } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import "./globals.css"

// const inter = Inter({
//   variable: "--font-inter",
//   subsets: ["latin"],
// })

// const spaceGrotesk = Space_Grotesk({
//   variable: "--font-space-grotesk",
//   subsets: ["latin"],
// })

export const metadata: Metadata = {
  title: "aicorelab.dev - Leading AI Solution Platform | Build AI Apps in 10 Days",
  description:
    "The leading AI solution platform for businesses. Turn your ideas into powerful AI products without tech overwhelm. Expert AI development, deployment, and scaling services.",
  keywords: [
    "AI development",
    "artificial intelligence platform", 
    "AI solution provider",
    "AI app development",
    "machine learning services",
    "AI consulting",
    "AI automation",
    "business AI solutions",
    "AI implementation",
    "AI software development"
  ],
  authors: [{ name: "aicorelab.dev" }],
  creator: "aicorelab.dev",
  publisher: "aicorelab.dev",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://aicorelab.dev'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: "aicorelab.dev - Leading AI Solution Platform",
    description: "The leading AI solution platform for businesses. Expert AI development, deployment, and scaling services.",
    url: 'https://aicorelab.dev',
    siteName: 'aicorelab.dev',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'aicorelab.dev - Leading AI Solution Platform',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: "aicorelab.dev - Leading AI Solution Platform",
    description: "The leading AI solution platform for businesses. Expert AI development, deployment, and scaling services.",
    images: ['/og-image.jpg'],
    creator: '@aicorelab',
  },
  robots: {
    index: true,
    follow: true,
    nocache: true,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: 'your-google-verification-code',
    yandex: 'your-yandex-verification-code',
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "aicorelab.dev",
    "url": "https://aicorelab.dev",
    "logo": "https://aicorelab.dev/logo.png",
    "description": "The leading AI solution platform for businesses. Expert AI development, deployment, and scaling services.",
    "foundingDate": "2024",
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "email": "hello@aicorelab.dev"
    },
    "sameAs": [
      "https://twitter.com/aicorelab",
      "https://linkedin.com/company/aicorelab"
    ],
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "AI Development Services",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "AI Application Development",
            "description": "Custom AI applications built in 10 days or less"
          }
        },
        {
          "@type": "Offer", 
          "itemOffered": {
            "@type": "Service",
            "name": "AI Consulting Services",
            "description": "Strategic AI implementation and consulting"
          }
        }
      ]
    }
  };

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#0B3D2E" />
        <meta name="msapplication-TileColor" content="#0B3D2E" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
      </head>
      <body className="font-sans" style={{fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'}}>
        <Suspense fallback={null}>{children}</Suspense>
        <Analytics />
      </body>
    </html>
  )
}
