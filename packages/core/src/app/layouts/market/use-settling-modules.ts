import { useEffect, useRef, useState } from 'react';
import { MODULE_SETTLE_MS, holdBack } from '../rightbar/market-settle';

const NO_UNITS: ReadonlySet<string> = new Set();

function unitsOf(key: string): string[] {
  return key === '' ? [] : key.split('|');
}

export function useSettlingModules(installedKey: string, rosterKey: string, activeKey: string): ReadonlySet<string> {
  const seenRef = useRef<ReadonlySet<string> | null>(null);
  const [settling, setSettling] = useState<ReadonlySet<string>>(NO_UNITS);

  useEffect(() => {
    const units = unitsOf(installedKey);
    const held = holdBack(units, new Set(unitsOf(rosterKey)), new Set(unitsOf(activeKey)), seenRef.current);
    seenRef.current = new Set(units);
    setSettling(held.length === 0 ? NO_UNITS : new Set(held));
    if (held.length === 0) return;
    const timer = setTimeout(() => setSettling(NO_UNITS), MODULE_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [installedKey, rosterKey, activeKey]);

  return settling;
}
