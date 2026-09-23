import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Cocoa Factory · Production', description: 'Record what happens at every station of the chocolate production line' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
