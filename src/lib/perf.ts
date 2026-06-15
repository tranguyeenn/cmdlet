const SLOW_MS = 50;

function now(): number {
  return performance.now();
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

export function markPerf(label: string): () => number {
  const start = now();
  return () => {
    const elapsed = now() - start;
    const message = `[perf] ${label} ${formatMs(elapsed)}`;
    if (elapsed >= SLOW_MS) {
      console.warn(message);
    } else {
      console.debug(message);
    }
    return elapsed;
  };
}

export async function timeAsync<T>(label: string, work: () => Promise<T>): Promise<T> {
  const end = markPerf(label);
  try {
    return await work();
  } finally {
    end();
  }
}

export function timeSync<T>(label: string, work: () => T): T {
  const end = markPerf(label);
  try {
    return work();
  } finally {
    end();
  }
}
