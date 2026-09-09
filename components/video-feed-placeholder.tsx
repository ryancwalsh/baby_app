import { VideoIcon } from 'lucide-react';

/**
 * Stands in for the live camera feed until there is one. Kept dim for the same
 * reason the rest of the page is: this is looked at in an unlit room.
 */
export function VideoFeedPlaceholder() {
  return (
    <div className="border-foreground/10 flex aspect-video flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
      <VideoIcon aria-hidden className="text-foreground/30 size-8" />
      <p className="text-foreground/40 text-sm">Live video feed coming soon</p>
    </div>
  );
}
