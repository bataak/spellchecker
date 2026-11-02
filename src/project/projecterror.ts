import { noteError } from "../core/errorlog.ts";
import { escapeHtml } from "../core/htmlutil.ts";

export class ProjectError extends Error {}

export class AuthError extends ProjectError {}

export class Cancelled extends ProjectError {}

export const PROJECT_TOO_LARGE = "Төсөл хэт том байна (200 MB-аас ихгүй)";
export const REPO_TOO_LARGE = "Repo хэт том тул бүрэн уншиж чадсангүй";

export function failureMessage(
  error: unknown,
  fallback: string,
): string | null {
  if (error instanceof ProjectError) {
    if (error.cause !== undefined) noteError(error.cause);
    return error.message;
  }
  if (error instanceof DOMException && error.name === "AbortError") return null;
  console.error("project:", error);
  return fallback;
}

export function failureHtml(error: unknown, fallback: string): string | null {
  const message = failureMessage(error, fallback);
  return message === null ? null : escapeHtml(message);
}
