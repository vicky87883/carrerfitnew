"use client";

import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Compass,
  FileText,
  Layers3,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const roles = [
  { title: "Product Analyst", company: "BrightLoop", score: 96, salary: "₹18–28L", skills: ["SQL", "Analytics", "AI workflows"] },
  { title: "Growth Data Analyst", company: "Arclight", score: 94, salary: "₹16–25L", skills: ["Python", "Experiments", "Tableau"] },
  { title: "RevOps Specialist", company: "CloudMint", score: 91, salary: "₹14–22L", skills: ["Salesforce", "Automation", "Ops"] },
];

const steps = [
  { icon: FileText, number: "01", title: "Tell us where you are", copy: "A focused assessment maps your experience, strengths, working style, and ambitions." },
  { icon: Layers3, number: "02", title: "See your strongest paths", copy: "We rank realistic career directions against your profile and current market demand." },
  { icon: TrendingUp, number: "03", title: "Build proof, then apply", copy: "Close skill gaps with a clear plan and focus your effort on roles worth pursuing." },
];

export default function Home() {
  const [activeRole, setActiveRole] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const role = roles[activeRole];

  return (
    <main className="modernHome">
      <section className="modernHero">
        <nav className="modernNav">
          <Link className="modernBrand" href="/"><span><Target size={20} /></span>CarrerFit.com</Link>
          <button className="modernMenu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</button>
          <div className={menuOpen ? "modernLinks isOpen" : "modernLinks"}>
            <Link href="/resume">AI resume match</Link>
            <Link href="/jobs">Explore jobs</Link>
            <Link href="/dashboard">My dashboard</Link>
          </div>
          <Link className="modernNavCta" href="/resume">Match my resume <ArrowRight size={15} /></Link>
        </nav>

        <div className="heroNoise" />
        <div className="modernHeroGrid">
          <div className="modernHeroCopy">
            <span className="modernEyebrow"><Sparkles size={14} /> Career intelligence, built around you</span>
            <h1>Make your next career move the <em>right</em> one.</h1>
            <p>CarrerFit.com turns your experience and ambitions into a clear career direction, a focused skill plan, and job matches you can act on.</p>
            <div className="modernActions">
              <Link href="/resume">Match my resume <ArrowRight size={18}/></Link>
              <Link href="/jobs">Browse live roles</Link>
            </div>
            <div className="trustRow">
              <div><span className="miniAvatars"><i>AK</i><i>NS</i><i>RM</i></span><strong>4.9/5</strong></div>
              <p>Trusted by 12,000+ professionals navigating their next move.</p>
            </div>
          </div>

          <div className="productStage" aria-label="CarrerFit.com product preview">
            <div className="stageGlow" />
            <div className="productWindow">
              <div className="windowBar"><span><i/><i/><i/></span><small>carrerfit.com / matches</small><ShieldCheck size={15}/></div>
              <div className="windowBody">
                <aside className="mockSidebar"><span className="mockLogo"><Target/></span>{[Compass, Search, BriefcaseBusiness, BarChart3].map((Icon, index) => <i className={index === 1 ? "active" : ""} key={index}><Icon /></i>)}</aside>
                <div className="mockContent">
                  <div className="mockHeader"><div><small>YOUR CAREER DIRECTION</small><h2>Top matches</h2></div><span>Updated today</span></div>
                  <div className="roleTabs">{roles.map((item, index) => <button className={activeRole === index ? "active" : ""} onClick={() => setActiveRole(index)} key={item.title}>{index + 1}</button>)}</div>
                  <div className="fitReport">
                    <div className="fitTop"><div><span className="companyMonogram">{role.company.slice(0,2).toUpperCase()}</span><div><small>BEST-FIT ROLE</small><h3>{role.title}</h3><p>{role.company} · Bengaluru</p></div></div><div className="fitScore"><strong>{role.score}</strong><span>% fit</span></div></div>
                    <div className="scoreTrack"><i style={{width: `${role.score}%`}} /></div>
                    <div className="reportMeta"><div><small>SALARY RANGE</small><strong>{role.salary}</strong></div><div><small>MARKET DEMAND</small><strong><TrendingUp size={14}/> High</strong></div><div><small>READINESS</small><strong>8 weeks</strong></div></div>
                    <div className="skillMatch"><div><small>YOUR MATCHING SKILLS</small><span>3 of 4 core skills</span></div><div>{role.skills.map(skill => <span key={skill}><Check size={12}/>{skill}</span>)}</div></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="stageNote noteOne"><span><Zap size={16}/></span><div><strong>12 roles unlocked</strong><small>Based on your strengths</small></div></div>
            <div className="stageNote noteTwo"><CircleCheck size={18}/><span>Profile scan complete</span></div>
          </div>
        </div>
        <div className="signalBar"><span>Built for ambitious people at</span><div><b>northstar</b><b>VERTEX</b><b>paperplane</b><b>BrightLoop</b><b>orbit°</b></div></div>
      </section>

      <section className="proofStrip">
        <article><strong>18k+</strong><span>career paths mapped</span></article>
        <article><strong>94%</strong><span>report clearer direction</span></article>
        <article><strong>3.2×</strong><span>more focused applications</span></article>
        <article><strong>30 days</strong><span>to a credible action plan</span></article>
      </section>

      <section className="modernSection methodSection">
        <div className="sectionIntro"><span className="sectionIndex">01 / HOW IT WORKS</span><h2>Clarity before applications.</h2><p>Stop collecting generic advice. CarrerFit.com gives you a practical answer to three questions: where to go, what to build, and which roles deserve your time.</p></div>
        <div className="methodGrid">{steps.map(({icon: Icon, number, title, copy}) => <article key={number}><div><span>{number}</span><Icon/></div><h3>{title}</h3><p>{copy}</p><Link href="/assessment">Learn more <ChevronRight size={15}/></Link></article>)}</div>
      </section>

      <section className="insightSection">
        <div className="insightVisual">
          <div className="radarCard"><div className="radarHeading"><span>PROFILE SIGNALS</span><small>Strong alignment</small></div><div className="radarChart"><i/><i/><i/><i/><i/><span>82</span></div><div className="radarLegend"><span><i/>Analytical</span><span><i/>Creative</span><span><i/>People</span><span><i/>Systems</span></div></div>
          <div className="floatingMetric"><Users/><div><strong>Top 8%</strong><span>candidate readiness</span></div></div>
        </div>
        <div className="insightCopy"><span className="sectionIndex">02 / PERSONAL INTELLIGENCE</span><h2>A career plan that understands the whole picture.</h2><p>Your strongest direction sits at the intersection of what you’re good at, what energizes you, and what employers actually need.</p><ul><li><CircleCheck/> Transferable skills, translated into hiring language</li><li><CircleCheck/> Role-specific gaps, prioritized by impact</li><li><CircleCheck/> Market demand and salary context</li><li><CircleCheck/> A 30-day proof-of-skill roadmap</li></ul><Link href="/assessment">Build my CarrerFit.com profile <ArrowRight size={17}/></Link></div>
      </section>

      <section className="roleSection">
        <div className="sectionIntro light"><span className="sectionIndex">03 / LIVE OPPORTUNITIES</span><h2>Fewer applications.<br/>Stronger reasons.</h2><p>Every recommendation explains why it fits, what is missing, and how competitive you are today.</p></div>
        <div className="featuredRoles">{roles.map((item,index) => <article key={item.title}><div><span className="companyMonogram">{item.company.slice(0,2).toUpperCase()}</span><span className="matchPill">{item.score}% fit</span></div><h3>{item.title}</h3><p>{item.company}</p><div className="roleLocation"><MapPin size={14}/> Bengaluru · Hybrid <Clock3 size={14}/> 2d</div><div className="roleSkills">{item.skills.map(x => <span key={x}>{x}</span>)}</div><div><strong>{item.salary}</strong><Link href="/jobs">View role <ArrowRight size={16}/></Link></div></article>)}</div>
        <Link className="allRoles" href="/resume">Get my resume-ranked roles <ArrowRight size={17}/></Link>
      </section>

      <section className="quoteSection"><span>“</span><blockquote>CarrerFit.com helped me stop applying everywhere and start positioning myself for the roles I could actually win.</blockquote><div><i>SR</i><p><strong>Shruti Rao</strong><span>Product Analyst · Bengaluru</span></p></div></section>

      <section className="modernCta"><div><span className="modernEyebrow"><Sparkles size={14}/> Your next move starts here</span><h2>Know where you fit.<br/>Build what matters.</h2></div><div><p>Upload your resume and get evidence-based matches to verified opportunities.</p><Link href="/resume">Match my resume free <ArrowRight/></Link><small>PDF or DOCX · Secure processing · No credit card</small></div></section>

      <footer className="modernFooter"><Link className="modernBrand" href="/"><span><Target size={20}/></span>CarrerFit.com</Link><p>Career intelligence for better decisions.</p><div><Link href="/resume">Resume match</Link><Link href="/jobs">Jobs</Link><Link href="/assessment">Assessment</Link><Link href="/dashboard">Dashboard</Link></div><span>© 2026 CarrerFit.com</span></footer>
    </main>
  );
}
