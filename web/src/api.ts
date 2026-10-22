const fromUrl = new URLSearchParams(location.search).get("code");
if (fromUrl) try { localStorage.setItem("lumina-code", fromUrl); } catch {}
export const token = fromUrl ?? (() => { try { return localStorage.getItem("lumina-code") ?? ""; } catch { return ""; } })();

export async function api<T = any>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status}`);
  return r.status === 204 ? (undefined as T) : r.json();
}

export const media = (url: string) => `${url}${token ? `?t=${token}` : ""}`;
