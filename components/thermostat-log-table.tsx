'use client';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { getThermostatDecisionsAction } from '@/app/actions/thermostat';
import { formatClockTime, formatDate } from '@/components/tracking-format';
import { useClockFormat } from '@/hooks/use-clock-format';
import { useDateFormat } from '@/hooks/use-date-format';
import { type ThermostatDecisionRecord } from '@/storage/thermostat';

/**
 * How far back the log looks. A decision is logged every 10 minutes, so a week is about a thousand rows.
 */
const PERIODS = [
  { days: 1, label: 'Last day' },
  { days: 7, label: 'Last week' },
  { days: 30, label: 'Last 30 days' },
  { days: null, label: 'Everything' },
] as const;
const DEFAULT_PERIOD_INDEX = 1;

function toFahrenheit(celsius: null | number) {
  return celsius === null ? null : (celsius * 9) / 5 + 32;
}

/**
 * The offset is a difference between two temperatures, so it is scaled without the 32.
 */
function toFahrenheitDifference(celsius: null | number) {
  return celsius === null ? null : (celsius * 9) / 5;
}

type Column = {
  isNumeric: boolean;
  key: string;
  label: string;
  /**
   * What the column sorts on: the stored UTC time for the date, which orders as text, and °F for the temperatures.
   */
  value: (decision: ThermostatDecisionRecord) => null | number | string;
};

const COLUMNS: Column[] = [
  { isNumeric: false, key: 'decidedAt', label: 'When', value: (decision) => decision.decidedAt },
  { isNumeric: false, key: 'outcome', label: 'Outcome', value: (decision) => decision.outcome },
  { isNumeric: true, key: 'crib', label: 'Crib °F', value: (decision) => toFahrenheit(decision.cribCelsius) },
  { isNumeric: true, key: 'hallway', label: 'Hallway °F', value: (decision) => toFahrenheit(decision.hallwayCelsius) },
  { isNumeric: true, key: 'offset', label: 'Offset °F', value: (decision) => toFahrenheitDifference(decision.offsetCelsius) },
  { isNumeric: false, key: 'mode', label: 'Mode', value: (decision) => decision.mode },
  { isNumeric: true, key: 'currentHeat', label: 'Heat now °F', value: (decision) => toFahrenheit(decision.currentHeatCelsius) },
  { isNumeric: true, key: 'currentCool', label: 'Cool now °F', value: (decision) => toFahrenheit(decision.currentCoolCelsius) },
  { isNumeric: true, key: 'proposedHeat', label: 'Heat proposed °F', value: (decision) => toFahrenheit(decision.proposedHeatCelsius) },
  { isNumeric: true, key: 'proposedCool', label: 'Cool proposed °F', value: (decision) => toFahrenheit(decision.proposedCoolCelsius) },
];

/**
 * Empty cells go last whichever way the column is sorted, so they never crowd the top.
 */
function compare(first: null | number | string, second: null | number | string, direction: number) {
  let result = 0;
  if (first === null && second !== null) {
    result = 1;
  } else if (first !== null && second === null) {
    result = -1;
  } else if (typeof first === 'number' && typeof second === 'number') {
    result = (first - second) * direction;
  } else if (first !== null && second !== null) {
    result = String(first).localeCompare(String(second)) * direction;
  }

  return result;
}

/**
 * The worker's thermostat decisions as a table, in the phone's own time and in °F, sortable by any column and filtered by a search across every cell.
 */
export function ThermostatLogTable({ secretHash }: { readonly secretHash: string }) {
  const [decisions, setDecisions] = useState<null | ThermostatDecisionRecord[]>(null);
  const [error, setError] = useState<null | string>(null);
  const [periodIndex, setPeriodIndex] = useState(DEFAULT_PERIOD_INDEX);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ direction: -1, key: 'decidedAt' });
  const { is24Hour } = useClockFormat();
  const { dateFormat } = useDateFormat();

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      try {
        const loaded = await getThermostatDecisionsAction(secretHash, PERIODS[periodIndex]?.days ?? null);
        if (isCurrent) {
          setDecisions(loaded);
          setError(null);
        }
      } catch (caughtError) {
        if (isCurrent) {
          setError(caughtError instanceof Error ? caughtError.message : 'Could not load the log.');
        }
      }
    }

    setDecisions(null);
    load();

    return () => {
      isCurrent = false;
    };
  }, [periodIndex, secretHash]);

  function display(column: Column, decision: ThermostatDecisionRecord) {
    const value = column.value(decision);
    let shown = '';
    if (column.key === 'decidedAt') {
      shown = `${formatDate(new Date(decision.decidedAt).getTime(), dateFormat)} ${formatClockTime(decision.decidedAt, is24Hour)}`;
    } else if (typeof value === 'number') {
      shown = value.toFixed(1);
    } else if (value !== null) {
      shown = value;
    }

    return shown;
  }

  function toggleSort(key: string) {
    setSort((current) => (current.key === key ? { direction: -current.direction, key } : { direction: 1, key }));
  }

  const searchWords = search.toLowerCase().split(/\s+/u).filter(Boolean);
  const sortColumn = COLUMNS.find((column) => column.key === sort.key) ?? COLUMNS[0];
  const rows = (decisions ?? [])
    .map((decision) => ({ cells: COLUMNS.map((column) => display(column, decision)), decision }))
    .filter(({ cells }) => {
      const text = cells.join(' ').toLowerCase();

      return searchWords.every((word) => text.includes(word));
    })
    .toSorted((first, second) => (sortColumn === undefined ? 0 : compare(sortColumn.value(first.decision), sortColumn.value(second.decision), sort.direction)));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Filter the log"
          className="border-foreground/20 bg-background min-w-0 flex-1 rounded-lg border px-3 py-2"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter, e.g. paused"
          type="search"
          value={search}
        />
        <select
          aria-label="How far back"
          className="border-foreground/20 bg-background rounded-lg border px-3 py-2"
          onChange={(event) => setPeriodIndex(Number(event.target.value))}
          value={periodIndex}
        >
          {PERIODS.map((period, index) => (
            <option key={period.label} value={index}>
              {period.label}
            </option>
          ))}
        </select>
      </div>
      {decisions === null ? (
        <p className="text-muted text-sm">{error ?? 'Loading…'}</p>
      ) : (
        <>
          <p className="text-muted text-xs">
            {rows.length} of {decisions.length} decisions. Tap a heading to sort.
          </p>
          <div className="border-foreground/20 max-h-[70dvh] overflow-auto rounded-lg border">
            <table className="w-full border-collapse text-xs tabular-nums">
              <thead className="bg-background sticky top-0">
                <tr>
                  {COLUMNS.map((column) => (
                    <th
                      aria-sort={sort.key === column.key ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined}
                      className={`border-foreground/20 text-muted border-b px-2 py-1 font-normal ${column.isNumeric ? 'text-right' : 'text-left'}`}
                      key={column.key}
                      scope="col"
                    >
                      <button className="inline-flex items-center gap-1" onClick={() => toggleSort(column.key)} type="button">
                        {column.label}
                        {sort.key === column.key && (sort.direction === 1 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ cells, decision }) => (
                  <tr className="border-foreground/10 border-b last:border-b-0" key={decision.decidedAt}>
                    {cells.map((cell, index) => (
                      <td className={`px-2 py-1 whitespace-nowrap ${COLUMNS[index]?.isNumeric === true ? 'text-right' : 'text-left'}`} key={COLUMNS[index]?.key}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
