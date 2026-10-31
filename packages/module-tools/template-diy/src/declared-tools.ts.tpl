export const DECLARED_TOOLS = {
  run: { name: '__UNIT___run', writes: false },
  addNote: { name: '__UNIT___add_note', writes: true },
} as const;

export type DeclaredToolKey = keyof typeof DECLARED_TOOLS;
