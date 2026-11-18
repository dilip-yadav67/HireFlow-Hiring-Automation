import "dotenv/config";
import express from "express"; import cors from "cors"; import mongoose from "mongoose";
import crypto from "crypto"; import nodemailer from "nodemailer"; import pdf from "pdf-parse/lib/pdf-parse.js"; import bcrypt from "bcryptjs"; import jwt from "jsonwebtoken";
const app = express(); app.use(cors({ origin: process.env.CLIENT_URL || "*" })); app.use(express.json({ limit: "8mb" }));
const S = mongoose.Schema, M = (n, s) => mongoose.model(n, new S(s, { timestamps: true }));
const User = M("User", { name: String, email: { type: String, unique: true }, password: String });
const Job = M("Job", { owner: S.Types.ObjectId, title: String, skills: [String], openings: Number, shortlistLimit: Number, cutoff: { type: Number, default: 70 }, status: { type: String, default: "open" } });
const App = M("App", { owner: S.Types.ObjectId, job: { type: S.Types.ObjectId, ref: "Job" }, name: String, email: String, resume: String, score: Number, status: { type: String, default: "applied" }, token: String, questions: [String], answers: [{ q: String, a: String }], interviewScore: Number, finalScore: Number, startedAt: Date, durationSec: Number, shortlistedAt: Date, remindedAt: Date, manual: Boolean });
const Log = M("Log", { owner: S.Types.ObjectId, text: String, kind: String });
const auth = (req, res, next) => { try { req.uid = jwt.verify((req.headers.authorization || "").slice(7), process.env.JWT_SECRET).id; next(); } catch { res.status(401).json({ error: "Please log in again." }); } };
const token = u => ({ token: jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: "7d" }), name: u.name });
const wrap = f => (q, r) => f(q, r).catch(e => r.status(e.code >= 400 && e.code < 500 ? e.code : 500).json({ error: e.message }));

app.get("/", (_, r) => r.json({ ok: true })); // point your uptime pinger here
app.post("/api/auth/register", wrap(async (q, r) => { const { name, email, password } = q.body;
  if (!name || !email || (password || "").length < 6) return r.status(400).json({ error: "Name, email and a 6+ character password are required." });
  if (await User.findOne({ email })) return r.status(409).json({ error: "This email is already registered." });
  r.json(token(await User.create({ name, email, password: await bcrypt.hash(password, 10) }))); }));
app.post("/api/auth/login", wrap(async (q, r) => { const u = await User.findOne({ email: q.body.email });
  if (!u || !(await bcrypt.compare(q.body.password || "", u.password))) return r.status(401).json({ error: "Wrong email or password." }); r.json(token(u)); }));

async function gemini(prompt) {
  const k = process.env.GEMINI_API_KEY; if (!k) return null;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${k}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
  const d = await res.json(); return d?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}
async function scoreResume(job, resume) {
  const kw = Math.round(100 * job.skills.filter(s => resume.toLowerCase().includes(s.toLowerCase())).length / (job.skills.length || 1));
  try { const t = await gemini(`Rate 0-100 how well this resume fits the job "${job.title}" needing skills ${job.skills.join(", ")}. Judge only skills and experience. Reply with the number only.\n\n${resume.slice(0, 6000)}`);
    const n = parseInt((t || "").match(/\d+/)?.[0]); return Number.isFinite(n) ? Math.min(n, 100) : kw; } catch { return kw; }
}
// Selection: score >= cutoff and within shortlist limit => shortlisted, else rejected. Recruiter can override via PATCH.
const MAIL = {
  shortlisted: (a, x) => [`You're shortlisted for ${x.job}`, `Hi ${a.name},\n\nYou have been shortlisted for ${x.job}. Take your AI interview here (camera optional). The link expires in ${DEADLINE_H} hours, so please finish before then:\n${x.link}\n\nHireFlow`],
  hired: (a, x) => [`Offer: ${x.job}`, `Hi ${a.name},\n\nCongratulations! You have been selected for ${x.job}. We will contact you with the offer details.\n\nHireFlow`],
  rejected: (a, x) => [`Update on ${x.job}`, `Hi ${a.name},\n\nThank you for your time. We will not move forward for ${x.job} this time, and we wish you the best.\n\nHireFlow`] };
