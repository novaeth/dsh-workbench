export interface GateDeadline {
  disarm(): void;
}

export function createGateDeadline(giveUpMs: number, expire: () => void): GateDeadline {
  const timer = setTimeout(expire, giveUpMs);
  return {
    disarm() {
      clearTimeout(timer);
    },
  };
}
