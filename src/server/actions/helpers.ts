import "server-only";
import { z } from "zod";
import { DomainError } from "@/server/services/errors";
import type { ActionState } from "./types";

/** Read a FormData into a plain object of strings (files are ignored). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function parseForm<S extends z.ZodType>(schema: S, fd: FormData):
  | { ok: true; data: z.output<S> }
  | { ok: false; state: ActionState } {
  const res = schema.safeParse(formObject(fd));
  if (res.success) return { ok: true, data: res.data };
  return { ok: false, state: { error: "Please fix the highlighted fields.", fieldErrors: z.flattenError(res.error).fieldErrors } };
}

/** Maps errors to safe messages. Internal details are logged server-side only. */
export function toState(e: unknown): ActionState {
  if (e instanceof DomainError) return { error: e.message };
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505") return { error: "That record already exists." };
  if (code === "23514") return { error: "The values entered are not allowed." };
  console.error("[action-error]", e instanceof Error ? e.name : "unknown", code ?? "");
  return { error: "Something went wrong. Please try again." };
}

export const isRedirect = (e: unknown) =>
  typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
