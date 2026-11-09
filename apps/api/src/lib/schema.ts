import { z } from "zod";

/**
 * Schema for PATCH bodies: every field optional and *no defaults*. In Zod 4 a
 * `.default()` still fires inside `.partial()`, which would silently reset
 * omitted fields (isActive, sortOrder, colours…) on every edit.
 */
export function patchSchema<T extends z.ZodObject>(schema: T) {
  const shape = Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, v instanceof z.ZodDefault ? v.unwrap() : v]));
  return z.object(shape as z.ZodRawShape).partial() as unknown as ReturnType<T["partial"]>;
}
