import { useEffect, useRef, useState, useCallback } from "react";
import { Chart } from "chart.js/auto";
import { CONFIG, ISSUE_FIELDS } from "./config.js";
import { jiraSearch, jiraGroupMembers } from "./api.js";
import { resolveModules, buildRoster, computeMetrics } from "./transform.js";

const STATUS_COLORS = {
  "To Do": "#3987e5", "Open": "#3987e5", "In Progress": "#c98500",
  "In Review": "#9085e9", "Reopened": "#e66767", "Resolved": "#199e70",
  "Done": "#898781", "Closed": "#898781",
};
const colorFor = (s, i) =>
  STATUS_COLORS[s] || ["#3987e5", "#c98500", "#9085e9", "#199e70", "#898781", "#e66767"][i % 6];

const sevTint = (s) =>
  s === "Critical" || s === "Highest" ? ["var(--bg-danger)", "var(--text-danger)"]
  : s === "High" ? ["var(--bg-warning)", "var(--text-warning)"]
  : s === "Medium" ? ["var(--bg-accent)", "var(--text-accent)"]
  : ["var(--surface-1)", "var(--text-secondary)"];

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [secs, setSecs] = useState(CONFIG.refreshIntervalMs / 1000);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let allowed = null;
      if (CONFIG.qaGroupId) allowed = await jiraGroupMembers(CONFIG.qaGroupId);
      const defects = await jiraSearch(CONFIG.defectJql, ISSUE_FIELDS);
      await resolveModules(defects);
      const roster = buildRoster(defects, allowed);
      setData(computeMetrics(defects, roster));
      setLastFetch(Date.now());
      setSecs(CONFIG.refreshIntervalMs / 1000);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) { load(); return CONFIG.refreshIntervalMs / 1000; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    const labels = Object.keys(data.byStatus);
    const values = labels.map((l) => data.byStatus[l]);
    const colors = labels.map((l, i) => colorFor(l, i));
    if (chartRef.current) chartRef.current.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "doughnut",
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: getComputedStyle(document.body).getPropertyValue("--surface-2") }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { display: false } } },
    });
  }, [data]);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const ago = lastFetch ? Math.floor((Date.now() - lastFetch) / 60000) : null;
  const maxModule = data ? Math.max(1, ...Object.values(data.byModule)) : 1;
  const statusEntries = data ? Object.entries(data.byStatus) : [];

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="title-row">
            <span className="title">CALM · QA defect command center</span>
            <span className="env">Golden Dev</span>
          </div>
          <div className="subtle">Source: Jira · {CONFIG.baseUrl.replace("https://", "")}</div>
        </div>
        <div className="controls">
          <div className="refresh-meta">
            <div>Last refreshed {ago === null ? "—" : ago < 1 ? "just now" : `${ago}m ago`}</div>
            <div>Auto-refresh in {fmt(secs)}</div>
          </div>
          <button className="btn" onClick={load} disabled={loading}>
            <span className={loading ? "spin" : ""}>⟳</span> {loading ? "Loading" : "Refresh"}
          </button>
        </div>
      </header>

      {error && <div className="error">Could not reach Jira: {error}</div>}

      {data && (
        <>
          <section className="kpis">
            <Kpi label="Total defects" value={data.kpis.total} />
            <Kpi label="Open" value={data.kpis.open} />
            <Kpi label="Unassigned" value={data.kpis.unassigned} danger />
            <Kpi label="Critical / High" value={data.kpis.critHigh} />
            <Kpi label="Resolved · 7d" value={data.kpis.resolved7d} success />
            <Kpi label="Reopen rate" value={`${data.kpis.reopenRate}%`} />
          </section>

          <section className="grid2">
            <div className="card">
              <div className="card-title">By status</div>
              <div className="donut-wrap"><canvas ref={canvasRef} /></div>
              <div className="legend">
                {statusEntries.map(([s, n], i) => (
                  <span key={s}><i style={{ background: colorFor(s, i) }} />{s} {n}</span>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-title">By application / module</div>
              <div className="bars">
                {Object.entries(data.byModule).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
                  <div key={m} className="bar-row">
                    <div className="bar-head"><span>{m}</span><span className="b">{n}</span></div>
                    <div className="track"><div className="fill" style={{ width: `${(n / maxModule) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-title">QA team — defect ownership</div>
            <table className="team">
              <thead>
                <tr><th>Member</th><th>Reported</th><th>Assigned</th><th>Open</th><th>Resolved</th><th>Reopened</th></tr>
              </thead>
              <tbody>
                {data.team.map((m) => (
                  <tr key={m.id}>
                    <td><span className="who"><span className="avatar">{initials(m.name)}</span>{m.name}</span></td>
                    <td className="c">{m.reported}</td>
                    <td className="c">{m.assigned}</td>
                    <td className="c b">{m.open}</td>
                    <td className="c ok">{m.resolved}</td>
                    <td className={"c" + (m.reopened > 2 ? " warn" : "")}>{m.reopened}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card danger-card">
            <div className="card-title danger">⚠ Unassigned defects — need an owner</div>
            <div className="unassigned">
              {data.unassigned.length === 0 && <div className="subtle">None — every open defect has an owner.</div>}
              {data.unassigned.map((u) => {
                const [bg, fg] = sevTint(u.priority);
                return (
                  <div key={u.key} className="urow">
                    <span className="mono">{u.key}</span>
                    <span className="sev" style={{ background: bg, color: fg }}>{u.priority}</span>
                    <span className="subtle mod">{u.module}</span>
                    <span className="utitle">{u.title}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, danger, success }) {
  return (
    <div className={"kpi" + (danger ? " kpi-danger" : "")}>
      <div className="kpi-label">{label}</div>
      <div className={"kpi-value" + (danger ? " danger" : success ? " ok" : "")}>{value}</div>
    </div>
  );
}
const initials = (n) => n.split(" ").map((p) => p[0]).slice(0, 2).join("");
