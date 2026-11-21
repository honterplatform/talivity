import LandingScreen from '@/components/landing-screen';
import { availablePlatforms, PLATFORM_LABELS } from '@/lib/llm-clients';
import { QUERIES_PER_PLATFORM } from '@/lib/query-templates';

// Rendered per request so the "N candidate queries · N models" copy reflects
// the providers that are actually configured and healthy right now.
export const dynamic = 'force-dynamic';

export default function Page() {
  const platforms = availablePlatforms().map((p) => PLATFORM_LABELS[p]);
  return <LandingScreen platforms={platforms} queriesPerPlatform={QUERIES_PER_PLATFORM} />;
}
