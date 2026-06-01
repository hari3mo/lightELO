import { useEffect, useState } from 'react';

// Loading animation for the Elo prediction cards: digits scramble through
// random rating values while the model runs, then the parent swaps in the
// real prediction. `onDark` = true when placed on the dark (Black) card.
export function ScramblingDigits({ onDark }: { onDark?: boolean }) {
  const [n, setN] = useState(1500);
  useEffect(() => {
    const id = setInterval(() => setN(800 + Math.floor(Math.random() * 2000)), 55);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className={`font-mono font-bold text-lg tabular-nums tracking-wider animate-pulse ${
        onDark ? 'text-zinc-500' : 'text-zinc-400 dark:text-zinc-500'
      }`}
    >
      {n}
    </span>
  );
}