// Emails: forwarded to an n8n webhook if N8N_WEBHOOK_URL is set, otherwise sent directly through Resend.
async function notify(event, a, x) {
  const [subject, text] = MAIL[event](a, x), J = { "Content-Type": "application/json" }, E = process.env;
  const check = async (r, n) => { if (!r.ok) throw new Error(`${n} ${r.status}: ${(await r.text()).slice(0, 100)}`); };
  try {
    if (E.N8N_WEBHOOK_URL) await check(await fetch(E.N8N_WEBHOOK_URL, { method: "POST", headers: J, body: JSON.stringify({ event, to: a.email, name: a.name, subject, text, ...x }) }), "n8n");
    else if (E.BREVO_API_KEY) await check(await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { ...J, "api-key": E.BREVO_API_KEY }, body: JSON.stringify({ sender: { name: "HireFlow", email: E.MAIL_FROM_EMAIL }, to: [{ email: a.email, name: a.name }], subject, textContent: text }) }), "Brevo");
    else if (E.SMTP_USER && E.SMTP_PASS) await nodemailer.createTransport({ service: "gmail", auth: { user: E.SMTP_USER, pass: E.SMTP_PASS } }).sendMail({ from: `HireFlow <${E.SMTP_USER}>`, to: a.email, subject, text });
    else if (E.RESEND_API_KEY) await check(await fetch("https://api.resend.com/emails", { method: "POST", headers: { ...J, Authorization: "Bearer " + E.RESEND_API_KEY }, body: JSON.stringify({ from: E.MAIL_FROM || "HireFlow <onboarding@resend.dev>", to: a.email, subject, text }) }), "Resend");
    else throw new Error("no email service set up in backend/.env");
    await Log.create({ owner: a.owner, text: `Email sent to ${a.name}: ${subject}`, kind: "mail" }); return true;
  } catch (e) { console.error("mail failed:", e.message); await Log.create({ owner: a.owner, text: `Email to ${a.name} failed: ${e.message}`.slice(0, 170), kind: "mail" }); return false; }
}
async function runSelection(job) {
  const apps = await App.find({ job: job._id, status: { $in: ["applied", "shortlisted", "rejected"] }, manual: { $ne: true } }).sort({ score: -1 });
  for (const [i, a] of apps.entries()) { const was = a.status; a.status = a.score >= job.cutoff && i < (job.shortlistLimit || job.openings * 3) ? "shortlisted" : "rejected";
    if (a.status === "shortlisted" && !a.token) a.token = crypto.randomBytes(16).toString("hex"); if (a.status === "shortlisted" && was !== "shortlisted") a.shortlistedAt = new Date(); await a.save();
    if (a.status === "shortlisted" && was !== "shortlisted") { await Log.create({ owner: job.owner, text: `${a.name} moved to screening`, kind: "screen" }); await notify("shortlisted", a, { job: job.title, link: `${process.env.CLIENT_URL || ""}/#/interview/${a.token}` }); } }
}
// When nobody is waiting for an interview, the best finalScores (40% resume, 60% interview) up to "openings" are hired, the rest rejected, and the job closes.
async function finalize(job) {
  if (await App.countDocuments({ job: job._id, status: "shortlisted" })) return;
  const done = await App.find({ job: job._id, status: "interviewed" }).sort({ finalScore: -1 });
  for (const [i, a] of done.entries()) { a.status = i < job.openings ? "hired" : "rejected"; await a.save(); await notify(a.status, a, { job: job.title }); }
  if (done.length) { job.status = "closed"; await job.save(); }
}
app.post("/api/jobs", auth, wrap(async (q, r) => { const b = q.body;
  const j = await Job.create({ owner: q.uid, title: b.title, skills: (b.skills || []).map(s => s.trim()).filter(Boolean), openings: +b.openings || 1, shortlistLimit: +b.shortlistLimit || 0, cutoff: +b.cutoff || 70 });
  await Log.create({ owner: q.uid, text: "New job published", kind: "job" }); r.json(j); }));
app.get("/api/jobs", auth, wrap(async (q, r) => r.json(await Job.find({ owner: q.uid }).sort("-createdAt"))));
app.post("/api/jobs/:id/apply", auth, wrap(async (q, r) => { const job = await Job.findOne({ _id: q.params.id, owner: q.uid });
  if (!job) return r.status(404).json({ error: "Job not found." }); r.json(await addApplication(job, q.body)); }));
