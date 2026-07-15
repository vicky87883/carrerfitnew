"use client";

import { ArrowLeft, ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import AppNav from "../../components/AppNav";
import { api } from "../../lib/api";
import type { AssessmentAnswers, CareerMatch } from "../../lib/types";

const questions = [
  { key: "interests", title: "What kind of work pulls you in?", hint: "Choose the area you would happily spend more time learning.", multiple: true, options: ["Data & insights", "Design & creativity", "People & communication", "Systems & operations"] },
  { key: "strengths", title: "Which strengths sound most like you?", hint: "Pick at least one. You can select several.", multiple: true, options: ["Analytical thinking", "Creative problem solving", "Clear communication", "Organizing complexity", "Customer empathy", "Fast tool adoption"] },
  { key: "workStyle", title: "How do you do your best work?", hint: "There is no wrong answer—we use this to improve role fit.", options: ["Independent and focused", "Collaborative and social", "Structured and predictable", "Fast-moving and varied"] },
  { key: "experience", title: "How much professional experience do you have?", hint: "Include internships and substantial freelance experience.", options: ["0", "1", "3", "5", "8"] },
  { key: "goal", title: "What would make this next move successful?", hint: "Pick the outcome that matters most right now.", options: ["Land my first role", "Switch to a better-fit career", "Grow into a senior role", "Return to work confidently"] },
] as const;

const initial: AssessmentAnswers = { interests: [], strengths: [], workStyle: "", experience: 0, goal: "" };
export default function AssessmentPage() {
  const [step, setStep] = useState(0); const [answers, setAnswers] = useState(initial); const [results, setResults] = useState<CareerMatch[] | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const question = questions[step]; const value = answers[question.key];
  const valid = Array.isArray(value) ? value.length > 0 : question.key === "experience" ? true : Boolean(value);
  function choose(option: string) {
    if (question.key === "interests" || question.key === "strengths") {
      const current = answers[question.key]; const next = current.includes(option) ? current.filter(x => x !== option) : question.key === "interests" ? [option] : [...current, option];
      setAnswers({ ...answers, [question.key]: next });
    } else setAnswers({ ...answers, [question.key]: question.key === "experience" ? Number(option) : option });
  }
  async function next() {
    if (step < questions.length - 1) return setStep(step + 1);
    setBusy(true); setError("");
    try { const data = await api<{ matches: CareerMatch[] }>("/api/assessment", { method: "POST", body: JSON.stringify(answers) }); setResults(data.matches); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not score assessment"); }
    finally { setBusy(false); }
  }
  if (results) return <main className="appShell"><AppNav light /><section className="resultPage"><span className="successIcon"><Sparkles /></span><span className="kicker">Your CarrerFit.com report</span><h1>Your clearest path is {results[0].role}.</h1><p>{results[0].summary}</p><div className="matchResults">{results.map((match, i) => <article key={match.role} className={i === 0 ? "topMatch" : ""}><div><span>#{i + 1} career match</span><strong>{match.score}%</strong></div><h2>{match.role}</h2><p>{match.summary}</p><h3>Skills to build</h3><div className="tagRow">{match.gaps.map(gap => <span key={gap}>{gap}</span>)}</div></article>)}</div><div className="resultActions"><Link href="/jobs">Explore matching jobs <ArrowRight size={17}/></Link><Link href="/dashboard">Open my dashboard</Link></div></section></main>;
  return <main className="assessmentShell"><AppNav /><section className="assessmentFlow"><div className="assessmentProgress"><span>Career assessment</span><strong>{step + 1} of {questions.length}</strong><i><b style={{ width: `${((step + 1) / questions.length) * 100}%` }} /></i></div><div className="questionCard"><span className="questionNumber">0{step + 1}</span><h1>{question.title}</h1><p>{question.hint}</p><div className="optionGrid">{question.options.map(option => { const selected = Array.isArray(value) ? value.includes(option as never) : String(value) === option; return <button className={selected ? "selected" : ""} onClick={() => choose(option)} key={option}><span>{selected && <Check size={17}/>}</span>{question.key === "experience" ? `${option} years${option === "8" ? "+" : ""}` : option}</button>; })}</div>{error && <p className="formError">{error}</p>}<div className="questionActions"><button disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={17}/> Back</button><button className="nextButton" disabled={!valid || busy} onClick={next}>{busy ? "Building your report…" : step === questions.length - 1 ? "See my matches" : "Continue"}<ArrowRight size={17}/></button></div></div></section></main>;
}
