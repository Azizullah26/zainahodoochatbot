import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/components/auth-provider'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: 'ELRACE Odoo ERP Assistant - AI-Powered Business Intelligence',
  description: 'ELRACE Odoo Assistant is an AI-powered chatbot that helps you query and analyze Odoo ERP data. Get instant insights on projects, employees, tasks, leave requests, expenses, and more. Streamline your business operations with intelligent conversation-based data access.',
  keywords: 'Odoo ERP, AI Assistant, Chatbot, Business Intelligence, ELRACE, Project Management, Employee Data',
  authors: [{ name: 'ELRACE' }],
  creator: 'ELRACE',
  publisher: 'ELRACE',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://elrace.com',
    title: 'ELRACE Odoo ERP Assistant',
    description: 'AI-powered chatbot for intelligent Odoo ERP data querying and analysis',
    siteName: 'ELRACE',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
