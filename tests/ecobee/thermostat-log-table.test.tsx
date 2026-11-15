import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThermostatLogTable } from '@/components/thermostat-log-table';
import { type ThermostatDecisionRecord } from '@/storage/thermostat';

const EMPTY = {
  cribCelsius: null,
  currentCoolCelsius: null,
  currentHeatCelsius: null,
  hallwayCelsius: null,
  mode: null,
  offsetCelsius: null,
  proposedCoolCelsius: null,
  proposedHeatCelsius: null,
};

const DECISIONS: ThermostatDecisionRecord[] = [
  { ...EMPTY, cribCelsius: 20, decidedAt: '2026-11-15T06:20:19.000Z', hallwayCelsius: 20.2, mode: 'auto', offsetCelsius: 1, outcome: 'paused: changed by a person' },
  { ...EMPTY, cribCelsius: 18, decidedAt: '2026-11-15T06:10:19.000Z', mode: 'auto', outcome: 'changed', proposedCoolCelsius: 22.4, proposedHeatCelsius: 19.6 },
  { ...EMPTY, decidedAt: '2026-11-15T06:00:19.000Z', outcome: 'crib reading is stale' },
];

vi.mock('@/app/actions/thermostat', () => ({
  getThermostatDecisionsAction: vi.fn(async () => DECISIONS),
}));

function outcomes() {
  const [, ...bodyRows] = screen.getAllByRole('row');

  return bodyRows.map((row) => within(row).getAllByRole('cell')[1]?.textContent);
}

describe('the thermostat log', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows °F, and a difference in °F for the offset', async () => {
    render(<ThermostatLogTable secretHash="hash" />);

    const [, firstRow] = await screen.findAllByRole('row');
    const cells = within(firstRow as HTMLElement).getAllByRole('cell');

    expect(cells[2]?.textContent).toBe('68.0');
    expect(cells[3]?.textContent).toBe('68.4');
    expect(cells[4]?.textContent).toBe('1.8');
  });

  it('sorts by a column when its heading is tapped, with empty cells last', async () => {
    render(<ThermostatLogTable secretHash="hash" />);
    await screen.findAllByRole('row');

    expect(outcomes()).toEqual(['paused: changed by a person', 'changed', 'crib reading is stale']);

    fireEvent.click(screen.getByRole('button', { name: /Crib °F/u }));
    expect(outcomes()).toEqual(['changed', 'paused: changed by a person', 'crib reading is stale']);

    fireEvent.click(screen.getByRole('button', { name: /Crib °F/u }));
    expect(outcomes()).toEqual(['paused: changed by a person', 'changed', 'crib reading is stale']);
  });

  it('keeps only the rows matching every word of the filter', async () => {
    render(<ThermostatLogTable secretHash="hash" />);
    await screen.findAllByRole('row');

    fireEvent.change(screen.getByLabelText('Filter the log'), { target: { value: 'changed person' } });

    expect(outcomes()).toEqual(['paused: changed by a person']);
  });
});
