import type { ReactNode } from 'react';
import './globals.css';
import { Shell } from '@/components/Shell';
import { StoreProvider } from '@/lib/store';

export const metadata = { title: 'Cocoa Factory · Production', description: 'Record what happens at every station of the chocolate production line' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
