import { Room } from '@/components/room';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <h1 className="text-foreground/60 text-3xl font-semibold text-balance">Laydon&rsquo;s Room</h1>
      <Room />
    </div>
  );
}
