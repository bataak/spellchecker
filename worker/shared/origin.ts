export interface OriginEnv {
  readonly ALLOWED_ORIGINS?: string;
}

export function allowedOrigin(
  origin: string | null,
  env: OriginEnv,
): string | null {
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim());
  return list.includes(origin) ? origin : null;
}
