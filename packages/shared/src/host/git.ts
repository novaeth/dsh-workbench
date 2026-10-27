
export type {
  BranchRead,
  HeadRead,
  OriginRead,
} from '../contract/git.js';
import type { BranchRead, HeadRead, OriginRead } from '../contract/git.js';

export type OriginReader = (path: string) => Promise<OriginRead>;

export type BranchReader = (path: string) => Promise<BranchRead>;

export type HeadReader = (path: string) => Promise<HeadRead>;
