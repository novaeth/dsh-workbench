export type OriginRead =
  | { readonly kind: 'ok'; readonly remote: string }
  | { readonly kind: 'no-origin'; readonly detail?: string }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string };

export type BranchRead =
  | { readonly kind: 'ok'; readonly branch: string }
  | { readonly kind: 'no-branch'; readonly detail?: string | undefined }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string | undefined };

export type HeadRead =
  | { readonly kind: 'ok'; readonly commit: string }
  | { readonly kind: 'no-head'; readonly detail?: string }
  | { readonly kind: 'unknown'; readonly reason: string; readonly detail?: string };

export interface GitReader {
  origin(path: string): Promise<OriginRead>;
  branch(path: string): Promise<BranchRead>;
  head(path: string): Promise<HeadRead>;
}
