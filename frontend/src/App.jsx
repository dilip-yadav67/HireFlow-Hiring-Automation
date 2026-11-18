import { useEffect, useState, useCallback } from "react";
import { LayoutGrid, Users, Briefcase, Sparkles, CalendarDays, Workflow, BarChart3, Settings, Search, Bell, Menu, X, Bot, Send, Plus, LogOut } from "lucide-react";
import Pages from "./Pages.jsx"; import { SearchBox, BellBtn, UserMenu } from "./Extra.jsx"; import Interview from "./Interview.jsx"; import Apply from "./Apply.jsx";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
const API = import.meta.env.VITE_API_URL || "http://localhost:4000";
export async function api(path, opt = {}) {
  const t = localStorage.getItem("hf_token");
  const r = await fetch(API + path, { ...opt, headers: { "Content-Type": "application/json", ...(t && { Authorization: "Bearer " + t }) }, body: opt.body && JSON.stringify(opt.body) });
  const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Something went wrong."); return d;
}
const NAV = [["Dashboard", LayoutGrid], ["Candidates", Users], ["Jobs", Briefcase], ["AI Screening", Sparkles], ["Interviews", CalendarDays], ["Workflows", Workflow], ["Analytics", BarChart3], ["Settings", Settings]];
const Credit = ({ light }) => <div className={"credit" + (light ? " light" : "")}><span className="dylogo">DY</span><div><small>BUILT BY</small><b>DILIP YADAV</b></div></div>;
const fmt = n => (n ?? 0).toLocaleString("en-US");

function Auth({ onDone }) {
  const [mode, setMode] = useState("login"), [f, setF] = useState({ name: "", email: "", password: "" }), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async e => { e.preventDefault(); setBusy(true); setErr("");
    try { const d = await api("/api/auth/" + mode, { method: "POST", body: f }); localStorage.setItem("hf_token", d.token); localStorage.setItem("hf_name", d.name); onDone(); }
    catch (x) { setErr(x.message === "Failed to fetch" ? "Server is starting up. Wait about a minute and try again." : x.message); } setBusy(false); };
  return <div className="authwrap"><form className="authcard" onSubmit={go}>
    <div className="brand"><span className="logo">H</span><div><b>HireFlow</b><small>Smart Hiring. Faster.</small></div></div>
    <h2>{mode === "login" ? "Log in" : "Create your account"}</h2>
    {mode === "register" && <input placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />}
    <input type="email" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
    <input type="password" placeholder="Password (6+ characters)" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
    {err && <p className="err">{err}</p>}
    <button className="btn" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button>
    <p className="swap" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "New here? Create an account" : "Have an account? Log in"}</p>
    <Credit light />
  </form></div>;
}

function JobModal({ onClose, onSaved }) {
  const [f, setF] = useState({ title: "", skills: "", openings: 2, shortlistLimit: 6, cutoff: 70 }), [err, setErr] = useState("");
  const save = async e => { e.preventDefault(); try { await api("/api/jobs", { method: "POST", body: { ...f, skills: f.skills.split(",") } }); onSaved(); } catch (x) { setErr(x.message); } };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return <div className="modal" onClick={onClose}><form className="authcard" onClick={e => e.stopPropagation()} onSubmit={save}>
    <h2>Create a job</h2><input placeholder="Job title (e.g. Frontend Developer)" value={f.title} onChange={set("title")} required />
    <input placeholder="Required skills, comma separated" value={f.skills} onChange={set("skills")} required />
    <div className="row3"><label>Openings<input type="number" min="1" value={f.openings} onChange={set("openings")} /></label>
      <label>Shortlist limit<input type="number" min="1" value={f.shortlistLimit} onChange={set("shortlistLimit")} /></label>
      <label>Cutoff %<input type="number" min="0" max="100" value={f.cutoff} onChange={set("cutoff")} /></label></div>
    {err && <p className="err">{err}</p>}<button className="btn">Publish job</button></form></div>;
}

