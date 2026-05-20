import ConfirmationScreen from '@/components/confirmation-screen';

export const dynamic = 'force-dynamic';

export default function ThanksPage({
  searchParams,
}: {
  searchParams: { company?: string; email?: string };
}) {
  return (
    <ConfirmationScreen company={searchParams.company} email={searchParams.email} />
  );
}
