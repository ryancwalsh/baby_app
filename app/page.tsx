import { LightsSection } from '@/components/lights-section';
import { SnooToggle } from '@/components/snoo-toggle';
import { VersionFooter } from '@/components/version-footer';
import { getEnvironment } from '@/constants/environment';

export default function LightsPage() {
  const { APP_TITLE } = getEnvironment();

  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <div className="-mb-4 flex items-center gap-3">
        <h1 className="text-moon flex-1 text-xl font-semibold text-balance">{APP_TITLE}</h1>
        <SnooToggle />
      </div>

      <LightsSection />
      <VersionFooter />
    </div>
  );
}
