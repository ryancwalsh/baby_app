import { EndlessNoise } from '@/components/endless-noise';

export default function NoisePage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <h1 className="text-foreground/60 text-xl font-semibold text-balance">Laydon&rsquo;s Room</h1>
      <EndlessNoise />
    </div>
  );
}
