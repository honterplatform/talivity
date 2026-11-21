import type { Metadata } from 'next';
import ConfirmationScreen from '@/components/confirmation-screen';
import { findAuditByKey, maskEmail } from '@/lib/audit-lookup';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Request received · Talivity',
  robots: { index: false, follow: false },
};

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ audit?: string }>;
}) {
  const sp = await searchParams;
  // Company comes only from a real audit — never from free text in the URL,
  // which anyone could use to put their own words inside our branded copy.
  let company: string | undefined;
  let maskedEmail: string | null = null;

  if (typeof sp.audit === 'string') {
    const audit = await findAuditByKey(sp.audit).catch(() => null);
    if (audit) {
      company = audit.companyName;
      // Masked: anyone holding the report link can open this page.
      maskedEmail = maskEmail(audit.email);
    }
  }

  return (
    <ConfirmationScreen
      company={company}
      maskedEmail={maskedEmail}
      auditId={typeof sp.audit === 'string' ? sp.audit : undefined}
      bookingUrl={process.env.NEXT_PUBLIC_BOOKING_URL?.trim() || 'https://talivity.com/contact'}
    />
  );
}
