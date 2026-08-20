/**
 * What a form action hands back. Lives outside any `"use server"` module, because such a
 * file may only export async functions.
 */
export type FormState = { errors: Record<string, string> };

export const EMPTY_FORM_STATE: FormState = { errors: {} };
