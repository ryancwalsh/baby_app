import { getLampsAction } from "@/app/actions/lamp";
import { LampToggle } from "@/components/lamp-toggle";
import { NightLight } from "@/components/night-light";

/** The plugs report live state, so never serve a cached view of them. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const lamps = await getLampsAction();

  return (
    <div className="flex flex-col gap-8 px-6 py-10">
      <h1 className="text-foreground/60 text-3xl font-semibold text-balance">
        Laydon&rsquo;s Room
      </h1>
      <div className="flex flex-col gap-3">
        {lamps.map((lamp) => (
          <LampToggle key={lamp.deviceId} lamp={lamp} />
        ))}
      </div>
      <NightLight />
    </div>
  );
}
