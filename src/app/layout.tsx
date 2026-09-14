import './globals.css';
import './system.css';
import './production-list.css';
export const metadata = { title: 'Cocoa · Production', description: 'Chocolate factory production screen prototype' };
export default function Layout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html> }
