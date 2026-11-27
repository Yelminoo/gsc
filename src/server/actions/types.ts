export type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Echoed back on error so React 19's automatic form reset does not wipe what the user typed. Never includes passwords. */
  values?: Record<string, string>;
};
