interface ApprovalCopy {
  readonly zh: string;
  readonly en: string;
}

export function copiesOf(label: string, labelEn: string): Record<string, ApprovalCopy> {
  return {
    team: {
      zh: `把${label}发到团队源，只发构建产物，不发源码，允许吗？`,
      en: `Publish ${labelEn} to the team registry; only built artifacts, never the source. Allow?`,
    },
    public: {
      zh: `把${label}公开发到 npm，任何人都能安装，允许吗？`,
      en: `Publish ${labelEn} publicly to npm; anyone can install it. Allow?`,
    },
    tarball: {
      zh: `给${label}打一个安装包，只写本机不发源码，允许吗？`,
      en: `Pack ${labelEn} into a local tarball; nothing leaves this machine. Allow?`,
    },
    git: {
      zh: `把${label}提交并推到 git，源码也会一起推送，允许吗？`,
      en: `Commit and push ${labelEn} to git; the source is pushed too. Allow?`,
    },
    market: {
      zh: `把${label}发到市场仓库，产物与索引一起提交，允许吗？`,
      en: `Publish ${labelEn} to the market repository; artifacts and the index are committed together. Allow?`,
    },
    local: {
      zh: `把${label}留在本机，不发，允许吗？`,
      en: `Keep ${labelEn} local and publish nothing. Allow?`,
    },
  };
}
