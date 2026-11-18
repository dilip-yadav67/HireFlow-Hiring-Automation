import { useEffect, useState, useCallback } from "react";
import { Plus, Copy } from "lucide-react";
import { api } from "./App.jsx";
import { Workflows, Analytics, Settings } from "./Extra.jsx";
const link = t => `${location.origin}/#/interview/${t}`;
const STATUS = ["applied", "shortlisted", "interviewed", "hired", "rejected"];
const Badge = ({ s }) => <span className={"badge " + s}>{s}</span>;
function useLoad(path) {
  const [d, setD] = useState(null), [e, setE] = useState("");
  const load = useCallback(() => api(path).then(setD).catch(x => setE(x.message)), [path]); useEffect(() => { load(); }, [load]); return [d, e, load];
}
const copy = t => navigator.clipboard?.writeText(link(t)).then(() => alert("Interview link copied."));

function AddCandidate({ jobs, onClose, onSaved }) {
  const [f, setF] = useState({ job: jobs[0]?._id || "", name: "", email: "", resume: "" }), [pdf, setPdf] = useState(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const pick = file => { if (!file) return; if (file.size > 5e6) return setErr("PDF must be under 5 MB."); const r = new FileReader(); r.onload = () => setPdf({ name: file.name, b64: r.result.split(",")[1] }); r.readAsDataURL(file); };
  const save = async e => { e.preventDefault(); setBusy(true); setErr("");
    try { await api(`/api/jobs/${f.job}/apply`, { method: "POST", body: { name: f.name, email: f.email, resume: f.resume, resumePdf: pdf?.b64 } }); onSaved(); } catch (x) { setErr(x.message); } setBusy(false); };
  return <div className="modal" onClick={onClose}><form className="authcard" onClick={e => e.stopPropagation()} onSubmit={save}>
    <h2>Add a candidate</h2>
    <select value={f.job} onChange={e => setF({ ...f, job: e.target.value })} required>{jobs.map(j => <option key={j._id} value={j._id}>{j.title}</option>)}</select>
    <input placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
    <input type="email" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
    <label className="file">{pdf ? pdf.name : "Upload resume (PDF)"}<input type="file" accept="application/pdf" hidden onChange={e => pick(e.target.files[0])} /></label>
    {!pdf && <textarea rows="4" placeholder="Or paste the resume text" value={f.resume} onChange={e => setF({ ...f, resume: e.target.value })} />}
    {err && <p className="err">{err}</p>}<button className="btn" disabled={busy}>{busy ? "Scoring resume..." : "Add and score"}</button></form></div>;
}

function Jobs({ onNewJob, filter, onClear }) {
  const [raw, e] = useLoad("/api/jobs"), d = raw && filter ? raw.filter(j => (j.title + " " + j.skills.join(" ")).toLowerCase().includes(filter.toLowerCase())) : raw;
  return <div className="card"><div className="chead"><h3>Jobs</h3><button className="btn" onClick={onNewJob}><Plus size={16} /> Create a job</button></div>
    {filter && <p className="muted">Showing results for <b>{filter}</b> <button className="mini" onClick={onClear}>Clear</button></p>}{e && <p className="err">{e}</p>}{d && !d.length && <p className="empty">No jobs yet. Create your first job to start screening.</p>}
    <div className="tbl">{d?.length > 0 && <table><thead><tr><th>Title</th><th>Skills</th><th>Openings</th><th>Shortlist</th><th>Cutoff</th><th>Status</th><th></th></tr></thead>
      <tbody>{d.map(j => <tr key={j._id}><td><b>{j.title}</b></td><td>{j.skills.join(", ")}</td><td>{j.openings}</td><td>{j.shortlistLimit || j.openings * 3}</td><td>{j.cutoff}%</td><td><Badge s={j.status} /></td><td>{j.status === "open" && <button className="mini" onClick={() => navigator.clipboard?.writeText(`${location.origin}/#/apply/${j._id}`).then(() => alert("Apply link copied. Share it with candidates."))}><Copy size={14} /> Apply link</button>}</td></tr>)}</tbody></table>}</div></div>;
}

function Candidates({ filter, onClear }) {
  const [raw, e, load] = useLoad("/api/applications"), d = raw && filter ? raw.filter(a => (a.name + " " + a.email + " " + (a.job?.title || "")).toLowerCase().includes(filter.toLowerCase())) : raw, [jobs] = useLoad("/api/jobs"), [add, setAdd] = useState(false);
  const set = async (id, status) => { await api("/api/applications/" + id, { method: "PATCH", body: { status } }); load(); };
  return <div className="card"><div className="chead"><h3>Candidates</h3><button className="btn" onClick={() => jobs?.length ? setAdd(true) : alert("Create a job first.")}><Plus size={16} /> Add candidate</button></div>
    {filter && <p className="muted">Showing results for <b>{filter}</b> <button className="mini" onClick={onClear}>Clear</button></p>}{e && <p className="err">{e}</p>}{d && !d.length && <p className="empty">No candidates yet. Add one with a resume and the AI will score it against the job.</p>}
    <div className="tbl">{d?.length > 0 && <table><thead><tr><th>Name</th><th>Job</th><th>Resume score</th><th>Interview</th><th>Status</th><th></th></tr></thead>
      <tbody>{d.map(a => <tr key={a._id}><td><b>{a.name}</b><small>{a.email}</small></td><td>{a.job?.title}</td><td>{a.score ?? "-"}</td><td>{a.interviewScore ?? "-"}</td>
        <td><select value={a.status} onChange={e => set(a._id, e.target.value)}>{STATUS.map(s => <option key={s}>{s}</option>)}</select></td>
        <td>{a.status === "shortlisted" && a.token && <button className="mini" onClick={() => copy(a.token)}><Copy size={14} /> Link</button>}</td></tr>)}</tbody></table>}</div>
    {add && <AddCandidate jobs={jobs.filter(j => j.status === "open")} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); load(); }} />}</div>;
}

