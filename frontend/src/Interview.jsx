import { useEffect, useRef, useState } from "react";
import { api } from "./App.jsx";
const wc = t => t.trim().split(/\s+/).filter(Boolean).length, mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const Wrap = ({ children }) => <div className="authwrap"><div className="authcard ivcard"><div className="brand"><span className="logo">H</span><div><b>HireFlow</b><small>AI interview</small></div></div>{children}</div></div>;
export default function Interview({ token }) {
  const [info, setInfo] = useState(null), [err, setErr] = useState(""), [agree, setAgree] = useState(false), [step, setStep] = useState(-1), [ans, setAns] = useState([]),
    [txt, setTxt] = useState(""), [listen, setListen] = useState(false), [done, setDone] = useState(false), [stream, setStream] = useState(null), [busy, setBusy] = useState(false),
    [t0, setT0] = useState(null), [off, setOff] = useState(0), [now, setNow] = useState(Date.now());
  const vid = useRef(), rec = useRef(), sent = useRef(false), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  useEffect(() => { api("/api/interview/" + token).then(d => { setInfo(d); setOff(d.serverNow - Date.now()); if (d.startedAt) setT0(d.startedAt); }).catch(e => setErr(e.message === "Failed to fetch" ? "Server is starting up. Refresh in about a minute." : e.message)); }, [token]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { if (stream && vid.current) vid.current.srcObject = stream; }, [stream, step]);
  const speak = t => { try { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } catch { /* no speech support */ } };
  const start = async () => { try { setStream(await navigator.mediaDevices.getUserMedia({ video: true })); } catch { /* camera is optional */ }
    try { const s = await api(`/api/interview/${token}/start`, { method: "POST" }); setT0(s.startedAt); setOff(s.serverNow - Date.now()); } catch (e) { return setErr(e.message); } setStep(0); speak(info.questions[0]); };
  const toggle = () => { if (listen) return rec.current.stop(); const r = new SR(); r.continuous = true; r.onresult = e => setTxt(t => (t + " " + [...e.results].slice(e.resultIndex).map(x => x[0].transcript).join(" ")).trim()); r.onend = () => setListen(false); r.start(); rec.current = r; setListen(true); };
  const left = info && t0 ? Math.max(0, info.minSeconds - (now + off - t0) / 1000) : info?.minSeconds, last = info && step + 1 === info.questions.length;
  const send = async (a, auto) => { setBusy(true); try { await api(`/api/interview/${token}/submit`, { method: "POST", body: { answers: a, auto } }); stream?.getTracks().forEach(t => t.stop()); setDone(true); } catch (e) { setErr(e.message); } setBusy(false); };
  const next = () => { rec.current?.stop(); speechSynthesis.cancel(); const a = [...ans, txt.trim()]; setAns(a); setTxt("");
    if (!last) { setStep(step + 1); speak(info.questions[step + 1]); return; } send(a, false); };
  // When the timer reaches zero the interview closes itself and submits whatever has been answered so far.
  useEffect(() => { if (step >= 0 && !done && !sent.current && left === 0) { sent.current = true; rec.current?.stop(); speechSynthesis.cancel(); send([...ans, txt.trim()], true); } });
  if (err) return <Wrap><p className="err">{err}</p></Wrap>;
  if (!info) return <Wrap><p className="muted">Loading your interview...</p></Wrap>;
  if (done) return <Wrap><h2>Interview submitted</h2><p>Thank you, {info.name}. You will hear from us by email.</p></Wrap>;
  if (step < 0) return <Wrap><h2>Hi {info.name}, welcome</h2><p>This is a hard interview for <b>{info.job}</b> with {info.questions.length} questions. It lasts {Math.round(info.minSeconds / 60)} minutes and closes by itself when the timer ends, submitting whatever you have answered. Answer as many questions as you can, with at least 15 words each, and explain your reasoning.</p>
    <label className="consent"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> I agree that my answers are converted to text and scored by AI on content only. No video is recorded or stored, and a recruiter can review the result.</label>
    <button className="btn" disabled={!agree} onClick={start}>{t0 ? "Continue interview" : "Start interview"}</button></Wrap>;
  const words = wc(txt), need = words < 15 ? `${15 - words} more word(s) needed` : last && left > 0 ? `The interview submits automatically when the timer ends.` : "";
  return <Wrap><div className="row2"><span className="muted">Question {step + 1} of {info.questions.length}</span><span className="chip">Time left {mmss(left)}</span></div><h2>{info.questions[step]}</h2>
    {stream && <video ref={vid} autoPlay muted playsInline className="selfview" />}
    <textarea rows="7" placeholder="Your answer appears here. You can also type." value={txt} onChange={e => setTxt(e.target.value)} />
    <div className="row2">{SR && <button className="btn alt" onClick={toggle}>{listen ? "Stop recording" : "Speak your answer"}</button>}<button className="btn alt" onClick={() => speak(info.questions[step])}>Hear question again</button></div>
    {need && <small>{need}</small>}
    <button className="btn" disabled={busy || words < 15 || (last && left > 0)} onClick={next}>{last ? (busy ? "Submitting..." : "Submit interview") : "Next question"}</button></Wrap>;
}