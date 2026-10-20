import { LightsSection } from '@/components/lights-section';
// import { SnooToggle } from '@/components/snoo-toggle';

export default function LightsPage() {
  return (
    <div className="flex flex-col gap-8 px-6">
      {/* Snoo is unplugged, so the toggle is hidden rather than showing an unreachable warning. */}
      {/* <SnooToggle /> */}

      <LightsSection />
    </div>
  );
}