function Interviews() {
  const [d, e] = useLoad("/api/applications"), list = d?.filter(a => a.token && a.status !== "applied");
  return <div className="card"><div className="chead"><h3>AI Interviews</h3></div>{e && <p className="err">{e}</p>}
    <p className="muted">Shortlisted candidates get an email with their interview link. Their answers are scored on content only, and the best final scores are hired automatically when everyone has finished.</p>
    {d && !list.length && <p className="empty">No interviews yet. Candidates appear here once they are shortlisted.</p>}
    <div className="tbl">{list?.length > 0 && <table><thead><tr><th>Name</th><th>Job</th><th>Interview</th><th>Final score</th><th>Status</th><th></th></tr></thead>
      <tbody>{list.map(a => <tr key={a._id}><td><b>{a.name}</b></td><td>{a.job?.title}</td><td>{a.interviewScore ?? "Pending"}</td><td>{a.finalScore ?? "-"}</td><td><Badge s={a.status} /></td>
        <td>{a.status === "shortlisted" && <button className="mini" onClick={() => copy(a.token)}><Copy size={14} /> Link</button>}</td></tr>)}</tbody></table>}</div></div>;
}

export default function Pages({ page, onNewJob, filter, onClear }) {
  if (page === "Jobs") return <Jobs onNewJob={onNewJob} filter={filter} onClear={onClear} />;
  if (page === "Candidates" || page === "AI Screening") return <Candidates filter={filter} onClear={onClear} />;
  if (page === "Interviews") return <Interviews />;
  if (page === "Workflows") return <Workflows />;
  if (page === "Analytics") return <Analytics />;
  if (page === "Settings") return <Settings />;
  return <div className="card"><div className="chead"><h3>{page}</h3></div><p className="empty">{page} is not built yet.</p></div>;
}