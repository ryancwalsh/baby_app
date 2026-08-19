import { EndlessNoise } from '@/components/endless-noise';

export default function NoisePage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <EndlessNoise />
    </div>
  );
}
