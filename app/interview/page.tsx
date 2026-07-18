"use client";

import {
  ArrowRight, BarChart3, Camera, CameraOff, Check, ChevronRight, CircleAlert, Clock3,
  FileText, Lightbulb, LoaderCircle, Mic, MicOff, Play, RefreshCw, ShieldCheck,
  Sparkles, Square, Target, UploadCloud, UserRound, Video, Volume2, WandSparkles,
} from "lucide-react";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import AppNav from "../../components/AppNav";
import { api } from "../../lib/api";
import type {
  CameraMetrics, DashboardData, InterviewEvaluation, InterviewQuestion, InterviewReport,
  InterviewResponseResult, InterviewStartResult, InterviewTurn, ResumeProfile,
} from "../../lib/types";

type Mode = "setup" | "preparing" | "interview" | "feedback" | "report";

const emptyCamera: CameraMetrics = {
  cameraEnabled: false,
  faceDetectionSupported: false,
  facePresentRatio: 0,
  averageBrightness: 0,
  stabilityScore: 0,
};

export default function InterviewPage() {
  const [mode, setMode] = useState<Mode>("setup");
  const [resume, setResume] = useState<File | null>(null);
  const [savedProfile, setSavedProfile] = useState<ResumeProfile | null>(null);
  const [targetRole, setTargetRole] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [plan, setPlan] = useState<InterviewStartResult | null>(null);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<InterviewQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [latestEvaluation, setLatestEvaluation] = useState<InterviewEvaluation | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [turnNumber, setTurnNumber] = useState(1);
  const [recording, setRecording] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [cameraMetrics, setCameraMetrics] = useState<CameraMetrics>(emptyCamera);
  const [cameraError, setCameraError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const cameraSamples = useRef({ count: 0, face: 0, brightness: 0, movement: 0, previous: null as Uint8ClampedArray | null });

  useEffect(() => {
    let foundLocalProfile = false;
    try {
      const raw = sessionStorage.getItem("carrerfit_resume_profile");
      if (raw) {
        const profile = JSON.parse(raw) as ResumeProfile;
        foundLocalProfile = true;
        setSavedProfile(profile);
        setTargetRole(profile.targetRoles[0] || profile.headline);
      }
    } catch { sessionStorage.removeItem("carrerfit_resume_profile"); }
    if (!foundLocalProfile) api<DashboardData>("/api/dashboard").then((data) => {
      if (!data.resumeProfile) return;
      setSavedProfile(data.resumeProfile);
      setTargetRole(data.resumeProfile.targetRoles[0] || data.resumeProfile.headline);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!streamRef.current || !videoRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => undefined);
  }, [mode, cameraMetrics.cameraEnabled]);

  useEffect(() => {
    if (mode !== "interview" && mode !== "feedback") return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== "interview" || !question) return;
    const timer = window.setTimeout(() => speak(question.text), 350);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question?.id, mode]);

  useEffect(() => {
    if (!cameraMetrics.cameraEnabled || !streamRef.current || mode === "report") return;
    const detector = window.FaceDetector ? new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }) : null;
    setCameraMetrics((value) => ({ ...value, faceDetectionSupported: Boolean(detector) }));
    const timer = window.setInterval(async () => {
      const video = videoRef.current; const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let brightness = 0; let movement = 0; let pixelCount = 0;
      for (let index = 0; index < pixels.length; index += 16) {
        brightness += (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
        if (cameraSamples.current.previous) movement += Math.abs(pixels[index] - cameraSamples.current.previous[index]);
        pixelCount += 1;
      }
      let faceFound = false;
      if (detector) {
        try { faceFound = (await detector.detect(video)).length > 0; } catch { faceFound = false; }
      }
      const sample = cameraSamples.current;
      sample.count += 1; sample.face += faceFound ? 1 : 0;
      sample.brightness += brightness / Math.max(1, pixelCount);
      sample.movement += movement / Math.max(1, pixelCount);
      sample.previous = new Uint8ClampedArray(pixels);
      setCameraMetrics({
        cameraEnabled: true,
        faceDetectionSupported: Boolean(detector),
        facePresentRatio: detector ? Math.round((sample.face / sample.count) * 100) : 0,
        averageBrightness: Math.round(sample.brightness / sample.count),
        stabilityScore: Math.max(0, Math.round(100 - Math.min(100, (sample.movement / sample.count) * 3.2))),
      });
    }, 1200);
    return () => window.clearInterval(timer);
  }, [cameraMetrics.cameraEnabled, mode]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    speechSynthesis.cancel();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function chooseResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const valid = file.name.toLowerCase().endsWith(".pdf") || file.name.toLowerCase().endsWith(".docx");
    if (!valid) return setError("Choose a PDF or DOCX resume.");
    if (file.size > 8 * 1024 * 1024) return setError("Resume must be smaller than 8 MB.");
    setResume(file); setSavedProfile(null); setError("");
  }

  async function enableCamera() {
    setCameraError("");
    const policy = document.permissionsPolicy || document.featurePolicy;
    if (policy && !policy.allowsFeature("camera")) {
      setCameraError("Camera access is blocked by this browser window. Open CarrerFit in a normal HTTPS browser tab to use camera coaching.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access requires HTTPS or localhost in a supported browser. You can continue with voice-only practice.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 540 } }, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      cameraSamples.current = { count: 0, face: 0, brightness: 0, movement: 0, previous: null };
      setCameraMetrics({ ...emptyCamera, cameraEnabled: true });
      window.setTimeout(() => {
        if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play().catch(() => undefined); }
      }, 50);
    } catch (cause) {
      const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      setCameraError(denied ? "Camera permission was denied. Allow camera access in your browser settings, then try again." : "Camera access was not available. You can continue with voice-only practice.");
    }
  }

  function disableCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    cameraSamples.current = { count: 0, face: 0, brightness: 0, movement: 0, previous: null };
    setCameraMetrics(emptyCamera);
  }

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    utterance.voice = voices.find((voice) => voice.lang.startsWith("en") && /Samantha|Google|Natural|Daniel/i.test(voice.name)) || voices.find((voice) => voice.lang.startsWith("en")) || null;
    utterance.rate = 0.96; utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
  }, []);

  function toggleRecording() {
    if (recording) { recognitionRef.current?.stop(); setRecording(false); return; }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return setError("Live speech recognition is not supported in this browser. Type your answer below instead.");
    const policy = document.permissionsPolicy || document.featurePolicy;
    if (policy && !policy.allowsFeature("microphone")) return setError("Microphone access is blocked by this browser window. Open CarrerFit in a normal HTTPS browser tab or type your answer.");
    speechSynthesis.cancel(); setSpeaking(false); setError("");
    const recognition = new Recognition();
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
      setAnswer(transcript.trimStart());
    };
    recognition.onerror = (event) => { setRecording(false); if (event.error !== "aborted") setError("The microphone stopped listening. You can continue by typing."); };
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start(); setRecording(true);
  }

  async function startInterview() {
    if (!resume && !savedProfile) return setError("Upload your resume to create a tailored interview.");
    setError(""); setMode("preparing");
    const body = new FormData();
    if (resume) body.append("resume", resume);
    if (savedProfile) body.append("profile", JSON.stringify(savedProfile));
    body.append("targetRole", targetRole);
    body.append("questionCount", String(questionCount));
    try {
      const result = await api<InterviewStartResult>("/api/interview/start", { method: "POST", body });
      setPlan(result); setQuestion(result.firstQuestion); setTargetRole(result.targetRole);
      setTurns([]); setTurnNumber(1); setElapsed(0); setMode("interview");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The interview could not be prepared."); setMode("setup"); }
  }

  async function submitAnswer() {
    if (!plan || !question || answer.trim().length < 12) return setError("Give a fuller answer before continuing.");
    recognitionRef.current?.stop(); speechSynthesis.cancel(); setSpeaking(false);
    setSubmitting(true); setError("");
    try {
      const result = await api<InterviewResponseResult>("/api/interview/respond", {
        method: "POST",
        body: JSON.stringify({ profile: plan.profile, targetRole, question, answer: answer.trim(), turns, turnNumber, totalQuestions: plan.totalQuestions, camera: cameraMetrics }),
      });
      const completedTurn = { question, answer: answer.trim(), evaluation: result.evaluation };
      setTurns((items) => [...items, completedTurn]); setLatestEvaluation(result.evaluation);
      if (result.complete && result.report) {
        setReport(result.report); setMode("report");
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      } else {
        setPendingQuestion(result.nextQuestion); setMode("feedback");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your answer could not be evaluated."); }
    finally { setSubmitting(false); }
  }

  function continueInterview() {
    if (!pendingQuestion) return;
    setQuestion(pendingQuestion); setPendingQuestion(null); setAnswer(""); setLatestEvaluation(null);
    setTurnNumber((value) => value + 1); setMode("interview");
  }

  function restart() {
    setMode("setup"); setPlan(null); setQuestion(null); setPendingQuestion(null); setAnswer(""); setTurns([]);
    setLatestEvaluation(null); setReport(null); setTurnNumber(1); setElapsed(0); setError(""); disableCamera();
  }

  if (mode === "preparing") return <main className="interviewShell"><AppNav/><section className="interviewPreparing"><div className="interviewLoader"><span><WandSparkles/></span><i/><i/></div><b>Building your interview</b><h1>Turning your resume into a realistic conversation.</h1><p>Mapping evidence, selecting role-specific questions, and calibrating the interview depth.</p><div><span><Check/> Reading career evidence</span><span><LoaderCircle className="spin"/> Preparing adaptive follow-ups</span></div></section></main>;

  if (mode === "report" && report) return <main className="interviewReportShell"><AppNav light/><section className="reportHero"><div><span><Sparkles/> Interview complete</span><h1>Your practice report is ready.</h1><p>{report.summary}</p></div><div className="reportScore"><strong>{report.overallScore}</strong><span>/100</span><small>{report.verdict}</small></div></section><section className="reportWorkspace"><div className="dimensionPanel"><div className="reportSectionHeading"><span>Performance breakdown</span><h2>Where your interview stands</h2></div><div className="dimensionGrid">{report.dimensions.map((item) => <article key={item.name}><div><strong>{item.name}</strong><b>{item.score}</b></div><progress max="100" value={item.score}/><p>{item.note}</p></article>)}</div></div><aside className="cameraReport"><span><Video/> Delivery signals</span><h3>{cameraMetrics.cameraEnabled ? "Camera coaching captured" : "Voice-only session"}</h3><div><p><b>{cameraMetrics.faceDetectionSupported ? `${cameraMetrics.facePresentRatio}%` : "—"}</b>Face in frame</p><p><b>{cameraMetrics.cameraEnabled ? `${cameraMetrics.stabilityScore}%` : "—"}</b>Movement stability</p><p><b>{cameraMetrics.cameraEnabled ? (cameraMetrics.averageBrightness > 70 ? "Good" : "Low") : "—"}</b>Lighting</p></div><small><ShieldCheck/> Calculated on your device. No image or video was uploaded.</small></aside><div className="coachingColumns"><article><span className="positive"><Check/> What worked</span><ul>{report.strengths.map((item) => <li key={item}>{item}</li>)}</ul></article><article><span className="improve"><Lightbulb/> Improve next</span><ul>{report.improvements.map((item) => <li key={item}>{item}</li>)}</ul></article></div><div className="modelAnswer"><span>Coach’s rewrite</span><h2>A stronger answer pattern</h2><p>{report.modelAnswer}</p></div><div className="nextPractice"><div><span>Next practice plan</span><h2>Turn feedback into confidence.</h2></div><ol>{report.nextSteps.map((item, index) => <li key={item}><b>{index + 1}</b>{item}</li>)}</ol><button onClick={restart}><RefreshCw/> Practice again</button></div></section></main>;

  if ((mode === "interview" || mode === "feedback") && plan && question) return <main className="interviewRoom"><AppNav/><section className="roomTopbar"><div><span className="liveDot"/> AI mock interview <b>{plan.aiPowered ? "Groq powered" : "Practice mode"}</b></div><div><span><Clock3/>{formatTime(elapsed)}</span><span>Question {turnNumber} of {plan.totalQuestions}</span></div></section><section className="roomGrid"><div className="videoStage"><video ref={videoRef} autoPlay muted playsInline className={cameraMetrics.cameraEnabled ? "" : "cameraHidden"}/><canvas ref={canvasRef} width="64" height="48" hidden/>{!cameraMetrics.cameraEnabled && <div className="cameraPlaceholder"><span><UserRound/></span><h2>Camera coaching is off</h2><p>Enable it for private framing, lighting, and movement feedback.</p><button onClick={enableCamera}><Camera/> Enable camera</button></div>}<div className="videoOverlay"><span>{cameraMetrics.cameraEnabled ? <><span className="liveDot"/> Camera on</> : <><CameraOff/> Voice only</>}</span>{cameraMetrics.cameraEnabled && <button onClick={disableCamera}><CameraOff/> Turn off</button>}</div>{cameraMetrics.cameraEnabled && <div className="cameraSignals"><span className={cameraMetrics.averageBrightness > 70 ? "good" : "warn"}>{cameraMetrics.averageBrightness > 70 ? "Lighting good" : "Add more light"}</span><span>{cameraMetrics.faceDetectionSupported ? `${cameraMetrics.facePresentRatio}% in frame` : "Private motion check"}</span><span>{cameraMetrics.stabilityScore}% stable</span></div>}</div><aside className="interviewSide"><div className="interviewerIdentity"><span><Sparkles/></span><div><strong>Nova</strong><small>CarrerFit AI interviewer</small></div><i className={speaking ? "speaking" : ""}/></div><div className="questionMeta"><span>{question.category}</span><small>{question.intent}</small></div><h1>{question.text}</h1><button className="replayQuestion" onClick={() => speak(question.text)} disabled={speaking}><Volume2/> {speaking ? "Speaking…" : "Replay question"}</button><div className="focusChips">{plan.focusAreas.map((area) => <span key={area}>{area}</span>)}</div></aside></section>{mode === "interview" ? <section className="answerDock"><div className="answerHeader"><div><span className={recording ? "recordingPulse" : ""}><Mic/></span><div><strong>{recording ? "Listening to your answer…" : "Your answer"}</strong><small>{recording ? "Speak naturally. You can edit the transcript." : "Use the microphone or type your response."}</small></div></div><button className={recording ? "stopRecording" : "startRecording"} onClick={toggleRecording}>{recording ? <><Square/> Stop</> : <><Mic/> Start speaking</>}</button></div><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Your live transcript will appear here. You can also type your answer…"/><div className="answerFooter"><span>{answer.trim() ? `${answer.trim().split(/\s+/).length} words` : "Aim for 60–120 seconds"}</span><button onClick={submitAnswer} disabled={submitting || answer.trim().length < 12}>{submitting ? <><LoaderCircle className="spin"/> Evaluating answer</> : <>Submit answer <ArrowRight/></>}</button></div>{error && <p className="interviewError"><CircleAlert/>{error}</p>}</section> : latestEvaluation && <section className="feedbackDock"><div className="feedbackScore"><strong>{latestEvaluation.score}</strong><span>/100</span></div><div className="feedbackMain"><span>Instant coaching</span><h2>{latestEvaluation.feedback}</h2><div><p><Check/><span><b>Strong point</b>{latestEvaluation.strongPoint}</span></p><p><Lightbulb/><span><b>Improve</b>{latestEvaluation.improvement}</span></p></div><small><Target/> {latestEvaluation.suggestedStructure}</small></div><button onClick={continueInterview}>Next question <ChevronRight/></button></section>}</main>;

  return <main className="interviewShell"><AppNav/><section className="interviewSetup"><div className="setupCopy"><span className="interviewEyebrow"><Sparkles/> Resume-aware interview practice</span><h1>Practice the interview, not a script.</h1><p>Nova reads your career evidence, asks role-specific questions aloud, listens to your answers, and adapts every follow-up in real time.</p><div className="interviewCapabilities"><article><span><Mic/></span><div><strong>Natural voice conversation</strong><p>Spoken questions, live transcription, and editable answers.</p></div></article><article><span><Target/></span><div><strong>Deep resume follow-ups</strong><p>Questions probe your actual projects, impact, gaps, and target role.</p></div></article><article><span><Camera/></span><div><strong>Private delivery coaching</strong><p>Optional on-device framing, lighting, and movement signals.</p></div></article></div></div><div className="setupCard"><div className="setupCardTop"><span><Video/></span><div><small>AI INTERVIEW STUDIO</small><strong>Configure your practice round</strong></div></div>{savedProfile ? <div className="profileReady"><span>{savedProfile.name.slice(0, 1).toUpperCase()}</span><div><strong>{savedProfile.name}&apos;s resume profile is ready</strong><small>{savedProfile.headline} · {savedProfile.skills.slice(0, 3).join(" · ")}</small></div><button onClick={() => { setSavedProfile(null); sessionStorage.removeItem("carrerfit_resume_profile"); }}>Change</button></div> : <button className="interviewUpload" onClick={() => inputRef.current?.click()}><input ref={inputRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={chooseResume}/>{resume ? <><FileText/><span><strong>{resume.name}</strong><small>{(resume.size / 1024 / 1024).toFixed(2)} MB · Ready</small></span><Check/></> : <><UploadCloud/><span><strong>Upload your resume</strong><small>PDF or DOCX · Maximum 8 MB</small></span><ArrowRight/></>}</button>}<label className="setupField"><span>Target role</span><input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="e.g. Senior Product Designer"/></label><label className="setupField"><span>Interview depth</span><select value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))}><option value="3">Quick warm-up · 3 questions</option><option value="5">Focused practice · 5 questions</option><option value="7">Full interview · 7 questions</option><option value="10">Deep practice · 10 questions</option></select></label><div className="cameraConsent"><div className="cameraPreview"><video ref={videoRef} autoPlay muted playsInline/>{!cameraMetrics.cameraEnabled && <CameraOff/>}</div><div><strong>Camera coaching <i>Optional</i></strong><p>Frames stay on this device and are never recorded or uploaded.</p></div><button onClick={cameraMetrics.cameraEnabled ? disableCamera : enableCamera}>{cameraMetrics.cameraEnabled ? "Disable" : "Enable"}</button></div>{cameraError && <p className="setupNotice">{cameraError}</p>}{error && <p className="interviewError"><CircleAlert/>{error}</p>}<button className="beginInterview" onClick={startInterview} disabled={!resume && !savedProfile}>Begin AI interview <Play/></button><p className="setupPrivacy"><ShieldCheck/> Resume text is processed in memory. Practice is for coaching—not hiring decisions.</p></div></section><section className="interviewProof"><div><b>01</b><span><strong>Questions from your evidence</strong><p>No generic list recycled for every candidate.</p></span></div><div><b>02</b><span><strong>Adaptive answer depth</strong><p>Follow-ups change based on what you actually say.</p></span></div><div><b>03</b><span><strong>Actionable final report</strong><p>Scores, rewrites, delivery signals, and a practice plan.</p></span></div></section></main>;
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
