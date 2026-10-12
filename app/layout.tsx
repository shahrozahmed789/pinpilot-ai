import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: 'PinPilot AI', description: 'Your Pinterest research and publishing workspace' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