function Assistant() {
  const [msgs, setMsgs] = useState([{ me: false, t: "Hi! I'm your recruitment copilot. How can I help you today?" }]), [q, setQ] = useState(""), [busy, setBusy] = useState(false);
  const ask = async text => { if (!text.trim() || busy) return; setMsgs(m => [...m, { me: true, t: text }]); setQ(""); setBusy(true);
    try { const d = await api("/api/ai/chat", { method: "POST", body: { message: text } }); setMsgs(m => [...m, { me: false, t: d.reply }]); }
    catch (x) { setMsgs(m => [...m, { me: false, t: x.message }]); } setBusy(false); };
  const sug = ["Find top candidates for Frontend Developer", "Summarize candidate feedback", "Plan interview slots", "Show hiring analytics"];
  return <aside className="assist"><div className="ahead"><span className="aico"><Bot size={22} /></span><div><b>HireFlow AI Assistant</b><small><i className="dot" />Online</small></div></div>
    <div className="msgs">{msgs.map((m, i) => <div key={i} className={"bub " + (m.me ? "me" : "")}>{m.t}</div>)}{busy && <div className="bub">Thinking...</div>}</div>
    {sug.map(s => <button key={s} className="sug" onClick={() => ask(s)}><Sparkles size={16} />{s}</button>)}
    <div className="askbox"><input placeholder="Ask anything..." value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask(q)} /><button onClick={() => ask(q)} aria-label="Send"><Send size={16} /></button></div></aside>;
}

