import { useEffect, useMemo, useState } from "react";
import type { DrawsResponse } from "./types";
import { selectLine } from "./lib/predict";
import {
  countdownParts,
  formatCalendarDate,
  formatInstant,
  formatLongDate,
  formatShortDate,
  formatTimestamp,
  resolveTarget,
} from "./lib/schedule";

const POLL_MS = 30_000;
const TIMELINE_COUNT = 8;

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function Ball({
  value,
  kind,
}: {
  value: number;
  kind: "white" | "powerball";
}) {
  return (
    <span className={`ball ball-${kind}`} data-testid="ball" data-kind={kind}>
      {value}
    </span>
  );
}

export default function App() {
  const [now, setNow] = useState(() => new Date());
  const [payload, setPayload] = useState<DrawsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, number>>({});
  const timeZone = deviceTimeZone();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/draws", { cache: "no-store" });
        if (!response.ok) throw new Error(`Results request failed (${response.status}).`);
        const body = (await response.json()) as DrawsResponse;
        if (!Array.isArray(body.draws) || body.draws.length === 0) {
          throw new Error("Drawing history was empty.");
        }
        if (!cancelled) {
          setPayload(body);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Drawing history could not be loaded.");
        }
      }
    }

    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const target = payload ? resolveTarget(now, payload.draws.map((draw) => draw.date)) : null;
  const targetDate = target?.easternDate ?? null;
  const step = targetDate ? steps[targetDate] ?? 0 : 0;
  const line = useMemo(() => {
    if (!payload || !targetDate) return null;
    return selectLine(payload.draws, targetDate, step);
  }, [payload, targetDate, step]);
  const countdown = target ? countdownParts(target.instant, now) : null;
  const when = target ? formatInstant(target.instant, timeZone) : null;
  const recent = payload ? payload.draws.slice(-TIMELINE_COUNT) : [];

  return (
    <div className="page">
      <header className="masthead">
        <p className="kicker">Historical pattern summary</p>
        <h1>PowerBall Predictor</h1>
        <p className="lede">A pattern line for the next drawing, summarized from past official results.</p>
      </header>

      {error && !payload ? (
        <p className="banner" role="alert">
          {error}
        </p>
      ) : null}

      {payload?.stale ? (
        <p className="banner" role="status" data-testid="stale-banner">
          {payload.notice} Last updated {formatTimestamp(payload.updatedAt, timeZone)}.
          {payload.latestDrawDate
            ? ` Newest drawing in this copy: ${formatLongDate(payload.latestDrawDate)}.`
            : ""}
        </p>
      ) : null}

      {!payload && !error ? <p className="loading">Loading drawing history…</p> : null}

      {payload && target && line && countdown && when ? (
        <main>
          <section className="card" aria-labelledby="next-heading">
            <h2 id="next-heading">Next drawing</h2>
            <p className="when" data-testid="draw-when">
              {when.when}
            </p>
            <p className="timezone" data-testid="timezone">
              {when.timeZoneName} ({when.timeZoneId})
            </p>
            <p className="official">
              Official drawing: {formatCalendarDate(target.easternDate)} at 10:59 p.m. Eastern Time.
            </p>
            <div
              className="countdown"
              data-testid="countdown"
              aria-label={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes, ${countdown.seconds} seconds until the next drawing`}
            >
              <CountUnit value={countdown.days} label={countdown.days === 1 ? "day" : "days"} />
              <CountUnit value={countdown.hours} label={countdown.hours === 1 ? "hour" : "hours"} pad />
              <CountUnit value={countdown.minutes} label={countdown.minutes === 1 ? "minute" : "minutes"} pad />
              <CountUnit value={countdown.seconds} label={countdown.seconds === 1 ? "second" : "seconds"} pad />
            </div>
            <p className="freshness" data-testid="freshness">
              {payload.stale
                ? "Waiting to reach the live results source again. "
                : `Latest official drawing on file: ${formatLongDate(payload.latestDrawDate ?? payload.draws.at(-1)!.date)}. `}
              This page checks for a newly published drawing every 30 seconds. Last checked{" "}
              {formatTimestamp(payload.fetchedAt, timeZone)}.
            </p>
          </section>

          <section className="card" aria-labelledby="line-heading">
            <h2 id="line-heading">The line</h2>
            <p className="line-for">For the {formatCalendarDate(line.targetDrawDate)} drawing.</p>
            <div className="line" data-testid="prediction-line">
              <div className="ball-group">
                <div className="balls">
                  {line.white.map((pick) => (
                    <Ball key={pick.number} value={pick.number} kind="white" />
                  ))}
                </div>
                <p className="ball-caption">White balls</p>
              </div>
              <div className="ball-group powerball-group">
                <div className="balls">
                  <Ball value={line.powerball.number} kind="powerball" />
                </div>
                <p className="ball-caption">Powerball</p>
              </div>
            </div>
            <button
              type="button"
              className="new-numbers"
              data-testid="new-numbers"
              onClick={() => {
                if (!targetDate) return;
                setSteps((current) => ({ ...current, [targetDate]: (current[targetDate] ?? 0) + 1 }));
              }}
            >
              New numbers
            </button>
            <h3>Why each number is in this line</h3>
            <ul className="reasons">
              {line.white.map((pick) => (
                <li key={`white-${pick.number}`} data-testid="reason">
                  <span className="reason-number">{pick.number}</span>
                  <p>{pick.reason}</p>
                </li>
              ))}
              <li data-testid="reason">
                <span className="reason-number reason-number-powerball">{line.powerball.number}</span>
                <p>{line.powerball.reason}</p>
              </li>
            </ul>
          </section>

          <section className="card" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading">Recent drawings</h2>
            <p className="line-for">Actual results leading up to the line above.</p>
            <ol className="timeline">
              {recent.map((draw) => (
                <li key={draw.date} data-testid="timeline-draw">
                  <span className="dot" aria-hidden="true" />
                  <div>
                    <p className="timeline-date">{formatShortDate(draw.date)}</p>
                    <div className="mini-balls">
                      {draw.white.map((number) => (
                        <span key={number} className="mini mini-white">
                          {number}
                        </span>
                      ))}
                      <span className="mini mini-powerball">{draw.powerball}</span>
                    </div>
                  </div>
                </li>
              ))}
              <li data-testid="timeline-next">
                <span className="dot dot-next" aria-hidden="true" />
                <div>
                  <p className="timeline-date">Next · {formatShortDate(target.easternDate)}</p>
                  <p className="timeline-note">The line for this drawing is shown above.</p>
                </div>
              </li>
            </ol>
          </section>
        </main>
      ) : null}

      <footer>
        <p>
          Drawing history comes from New York Open Data Lottery Powerball results, limited to the current number
          matrix that began October 7, 2015. Drawings are held Monday, Wednesday, and Saturday at 10:59 p.m. Eastern
          Time.
        </p>
      </footer>
    </div>
  );
}

function CountUnit({ value, label, pad = false }: { value: number; label: string; pad?: boolean }) {
  return (
    <div className="unit">
      <strong>{pad ? String(value).padStart(2, "0") : String(value)}</strong>
      <span>{label}</span>
    </div>
  );
}
