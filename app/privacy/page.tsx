import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy | PinPilot AI',
  description: 'How PinPilot AI handles account authorization, Pinterest data, generated assets and analytics.',
};

export default function PrivacyPage() {
  return (
    <main className="privacyShell">
      <header className="privacyTop">
        <Link href="/" className="privacyBrand" aria-label="PinPilot AI home">
          <img src="/logo-full.png" alt="PinPilot AI" />
        </Link>
        <span className="privacyPill">Personal-use application</span>
      </header>
      <article className="privacyCard">
        <p className="privacyEyebrow">PINPILOT AI · PRIVACY</p>
        <h1>Privacy Policy</h1>
        <p className="privacyUpdated"><strong>Last updated: October 13, 2026</strong></p>
        <p>This policy describes how PinPilot AI handles information when its owner uses the app to manage their own Pinterest account. PinPilot AI is a private personal-use project under development.</p>
        <h2>Information we access</h2>
        <p>If the owner authorizes Pinterest, the app may access account information, Pins, boards and analytics allowed by the granted OAuth scopes. The app also processes settings the owner enters, such as a niche, target audience, destination URL, generated titles and descriptions, image URLs, scheduled posts and publishing status.</p>
        <h2>How information is used</h2>
        <p>Information is used to prepare original Pin drafts, schedule and publish Pins when the required access is granted, and display available account results. The app does not sell personal information and does not ask the owner for their Pinterest password.</p>
        <h2>Authorization and security</h2>
        <p>Pinterest authorization is handled through OAuth. In the deployed application, access tokens are intended to be stored server-side with encryption and access controls. Secret keys must remain in server-side environment variables and must not be exposed to the browser. No online service can guarantee absolute security.</p>
        <h2>Service providers and sharing</h2>
        <p>Information is sent to Pinterest when necessary to carry out actions requested by the owner. The app may also rely on hosting, database and file-storage providers configured by the owner. Optional AI providers must be reviewed and disclosed before being enabled. We do not sell information to advertisers.</p>
        <h2>Retention, deletion and revocation</h2>
        <p>Application settings, generated assets, job history and analytics snapshots may be stored for the app to function. The owner can stop automation, disconnect the app and revoke access through Pinterest settings. Database records and stored assets may need to be deleted separately from Pinterest authorization.</p>
        <h2>Children</h2>
        <p>This application is not designed for children under 13 and is not intended to knowingly collect children’s information.</p>
        <h2>Contact and updates</h2>
        <p>This policy may change as the application develops. For privacy questions or deletion requests, contact the application operator using the genuine email address published by the owner.</p>
        <div className="privacyActionNote"><strong>Owner setup required before app review:</strong> Publish a genuine contact email and make sure this policy accurately reflects the actual services, storage and data flows enabled on the deployed site.</div>
        <Link href="/" className="privacyBack">← Back to PinPilot AI</Link>
      </article>
      <footer className="privacyFooter"><img src="/logo-mark.png" alt="" /> <span>PinPilot AI · Private Pinterest workflow</span></footer>
    </main>
  );
}
