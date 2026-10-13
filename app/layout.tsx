import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = {
  title: 'PinPilot AI — Pinterest Automation',
  description: 'A private workspace for Pinterest research, original Pin creative, automated scheduling and performance analytics.',
  icons: { icon: '/logo-mark.png', apple: '/logo-mark.png' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
