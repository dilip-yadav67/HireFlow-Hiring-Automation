import { useEffect, useRef, useState } from "react";
import { Search, Bell, UserPlus, Sparkles, GitBranch, Mail, Video, Clock, Trophy } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "./App.jsx";
const useOutside = (ref, fn) => useEffect(() => { const f = e => !ref.current?.contains(e.target) && fn(); document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, [ref, fn]);

export function SearchBox({ onPick }) {
  const [q, setQ] = useState(""), [res, setRes] = useState(null), [open, setOpen] = useState(false), box = useRef();
  useEffect(() => { if (!q.trim()) { setRes(null); return; } const t = setTimeout(() => api("/api/search?q=" + encodeURIComponent(q)).then(setRes).catch(() => setRes({ candidates: [], jobs: [] })), 250); return () => clearTimeout(t); }, [q]);
  useOutside(box, () => setOpen(false));
  const pick = (page, text) => { onPick(page, text); setOpen(false); setQ(""); };
  return <div className="search" ref={box}><Search size={18} /><input placeholder="Search candidates, jobs..." value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={e => e.key === "Enter" && q.trim() && pick("Candidates", q.trim())} />
    {open && q.trim() && <div className="drop">{!res && <p className="empty">Searching...</p>}
      {res && !res.candidates.length && !res.jobs.length && <p className="empty">No matches for "{q}".</p>}
      {res?.candidates.map(c => <button key={c._id} className="dropitem" onClick={() => pick("Candidates", c.name)}><b>{c.name}</b><small>{c.email} · {c.status}</small></button>)}
      {res?.jobs.map(j => <button key={j._id} className="dropitem" onClick={() => pick("Jobs", j.title)}><b>{j.title}</b><small>Job · {j.status}</small></button>)}</div>}</div>;
}

export function BellBtn() {
  const [items, setItems] = useState([]), [open, setOpen] = useState(false), [seen, setSeen] = useState(+localStorage.getItem("hf_seen") || 0), box = useRef();
  const load = () => api("/api/notifications").then(setItems).catch(() => {});
  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i); }, []);
  useOutside(box, () => setOpen(false));
  const unread = items.filter(i => new Date(i.createdAt).getTime() > seen).length;
  const toggle = () => { if (!open) load(); setOpen(!open); };
  const read = () => { const n = new Date(items[0]?.createdAt || Date.now()).getTime(); localStorage.setItem("hf_seen", n); setSeen(n); };
  return <div className="bellwrap" ref={box}><button className="bell" aria-label="Notifications" onClick={toggle}><Bell size={18} />{unread > 0 && <i className="reddot" />}</button>
    {open && <div className="drop right"><div className="chead"><b>Notifications</b>{unread > 0 && <button className="mini" onClick={read}>Mark all read</button>}</div>
      {!items.length && <p className="empty">No notifications yet.</p>}
      {items.map(i => <div key={i._id} className="dropitem"><b>{i.text}</b><small>{new Date(i.createdAt).toLocaleString()}</small></div>)}</div>}</div>;
}

export function Workflows() {
  const [m, setM] = useState(null), [d, setD] = useState(null);
  useEffect(() => { api("/api/me").then(setM).catch(() => setM({})); api("/api/dashboard").then(setD).catch(() => setD({})); }, []);
  if (!m || !d) return <div className="card"><p className="muted">Loading...</p></div>;
  const mail = !!m.email_via, n = k => d[k] || 0, total = n("total"), passed = n("shortlisted") + n("interviewed") + n("hired"), done = n("interviewed") + n("hired");
  const funnel = [["Applied", total, "#8b5cf6"], ["Passed screening", passed, "#0ea5e9"], ["Interviewed", done, "#f59e0b"], ["Hired", n("hired"), "#10b981"]];
  const steps = [
    [UserPlus, "Candidate applies", "A recruiter adds them, or they use the job's public Apply link. The resume (PDF or text) is read.", true, "#8b5cf6", total],
    [Sparkles, "AI resume score", m.ai ? "Gemini scores the resume from 0 to 100 against the job." : "Keyword scoring is on. Add GEMINI_API_KEY in backend/.env for AI scoring.", true, "#0ea5e9", total],
    [GitBranch, "Auto shortlist or reject", "A score at or above the cutoff, within the shortlist limit, passes. Everyone else is rejected.", true, "#14b8a6", passed, true],
    [Mail, "Interview link email", mail ? `Sent through ${m.email_via}.` : "No email service yet. Add one in backend/.env.", mail, "#f59e0b"],
    [Video, "AI interview", `Hard questions with a ${m.interviewMinutes} minute timer. It submits itself when time ends.`, true, "#8b5cf6", done],
    [Clock, "Reminder and expiry", `Reminder after ${m.remindHours} hours. The link expires after ${m.deadlineHours} hours and the candidate is rejected.`, mail, "#ef4444"],
    [Trophy, "Final selection", "When all interviews finish, the best final scores are hired, the rest rejected, results are emailed and the job closes.", true, "#10b981", n("hired")]];
  return <div className="card wf"><div className="chead"><h3>Automation workflow</h3><span className="live"><i className="pulse" />Live</span></div>
    <div className="funnel">{funnel.map(([l, v, c], i) => <div key={l} className="frow"><span>{l}</span><div className="bar"><i style={{ "--w": (total ? Math.max(3, 100 * v / total) : 0) + "%", background: c, animationDelay: i * 120 + "ms" }} /></div><b>{v}</b></div>)}</div>
    <div className="track">{steps.map(([I, t, desc, ok, c, cnt, branch], i) => <div key={t}>
      <div className="node" style={{ animationDelay: i * 110 + "ms", "--c": c }}><span className="ico"><I size={22} /></span>
        <div className="ntxt"><b>{t}</b><p>{desc}</p>{branch && <div className="split"><span className="pill g">Pass: go to interview</span><span className="pill r">Fail: rejection email</span></div>}</div>
        <div className="nside">{cnt != null && <span className="count">{cnt}</span>}<span className={"badge " + (ok ? "hired" : "rejected")}>{ok ? "Active" : "Needs setup"}</span></div></div>
      {i < steps.length - 1 && <span className="wire" />}</div>)}</div></div>;
}

