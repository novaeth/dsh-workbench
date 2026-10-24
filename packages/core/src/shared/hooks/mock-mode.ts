export function mockModeOn(search: string): boolean {
  return /(?:^|[?&])(?:wbMock|wbMarketMock)=1(?:&|$)/.test(search);
}

export function crashModeOn(search: string): boolean {
  return /(?:^|[?&])wbCrash=1(?:&|$)/.test(search);
}
