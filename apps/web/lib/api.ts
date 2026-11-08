import "server-only";
import type { Home, Layout } from "./types";

const API = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";

export class ApiUnavailableError extends Error {}

/** Server-side fetch against the Express API with short-lived data caching. */
async function get<T>(path: string, revalidate = 60): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { next: { revalidate }, headers: { accept: "application/json" } });
  } catch (err) {
    throw new ApiUnavailableError(`API unreachable at ${API}: ${(err as Error).message}`);
  }
  if (!res.ok) throw new Error(`GET ${path} failed with ${res.status}`);
  return (await res.json()) as T;
}

export const getLayout = () => get<Layout>("/api/store/layout");
export const getHome = () => get<Home>("/api/store/home");
