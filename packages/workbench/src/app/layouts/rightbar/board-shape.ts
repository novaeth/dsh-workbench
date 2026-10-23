export type BoardShape =
  | { readonly kind: 'real' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'unread' }
  | { readonly kind: 'kit' }
  | { readonly kind: 'all' }
  | { readonly kind: 'copies'; readonly count: number };