app.get("/api/applications", auth, wrap(async (q, r) => r.json(await App.find({ owner: q.uid }).select("-resume").populate("job", "title").sort("-score"))));
app.patch("/api/applications/:id", auth, wrap(async (q, r) => { const st = q.body.status, upd = { status: st, manual: true };
  if (st === "shortlisted") Object.assign(upd, { token: crypto.randomBytes(16).toString("hex"), shortlistedAt: new Date() });
  const a = await App.findOneAndUpdate({ _id: q.params.id, owner: q.uid }, upd, { new: true }).populate("job");
  if (!a) return r.status(404).json({ error: "Candidate not found." });
  if (st === "shortlisted") { await Log.create({ owner: q.uid, text: `${a.name} moved to screening`, kind: "screen" }); await notify("shortlisted", a, { job: a.job.title, link: `${process.env.CLIENT_URL || ""}/#/interview/${a.token}` }); }
  else if (st === "hired" || st === "rejected") await notify(st, a, { job: a.job.title });
  r.json(a); }));
app.get("/api/dashboard", auth, wrap(async (q, r) => { const o = q.uid, c = s => App.countDocuments({ owner: o, status: s });
  const [total, shortlisted, interviewed, offers, hired, applied] = await Promise.all([App.countDocuments({ owner: o }), c("shortlisted"), c("interviewed"), c("offer"), c("hired"), c("applied")]);
  const since = new Date(Date.now() - 30 * 864e5), series = await App.aggregate([{ $match: { owner: new mongoose.Types.ObjectId(o), createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: "%m-%d", date: "$createdAt" } }, n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  r.json({ total, shortlisted, interviewed, offers, hired, screened: total - applied, series, logs: await Log.find({ owner: o }).sort("-createdAt").limit(4),
    upcoming: await App.find({ owner: o, status: "shortlisted" }).limit(3).populate("job", "title") }); }));
app.post("/api/ai/chat", auth, wrap(async (q, r) => { const [apps, jobs] = await Promise.all([App.find({ owner: q.uid }).sort("-score").limit(10).select("name score status"), Job.find({ owner: q.uid }).select("title skills openings")]);
  const t = await gemini(`You are HireFlow's recruitment copilot. Be brief. Jobs: ${JSON.stringify(jobs)}. Top candidates: ${JSON.stringify(apps)}.\nUser: ${q.body.message}`);
  r.json({ reply: t || "AI is not configured yet. Add GEMINI_API_KEY on the server." }); }));

// Public interview endpoints (the secret token in the link is the access key)
app.get("/api/interview/:token", wrap(async (q, r) => { const a = await App.findOne({ token: q.params.token }).populate("job", "title skills");
  if (!a) return r.status(404).json({ error: "This interview link is not valid." });
  if (a.status !== "shortlisted") return r.status(410).json({ error: "This interview is not open. It may already be completed." });
  if (expired(a)) { await expire(a); return gone(r); }
  if (!a.questions.length) { a.questions = await makeQuestions(a.job); await a.save(); }
  r.json({ name: a.name, job: a.job.title, questions: a.questions, minSeconds: MIN_SECONDS, startedAt: a.startedAt?.getTime() || null, serverNow: Date.now() }); }));
app.post("/api/interview/:token/submit", wrap(async (q, r) => { const a = await App.findOne({ token: q.params.token, status: "shortlisted" }).populate("job");
  if (!a) return r.status(404).json({ error: "Interview not available." });
  if (expired(a)) { await expire(a); return gone(r); }
  const secs = a.startedAt ? (Date.now() - a.startedAt) / 1000 : 0;
  if (secs < MIN_SECONDS - 5) return r.status(400).json({ error: `The interview must last at least 10 minutes. About ${Math.ceil((MIN_SECONDS - secs) / 60)} minute(s) left.` });
  if (!q.body.auto && ((q.body.answers || []).length < a.questions.length || q.body.answers.some(x => String(x || "").trim().split(/\s+/).length < 15))) return r.status(400).json({ error: "Answer every question with at least 15 words." });
  a.durationSec = Math.round(secs);
  a.answers = a.questions.map((qq, i) => ({ q: qq, a: String((q.body.answers || [])[i] || "").slice(0, 3000) }));
  a.interviewScore = await scoreInterview(a.job, a.answers); a.finalScore = Math.round(0.4 * a.score + 0.6 * a.interviewScore); a.status = "interviewed"; await a.save();
  await Log.create({ owner: a.owner, text: `${a.name} completed the AI interview`, kind: "interview" }); await finalize(a.job); r.json({ ok: true }); }));

const MIN_SECONDS = (+process.env.INTERVIEW_MINUTES || 10) * 60, REMIND_H = +process.env.REMIND_HOURS || 12, DEADLINE_H = +process.env.INTERVIEW_DEADLINE_HOURS || 24;
MAIL.reminder = (a, x) => [`Reminder: your ${x.job} interview`, `Hi ${a.name},\n\nYour AI interview for ${x.job} is still waiting. It takes 10 minutes and the link expires in ${DEADLINE_H} hours from when you were shortlisted:\n${x.link}\n\nHireFlow`];
MAIL.expired = (a, x) => [`Interview window closed: ${x.job}`, `Hi ${a.name},\n\nThe interview window for ${x.job} has closed, so we cannot continue with your application. Thank you for your interest.\n\nHireFlow`];
async function makeQuestions(job) {
  const fallback = [...job.skills.slice(0, 4).map(s => `Describe a hard production problem involving ${s}. How did you find the root cause, fix it, and stop it from happening again?`),
    "Design a system for this role's main product feature that must handle ten times today's traffic. Which trade-offs would you make and why?",
    "A teammate's code passes tests but fails randomly in production. Walk through exactly how you would investigate.",
    "Which edge cases and performance limits do you check before shipping a feature in this role?", "Tell me about a technical decision you made that turned out wrong, and what you learned."];
  try { const t = await gemini(`Write 8 hard interview questions for a ${job.title} role needing ${job.skills.join(", ")}. Mix: 2 deep conceptual, 3 scenario or debugging questions with concrete constraints, 2 system design or trade-off questions, 1 about edge cases and performance. Each needs a multi-sentence answer. Reply with only a JSON array of 8 strings.`);
    const arr = JSON.parse(t.match(/\[[\s\S]*\]/)[0]); return arr.length >= 5 ? arr.slice(0, 10).map(String) : fallback; } catch { return fallback; }
}
async function scoreInterview(job, answers) {
  if (!answers.some(x => x.a.trim())) return 0;
  const words = answers.reduce((n, x) => n + x.a.split(/\s+/).filter(Boolean).length, 0), fb = Math.min(80, Math.round(words / answers.length));
  try { const t = await gemini(`You are a strict grader of a ${job.title} interview. 50 is an average answer; give 80+ only for accurate, specific, well-reasoned answers; penalize vague, generic or wrong answers. Judge only technical quality, relevance and clarity. Ignore accent, grammar slips and speech style. Reply with the number only.\n${answers.map(x => `Q: ${x.q}\nA: ${x.a}`).join("\n")}`);
    const n = parseInt((t || "").match(/\d+/)?.[0]); return Number.isFinite(n) ? Math.min(n, 100) : fb; } catch { return fb; }
}
async function addApplication(job, b) {
  const bad = (m, code) => Object.assign(new Error(m), { code });
  if (job.status !== "open") throw bad("This job is closed.", 400);
  let text = b.resume || ""; if (b.resumePdf) text = (await pdf(Buffer.from(b.resumePdf, "base64"))).text;
  if (!b.name || !b.email || text.trim().length < 30) throw bad("Name, email and a readable resume (PDF or pasted text) are required.", 400);
  const email = String(b.email).toLowerCase();
  if (await App.findOne({ job: job._id, email })) throw bad("You have already applied to this job.", 409);
  const a = await App.create({ owner: job.owner, job: job._id, name: b.name, email, resume: text, score: await scoreResume(job, text) });
  await runSelection(job); await Log.create({ owner: job.owner, text: "New application received", kind: "app" }); return App.findById(a._id).select("-resume");
}
// Automation: every 15 minutes remind candidates who have not interviewed, and reject (then finalize) those past the deadline.
// A link is valid for DEADLINE_H hours after shortlisting. An interview already in progress is allowed to finish.
const expired = a => a.status === "shortlisted" && a.shortlistedAt && Date.now() - a.shortlistedAt > DEADLINE_H * 36e5 && (!a.startedAt || Date.now() - a.startedAt > (MIN_SECONDS + 300) * 1000);
const gone = r => r.status(410).json({ error: `This interview link has expired. Links are valid for ${DEADLINE_H} hours after you are shortlisted.` });
async function expire(a) { a.status = "rejected"; await a.save(); await notify("expired", a, { job: a.job.title }); await finalize(a.job); }
async function sweep() {
  const ago = h => new Date(Date.now() - h * 36e5), link = a => `${process.env.CLIENT_URL || ""}/#/interview/${a.token}`;
  for (const a of await App.find({ status: "shortlisted", shortlistedAt: { $lt: ago(REMIND_H) }, remindedAt: null }).populate("job")) { await notify("reminder", a, { job: a.job.title, link: link(a) }); a.remindedAt = new Date(); await a.save(); }
  for (const a of await App.find({ status: "shortlisted", shortlistedAt: { $lt: ago(DEADLINE_H) } }).populate("job")) if (expired(a)) await expire(a);
}
setInterval(() => sweep().catch(e => console.error("sweep failed", e.message)), 15 * 60 * 1000);

app.post("/api/interview/:token/start", wrap(async (q, r) => { const a = await App.findOne({ token: q.params.token, status: "shortlisted" }).populate("job");
  if (!a) return r.status(404).json({ error: "Interview not available." });
  if (expired(a)) { await expire(a); return gone(r); }
  if (!a.startedAt) { a.startedAt = new Date(); await a.save(); } r.json({ startedAt: a.startedAt.getTime(), serverNow: Date.now() }); }));
app.get("/api/public/job/:id", wrap(async (q, r) => { const j = await Job.findById(q.params.id).catch(() => null);
  if (!j || j.status !== "open") return r.status(404).json({ error: "This job is not accepting applications." }); r.json({ title: j.title, skills: j.skills }); }));
app.post("/api/public/job/:id/apply", wrap(async (q, r) => { const j = await Job.findById(q.params.id).catch(() => null);
  if (!j) return r.status(404).json({ error: "Job not found." }); await addApplication(j, q.body); r.json({ ok: true }); }));

MAIL.test = a => ["HireFlow test email", `Hi ${a.name},\n\nThis is a test email from HireFlow. Your email setup works.\n\nHireFlow`];
app.get("/api/search", auth, wrap(async (q, r) => { const t = String(q.query.q || "").trim().slice(0, 40); if (!t) return r.json({ candidates: [], jobs: [] });
  const rx = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const [candidates, jobs] = await Promise.all([App.find({ owner: q.uid, $or: [{ name: rx }, { email: rx }] }).select("name email status").limit(5), Job.find({ owner: q.uid, $or: [{ title: rx }, { skills: rx }] }).select("title status").limit(5)]);
  r.json({ candidates, jobs }); }));
app.get("/api/notifications", auth, wrap(async (q, r) => r.json(await Log.find({ owner: q.uid }).sort("-createdAt").limit(15))));
app.get("/api/me", auth, wrap(async (q, r) => { const u = await User.findById(q.uid).select("name email"), E = process.env;
  r.json({ name: u.name, email: u.email, email_via: E.N8N_WEBHOOK_URL ? "n8n" : E.BREVO_API_KEY ? "Brevo" : E.SMTP_USER && E.SMTP_PASS ? "Gmail SMTP" : E.RESEND_API_KEY ? "Resend" : null,
    ai: !!E.GEMINI_API_KEY, interviewMinutes: MIN_SECONDS / 60, remindHours: REMIND_H, deadlineHours: DEADLINE_H }); }));
app.post("/api/test-email", auth, wrap(async (q, r) => { const u = await User.findById(q.uid); r.json({ ok: await notify("test", { name: u.name, email: u.email, owner: u._id }, {}) }); }));
app.get("/api/analytics", auth, wrap(async (q, r) => { const apps = await App.find({ owner: q.uid }).select("job score interviewScore status").populate("job", "title"), by = {}, jobs = {};
  for (const a of apps) { by[a.status] = (by[a.status] || 0) + 1; const t = a.job?.title || "Deleted job", j = (jobs[t] ||= { title: t, applications: 0, shortlisted: 0, hired: 0, sum: 0 });
    j.applications++; j.sum += a.score || 0; if (["shortlisted", "interviewed", "hired"].includes(a.status)) j.shortlisted++; if (a.status === "hired") j.hired++; }
  const avg = k => { const v = apps.filter(a => a[k] != null); return v.length ? Math.round(v.reduce((n, a) => n + a[k], 0) / v.length) : 0; };
  r.json({ total: apps.length, byStatus: by, avgResume: avg("score"), avgInterview: avg("interviewScore"), jobs: Object.values(jobs).map(j => ({ ...j, avg: Math.round(j.sum / j.applications) })) }); }));

await mongoose.connect(process.env.MONGODB_URI);
app.listen(process.env.PORT || 4000, () => console.log("API ready"));