export function Analytics() {
  const [d, setD] = useState(null), [e, setE] = useState("");
  useEffect(() => { api("/api/analytics").then(setD).catch(x => setE(x.message)); }, []);
  if (e) return <div className="card"><p className="err">{e}</p></div>;
  if (!d) return <div className="card"><p className="muted">Loading...</p></div>;
  if (!d.total) return <div className="card"><div className="chead"><h3>Analytics</h3></div><p className="empty">No data yet. Add candidates to see analytics.</p></div>;
  const kpi = [["Candidates", d.total], ["Avg resume score", d.avgResume], ["Avg interview score", d.avgInterview], ["Hire rate", Math.round(100 * (d.byStatus.hired || 0) / d.total) + "%"]];
  const bars = ["applied", "shortlisted", "interviewed", "hired", "rejected"].map(s => ({ s, n: d.byStatus[s] || 0 }));
  return <><section className="stats">{kpi.map(([l, v]) => <div key={l} className="stat" style={{ background: "#f1ecff" }}><div><b>{v}</b><small>{l}</small></div></div>)}</section>
    <div className="card" style={{ marginBottom: 22 }}><div className="chead"><h3>Candidates by status</h3></div><ResponsiveContainer width="100%" height={240}><BarChart data={bars}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7f2" /><XAxis dataKey="s" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="n" name="Candidates" fill="#8b5cf6" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
    <div className="card"><div className="chead"><h3>Per job</h3></div><div className="tbl"><table><thead><tr><th>Job</th><th>Applications</th><th>Passed screening</th><th>Hired</th><th>Avg resume score</th></tr></thead>
      <tbody>{d.jobs.map(j => <tr key={j.title}><td><b>{j.title}</b></td><td>{j.applications}</td><td>{j.shortlisted}</td><td>{j.hired}</td><td>{j.avg}</td></tr>)}</tbody></table></div></div></>;
}

export function Settings() {
  const [m, setM] = useState(null), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/me").then(setM).catch(() => setM({})); }, []);
  const test = async () => { setBusy(true); setMsg(""); try { const r = await api("/api/test-email", { method: "POST" }); setMsg(r.ok ? `Test email sent to ${m.email}. Check your inbox and spam.` : "Sending failed. See the reason in Recent Activity on the Dashboard."); } catch (x) { setMsg(x.message); } setBusy(false); };
  if (!m) return <div className="card"><p className="muted">Loading...</p></div>;
  const rows = [["Name", m.name], ["Email", m.email], ["Email service", m.email_via || "Not set up"], ["AI scoring", m.ai ? "Gemini" : "Keyword match (no GEMINI_API_KEY)"], ["Interview length", `${m.interviewMinutes} minutes`], ["Reminder after", `${m.remindHours} hours`], ["Link expires after", `${m.deadlineHours} hours`]];
  return <div className="card"><div className="chead"><h3>Settings</h3></div>{rows.map(([k, v]) => <div className="prow" key={k}>{k}<b>{v}</b></div>)}
    <p className="muted" style={{ margin: "14px 0" }}>Automation values come from backend/.env. Change them there and restart the backend.</p>
    <button className="btn" onClick={test} disabled={busy}>{busy ? "Sending..." : "Send a test email to me"}</button>{msg && <p className="muted" style={{ marginTop: 12 }}>{msg}</p>}</div>;
}