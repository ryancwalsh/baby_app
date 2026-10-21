import { type SleepPrediction } from '@/components/sleep-predictions';
import { formatAgo, formatShortClockTime } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';

/**
 * The next sleep on a 2-nap day beside the next sleep on a 3-nap day, headed by just the nap count.
 */
export function SleepPredictionTable({ now, predictions }: { readonly now: number; readonly predictions: SleepPrediction[] }) {
  const { is24Hour } = useClockFormat();

  return predictions.length > 0 ? (
    <table className="text-foreground/70 border-foreground/20 w-full table-fixed border-collapse border tabular-nums text-base">
      <thead>
        <tr>
          {predictions.map((prediction) => (
            <th className="border-foreground/20 border px-2 py-1 font-normal" key={prediction.napCount}>
              {prediction.napCount}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {predictions.map((prediction) => (
            <td className="border-foreground/20 border px-2 py-1 text-center" key={prediction.napCount}>
              {formatShortClockTime(prediction.time, is24Hour)} ({formatAgo(now - prediction.time)})
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  ) : null;
}
