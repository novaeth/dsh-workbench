import { useEffect, useState } from 'react';
import type { InstalledPackageInfo } from '@/kernel/contract/market-index';
import { readInstalledInfo } from '@/shared/hooks/market-queries';

interface LoadedInfo {
  readonly pkg: string;
  readonly info: InstalledPackageInfo | null;
}

export function useInstalledInfo(pkg: string | undefined): InstalledPackageInfo | null {
  const key = pkg?.trim() ?? '';
  const [loaded, setLoaded] = useState<LoadedInfo | null>(null);
  useEffect(() => {
    if (key === '') return undefined;
    let live = true;
    void readInstalledInfo(key).then((response) => {
      if (live) setLoaded({ pkg: key, info: response.ok ? response.info : null });
    });
    return () => {
      live = false;
    };
  }, [key]);
  return loaded !== null && loaded.pkg === key ? loaded.info : null;
}
