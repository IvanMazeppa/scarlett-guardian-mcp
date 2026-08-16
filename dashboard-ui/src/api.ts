declare global {
  interface Window {
    GUARDIAN_BEARER?: string;
  }
}

function authHeaders(): HeadersInit {
  const token = window.GUARDIAN_BEARER;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${url}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${url}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export function formatOpsTs(ts: string | null | undefined): string {
  if (!ts) return "—";
  return ts.replace("T", " ").replace(/\.\d+Z$/, "Z");
}

export function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${Math.round(n * 1000) / 10}%`;
}

export function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return String(n);
}
