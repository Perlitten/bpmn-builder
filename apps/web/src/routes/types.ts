export type AppRoute =
  | { name: 'list' }
  | { name: 'editor'; processId: string };
