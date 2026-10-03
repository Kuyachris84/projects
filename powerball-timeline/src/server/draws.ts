import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { mergeDraws, parseSodaRows } from "../lib/history";
import type { Draw, DrawsResponse } from "../types";

const LIVE_URL = "https://data.ny.gov/resource/d6yy-54nr.json";
const CACHE_MS = 30_000;
const PAGE_SIZE = 1000;

interface BundleFile {
  generatedAt: string;
  draws: Draw[];
}

interface CacheEntry {
  at: number;
  payload: DrawsResponse;
}

let cache: CacheEntry | null = null;

function bundledPath(): string {
  const candidates = [
    path.join(process.cwd(), "src/data/bundled-draws.json"),
    path.join(process.cwd(), "powerball-timeline/src/data/bundled-draws.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Bundled Powerball history was not found.");
}

export function loadBundled(): { generatedAt: string; draws: Draw[] } {
  const parsed = JSON.parse(readFileSync(bundledPath(), "utf8")) as BundleFile;
  return {
    generatedAt: parsed.generatedAt,
    draws: mergeDraws([], parsed.draws),
  };
}

async function fetchLiveDraws(): Promise<Draw[]> {
  const rows: unknown[] = [];
  for (let offset = 0; offset < 20_000; offset += PAGE_SIZE) {
    const url = new URL(LIVE_URL);
    url.searchParams.set("$limit", String(PAGE_SIZE));
    url.searchParams.set("$offset", String(offset));
    url.searchParams.set("$order", "draw_date ASC");
    url.searchParams.set("$where", "draw_date >= '2015-10-07T00:00:00.000'");

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "PowerballTimelinePredictor/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Results source responded with ${response.status}.`);
    }
    const page = (await response.json()) as unknown;
    if (!Array.isArray(page)) {
      throw new Error("Results source did not return a list.");
    }
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const draws = parseSodaRows(rows);
  if (draws.length === 0) {
    throw new Error("Results source returned no usable drawings.");
  }
  return draws;
}

function stalePayload(bundled: { generatedAt: string; draws: Draw[] }, fetchedAt: string): DrawsResponse {
  const latest = bundled.draws.at(-1)?.date ?? null;
  return {
    draws: bundled.draws,
    source: "bundled",
    stale: true,
    updatedAt: bundled.generatedAt,
    fetchedAt,
    latestDrawDate: latest,
    notice: "Live results could not be reached. Showing bundled history, which may be stale.",
  };
}

export async function getDrawPayload(): Promise<DrawsResponse> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.payload;

  const bundled = loadBundled();
  const fetchedAt = new Date(now).toISOString();

  try {
    const live = await fetchLiveDraws();
    const draws = mergeDraws(bundled.draws, live);
    const payload: DrawsResponse = {
      draws,
      source: "live",
      stale: false,
      updatedAt: fetchedAt,
      fetchedAt,
      latestDrawDate: draws.at(-1)?.date ?? null,
      notice: null,
    };
    cache = { at: now, payload };
    return payload;
  } catch (error) {
    console.error("Live Powerball results fetch failed; using bundled history.", error);
    const payload = stalePayload(bundled, fetchedAt);
    cache = { at: now, payload };
    return payload;
  }
}

export function resetDrawCache(): void {
  cache = null;
}
