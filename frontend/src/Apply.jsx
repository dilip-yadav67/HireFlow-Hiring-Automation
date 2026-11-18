import { useEffect, useState } from "react";
import { api } from "./App.jsx";
const Wrap = ({ children }) => <div className="authwrap"><div className="authcard ivcard"><div className="brand"><span className="logo">H</span><div><b>HireFlow</b><small>Job application</small></div></div>{children}</div></div>;
export default function Apply({ id }) {
  const [job, setJob] = useState(null), [err, setErr] = useState(""), [f, setF] = useState({ name: "", email: "", resume: "" }), [pdf, setPdf] = useState(null), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  useEffect(() => { api("/api/public/job/" + id).then(setJob).catch(e => setErr(e.message === "Failed to fetch" ? "Server is starting up. Refresh in about a minute." : e.message)); }, [id]);
  const pick = file => { if (!file) return; if (file.size > 5e6) return setErr("PDF must be under 5 MB."); const r = new FileReader(); r.onload = () => { setErr(""); setPdf({ name: file.name, b64: r.result.split(",")[1] }); }; r.readAsDataURL(file); };
  const send = async e => { e.preventDefault(); setBusy(true); setErr("");
    try { await api(`/api/public/job/${id}/apply`, { method: "POST", body: { ...f, resumePdf: pdf?.b64 } }); setDone(true); } catch (x) { setErr(x.message); } setBusy(false); };
  if (done) return <Wrap><h2>Application received</h2><p>Thank you. If you are shortlisted, we will email you an AI interview link.</p></Wrap>;
  if (!job) return <Wrap>{err ? <p className="err">{err}</p> : <p className="muted">Loading...</p>}</Wrap>;
  return <Wrap><h2>Apply for {job.title}</h2><p className="muted">Skills we look for: {job.skills.join(", ")}</p>
    <form onSubmit={send} style={{ display: "contents" }}><input placeholder="Full name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
      <input type="email" placeholder="Email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required />
      <label className="file">{pdf ? pdf.name : "Upload resume (PDF)"}<input type="file" accept="application/pdf" hidden onChange={e => pick(e.target.files[0])} /></label>
      {!pdf && <textarea rows="4" placeholder="Or paste your resume text" value={f.resume} onChange={e => setF({ ...f, resume: e.target.value })} />}
      {err && <p className="err">{err}</p>}<button className="btn" disabled={busy}>{busy ? "Sending..." : "Submit application"}</button></form></Wrap>;
}
