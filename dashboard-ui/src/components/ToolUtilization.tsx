import type { TelemetryEvent } from "../types";

type Props = {
  latest: TelemetryEvent | null;
  windowCounts?: Record<string, number>;
};

function toolsFromEvent(e: TelemetryEvent | null): string[] {
  if (!e) return [];
  if (Array.isArray(e.tools_invoked) && e.tools_invoked.length) {
    return e.tools_invoked;
  }
  const inferred: string[] = [];
  const rag = e.latency_ms?.rag;
  if (!rag) return inferred;
  if (rag.retrieve != null) inferred.push("retrieve_story_context");
  if (rag.search?.length) inferred.push("search_story_memory");
  if (rag.expand != null) inferred.push("expand_context_around_chunk");
  if (rag.verify != null) inferred.push("verify_story_fact");
  for (const o of rag.other ?? []) {
    if (o.tool) inferred.push(o.tool);
  }
  return [...new Set(inferred)];
}

export function ToolUtilization({ latest, windowCounts }: Props) {
  const latestTools = toolsFromEvent(latest);
  const entries = Object.entries(windowCounts ?? {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));

  return (
    <section className="card metric-card">
      <div className="card-head">
        <h3>Tool utilization</h3>
        <span className="metric-pill">{latestTools.length} latest</span>
      </div>
      <p className="card-hint">Tools invoked on the latest turn, plus ops-window mix.</p>

      <div className="pill-row">
        {latestTools.length === 0 ? (
          <span className="pill muted-pill">No tools recorded</span>
        ) : (
          latestTools.map((t) => (
            <span key={t} className="pill accent-pill">
              {t}
            </span>
          ))
        )}
      </div>

      {entries.length > 0 && (
        <div className="bar-list">
          {entries.map(([name, count]) => (
            <div key={name} className="bar-row">
              <div className="bar-meta">
                <span>{name}</span>
                <span className="mono">{count}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
