export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== "undefined" && options?.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(body.message || "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
