"use client";

import { LogIn, Menu, Target, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [["/resume", "AI resume match"], ["/interview", "AI interview"], ["/jobs", "Find jobs"], ["/assessment", "Assessment"], ["/dashboard", "Dashboard"]];

export default function AppNav({ light = false }: { light?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<{ name: string } | null>(null);
  useEffect(() => { fetch("/api/auth/me", { cache: "no-store" }).then((response) => response.json()).then((body) => setAccount(body.user || null)).catch(() => null); }, [pathname]);
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }
  return (
    <header className={`appNav ${light ? "navLight" : ""}`}>
      <Link className="brand" href="/">
        <span className="brandMark"><Target size={21} /></span><span>CarrerFit.com</span>
      </Link>
      <button className="menuButton" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X /> : <Menu />}</button>
      <nav className={open ? "open" : ""}>
        {links.map(([href, label]) => <Link className={pathname === href ? "current" : ""} href={href} key={href} onClick={() => setOpen(false)}>{label}</Link>)}
      </nav>
      <div className="navAccount">{account ? <><Link className="navCta" href="/dashboard">{account.name.split(" ")[0]}</Link><button onClick={logout}>Sign out</button></> : <Link className="navCta" href="/login"><LogIn size={15}/> Sign in</Link>}</div>
    </header>
  );
}
