export interface Draw {
  date: string;
  white: number[];
  powerball: number;
}

export interface DrawsResponse {
  draws: Draw[];
  source: "live" | "bundled";
  stale: boolean;
  updatedAt: string;
  fetchedAt: string;
  latestDrawDate: string | null;
  notice: string | null;
}
