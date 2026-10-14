import type { ReactNode } from 'react';
import './globals.css';
import { InstallSupport } from '@/components/InstallSupport';
import { Shell } from '@/components/Shell';
import { StoreProvider } from '@/lib/store';
import { brand } from '@/lib/brand';

export const metadata = {
  title: `${brand.name} · Production`,
  description: 'Record what happens at every station of the chocolate production line',
  // Installed on an iPhone or iPad: the name under the icon and a light status bar
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'default' as const },
};

export const viewport = { themeColor: '#ffffff' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <InstallSupport />
        <StoreProvider>
          <Shell>{children}</Shell>
        </StoreProvider>
      </body>
    </html>
  );
}
