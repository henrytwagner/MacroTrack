import type { ScaleReading } from './types';

export function gramsToOz(g: number): number {
  return Math.round((g / 28.3495) * 100) / 100;
}

function formatGrams(g: number): string {
  return `${g.toFixed(1)} g`;
}

export function startSimulation(onReading: (reading: ScaleReading) => void): () => void {
  const TARGET = 245;
  const TICKS = 15;
  const TICK_MS = 100;
  const stabilizeThreshold = 1;

  let tick = 0;
  const history: number[] = [];
  let timerId: ReturnType<typeof setTimeout> | null = null;

  function isStable(vals: number[]): boolean {
    if (vals.length < 3) return false;
    const last3 = vals.slice(-3);
    const min = Math.min(...last3);
    const max = Math.max(...last3);
    return max - min <= stabilizeThreshold;
  }

  function schedule() {
    timerId = setTimeout(() => {
      tick++;
      const progress = Math.min(tick / TICKS, 1);
      const noise = (Math.random() - 0.5) * 4;
      const raw = TARGET * progress + noise;
      const value = Math.max(0, Math.round(raw * 10) / 10);
      history.push(value);

      const stable = progress >= 1 && isStable(history);

      onReading({
        value,
        unit: 'g',
        display: formatGrams(value),
        stable,
        rawHex: 'FE EF C0 A2 -- -- 00 00 -- -- -- --  [simulated]',
      });

      if (tick < TICKS + 5) {
        schedule();
      }
    }, TICK_MS);
  }

  schedule();

  return () => {
    if (timerId != null) clearTimeout(timerId);
  };
}

export function startRemoveSimulation(
  currentValue: number,
  onReading: (reading: ScaleReading) => void,
  onDone: () => void,
): () => void {
  const TICKS = 8;
  const TICK_MS = 100;
  let tick = 0;
  let timerId: ReturnType<typeof setTimeout> | null = null;

  function schedule() {
    timerId = setTimeout(() => {
      tick++;
      const progress = tick / TICKS;
      const value = Math.max(0, Math.round(currentValue * (1 - progress) * 10) / 10);

      onReading({
        value,
        unit: 'g',
        display: formatGrams(value),
        stable: value === 0,
        rawHex: 'FE EF C0 A2 -- -- 00 00 -- -- -- --  [simulated]',
      });

      if (tick < TICKS) {
        schedule();
      } else {
        onDone();
      }
    }, TICK_MS);
  }

  schedule();

  return () => {
    if (timerId != null) clearTimeout(timerId);
  };
}
