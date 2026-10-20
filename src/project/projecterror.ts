export class ProjectError extends Error {}

export class AuthError extends ProjectError {}

export function failureMessage(
  error: unknown,
  fallback: string,
): string | null {
  if (error instanceof ProjectError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return null;
  console.error("project:", error);
  return fallback;
}
