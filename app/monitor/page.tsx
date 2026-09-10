import { MonitorSection } from '@/components/monitor-section';
import { getEnvironment } from '@/constants/environment';

export default function MonitorPage() {
  const { APP_TITLE } = getEnvironment();

  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <div className="-mb-4 flex items-center gap-3">
        <h1 className="text-moon flex-1 text-xl font-semibold text-balance">{APP_TITLE}</h1>
      </div>

      <MonitorSection />
    </div>
  );
}
