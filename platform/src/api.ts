import type { ProjectDocument, CatalogItem } from "@roomfit/core";
export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  preferences: Record<string, unknown>;
}
export interface Project {
  id: string;
  name: string;
  version: number;
  document: ProjectDocument;
  favorite: boolean;
  archived: boolean;
  deletedAt: string | null;
  updatedAt: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
let csrf = "";
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof data.detail === "string"
        ? data.detail
        : "Проверь данные и попробуй ещё раз",
    );
  return data as T;
}
export async function bootstrap() {
  const result = await request<{
    user: User | null;
    csrf: string;
    passwordResetAvailable: boolean;
  }>("/auth/me");
  csrf = result.csrf;
  return result;
}
export const catalog = () => request<CatalogItem[]>("/catalog");