function Dashboard({ onLogout }) {
  const [page, setPage] = useState("Dashboard"), [filter, setFilter] = useState(""), [rev, setRev] = useState(0), [d, setD] = useState(null), [err, setErr] = useState(""), [nav, setNav] = useState(false), [job, setJob] = useState(false), [ai, setAi] = useState(false);
  const [, bump] = useState(0); useEffect(() => { const f = () => bump(n => n + 1); addEventListener("hf-profile", f); return () => removeEventListener("hf-profile", f); }, []);
  const name = localStorage.getItem("hf_name") || "there", first = name.split(" ")[0];
  const load = useCallback(() => api("/api/dashboard").then(setD).catch(x => x.message.includes("log in") ? onLogout() : setErr(x.message)), [onLogout]);
  useEffect(() => { if (page === "Dashboard") load(); }, [load, page]);
  const stats = d && [["1", Users, d.total, "Total Applications", "#f1ecff", "#8b5cf6"], ["2", Sparkles, d.shortlisted, "Shortlisted Candidates", "#e6faf3", "#10b981"], ["3", CalendarDays, d.interviewed + d.shortlisted, "Interviews Scheduled", "#fff1e6", "#f59e0b"], ["4", Briefcase, d.hired, "Hired This Month", "#e6f6fd", "#0ea5e9"]];
  const pipe = d && [["Applications", d.total, "#8b5cf6"], ["Screened", d.screened, "#0ea5e9"], ["Interviewed", d.interviewed, "#10b981"], ["Offers", d.offers, "#f59e0b"], ["Hired", d.hired, "#14b8a6"]];
  return <div className="app">
    <nav className={"side " + (nav ? "open" : "")}><div className="brand"><span className="logo">H</span><div><b>HireFlow</b><small>Smart Hiring. Faster.</small></div><X className="close" onClick={() => setNav(false)} /></div>
      {NAV.map(([n, I]) => <a key={n} className={n === page ? "act" : ""} onClick={() => { setPage(n); setFilter(""); setNav(false); }}><I size={20} />{n}</a>)}
      <Credit /><button className="logout" onClick={onLogout}><LogOut size={18} />Log out</button></nav>
    <main><header><button className="burger" onClick={() => setNav(true)} aria-label="Menu"><Menu /></button>
      <SearchBox onPick={(p, t) => { setPage(p); setFilter(t); }} />
      <BellBtn /><UserMenu name={name} onSettings={() => { setPage("Settings"); setFilter(""); }} onLogout={onLogout} /></header>
      {page !== "Dashboard" ? <Pages key={page + rev} page={page} onNewJob={() => setJob(true)} filter={filter} onClear={() => setFilter("")} /> : <>
      <div className="hello"><div><h1>Welcome back, {first}! 👋</h1><p>Let's find the best talent with the power of AI.</p></div><span className="chip">Last 30 Days</span></div>
      {err && <p className="err">{err === "Failed to fetch" ? "Server is starting up. Refresh in about a minute." : err}</p>}
      {!d && !err && <p className="muted">Loading your dashboard...</p>}
      {d && <>
        <section className="stats">{stats.map(([k, I, v, l, bg, c]) => <div key={k} className="stat" style={{ background: bg }}><span className="sico" style={{ color: c }}><I size={22} /></span><div><b>{fmt(v)}</b><small>{l}</small></div></div>)}</section>
        <section className="grid2"><div className="hero"><span className="tag"><Sparkles size={13} /> AI POWERED</span><h2>Smarter Hiring.<br /><em>Powered by AI.</em></h2>
          <p>Screen resumes, organize candidates, and keep your workflow moving.</p><button className="btn" onClick={() => setJob(true)}><Plus size={16} /> Create a job</button><div className="robot"><Bot size={64} /></div></div>
          <div className="card"><div className="chead"><h3>Hiring Pipeline</h3></div>{pipe.map(([l, v, c]) => <div className="prow" key={l}><i style={{ background: c }} />{l}<b>{fmt(v)}</b></div>)}</div></section>
        <section className="grid3">
          <div className="card"><div className="chead"><h3>Recruitment Analytics</h3><span className="chip">This Month</span></div>
            {d.series.length ? <ResponsiveContainer width="100%" height={220}><AreaChart data={d.series.map(s => ({ day: s._id, n: s.n }))}><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity=".3" /><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7f2" /><XAxis dataKey="day" tick={{ fontSize: 12 }} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} /><Area dataKey="n" name="Applications" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#g)" /></AreaChart></ResponsiveContainer>
              : <p className="empty">No applications yet. Create a job and add candidates to see trends.</p>}</div>
          <div className="card"><div className="chead"><h3>Recent Activity</h3></div>{d.logs.length ? d.logs.map(l => <div className="act-row" key={l._id}><span className="sico sm"><Sparkles size={16} /></span><div><b>{l.text}</b><small>{new Date(l.createdAt).toLocaleString()}</small></div></div>) : <p className="empty">Nothing yet. Activity shows up here.</p>}</div>
          <div className="card"><div className="chead"><h3>Upcoming Interviews</h3></div>{d.upcoming.length ? d.upcoming.map(a => <div className="act-row" key={a._id}><span className="av">{a.name[0]}</span><div><b>{a.name}</b><small>{a.job?.title}</small></div></div>) : <p className="empty">No interviews scheduled.</p>}</div>
        </section></>}</>}
    </main>
    <div className={"assistwrap " + (ai ? "show" : "")}><Assistant /></div>
    <button className="fab" onClick={() => setAi(!ai)} aria-label="AI Assistant"><Bot /></button>
    {nav && <div className="scrim" onClick={() => setNav(false)} />}
    {job && <JobModal onClose={() => setJob(false)} onSaved={() => { setJob(false); setRev(r => r + 1); load(); }} />}
  </div>;
}
export default function App() {
  const [ok, setOk] = useState(!!localStorage.getItem("hf_token")), [h, setH] = useState(location.hash);
  useEffect(() => { const f = () => setH(location.hash); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  if (h.startsWith("#/apply/")) return <Apply id={h.slice(8)} />;
  if (h.startsWith("#/interview/")) return <Interview token={h.slice(12)} />;
  const out = useCallback(() => { localStorage.removeItem("hf_token"); setOk(false); }, []);
  return ok ? <Dashboard onLogout={out} /> : <Auth onDone={() => setOk(true)} />;
}
