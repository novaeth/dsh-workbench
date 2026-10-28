import type { MarketClaim } from '@dsh-workbench/shared/contract/protocol/market-index';

export function publishClaimDenyOf(claim: MarketClaim | undefined, name: string): string | undefined {
  if (claim === undefined) return undefined;
  if (claim.state === 'unit-taken') {
    return (
      `市场里 ${claim.entry} 已经用了这个模块 id —— 两个模块不能共用一个，装在一起会撞。` +
      '给这个模块换一个 unit（dsh.workbench.unit）再发。'
    );
  }
  if (claim.state === 'path-taken') {
    return `市场仓库里的产物目录已经被 ${claim.entry} 占了 —— 换一个包名再发。`;
  }
  if (claim.state === 'conflict') {
    return (
      `市场里 ${name} 已经有主了（${claim.owner}）—— 同一个名字不能换人发。` +
      '换一个带团队 scope 的包名；你就是原来的作者（只是换了机器或署名），用 author 参数带上原来的署名；' +
      '确实是接手，让索引维护者改 market/<包名>/ 条目文件里的 owner。'
    );
  }
  return undefined;
}
