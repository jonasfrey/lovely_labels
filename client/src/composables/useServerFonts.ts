// Server-side rendered fonts. The .ttf/.otf files live on the server only;
// the client requests a PNG of the rasterised text via /api/text and uses
// the returned image where ctx.fillText would normally go.
//
// Font families are identified by the synthetic prefix "server:<id>" so the
// rest of the app can keep treating fontFamily as an opaque string.

import { reactive } from "vue";

export interface ServerFontEntry {
  id: string;
  label: string;
}

const SERVER_FONT_PREFIX = "server:";

export function serverFontFamily(id: string): string {
  return SERVER_FONT_PREFIX + id;
}

export function isServerFont(family: string): boolean {
  return family.startsWith(SERVER_FONT_PREFIX);
}

export function serverFontId(family: string): string | null {
  return isServerFont(family) ? family.slice(SERVER_FONT_PREFIX.length) : null;
}

const state = reactive({
  fonts: [] as ServerFontEntry[],
  loaded: false,
  error: null as string | null,
});

interface CachedImage {
  img: HTMLImageElement;
  url: string;
}

const cache = new Map<string, CachedImage>();
const CACHE_MAX = 24;
const inflight = new Map<string, Promise<HTMLImageElement>>();

function cacheKey(id: string, px: number, text: string): string {
  return `${id}${px}${text}`;
}

function touchCache(key: string, entry: CachedImage): void {
  cache.delete(key);
  cache.set(key, entry);
}

function evictExcess(): void {
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    const entry = cache.get(oldest);
    cache.delete(oldest);
    if (entry) URL.revokeObjectURL(entry.url);
  }
}

export async function fetchServerTextImage(
  family: string,
  text: string,
  fontPx: number,
): Promise<HTMLImageElement> {
  const id = serverFontId(family);
  if (!id) throw new Error(`not a server font: ${family}`);
  const px = Math.max(4, Math.round(fontPx));
  const key = cacheKey(id, px, text);

  const cached = cache.get(key);
  if (cached) {
    touchCache(key, cached);
    return cached.img;
  }
  const ongoing = inflight.get(key);
  if (ongoing) return ongoing;

  const job = (async (): Promise<HTMLImageElement> => {
    const params = new URLSearchParams({ text, font: id, fontPx: String(px) });
    const res = await fetch(`/api/text?${params.toString()}`);
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      throw new Error(`/api/text ${res.status}: ${msg.slice(0, 200)}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("server text image failed to decode"));
    });
    const entry: CachedImage = { img, url };
    cache.set(key, entry);
    evictExcess();
    return img;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

export function useServerFonts() {
  async function loadServerFonts(): Promise<ServerFontEntry[]> {
    if (state.loaded) return state.fonts;
    try {
      const res = await fetch("/api/fonts");
      if (!res.ok) throw new Error(`/api/fonts ${res.status}`);
      const data = (await res.json()) as unknown;
      if (Array.isArray(data)) {
        state.fonts = data
          .filter((f): f is ServerFontEntry =>
            typeof f === "object" && f !== null
            && typeof (f as ServerFontEntry).id === "string"
            && typeof (f as ServerFontEntry).label === "string"
          );
      }
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    } finally {
      state.loaded = true;
    }
    return state.fonts;
  }

  return { state, loadServerFonts };
}
