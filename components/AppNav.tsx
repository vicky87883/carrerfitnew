"use client";

import { Menu, Target, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [["/resume", "AI resume match"], ["/jobs", "Find jobs"], ["/assessment", "Assessment"], ["/dashboard", "Dashboard"]];

export default function AppNav({ light = false }: { light?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className={`appNav ${light ? "navLight" : ""}`}>
      <Link className="brand" href="/">
        <span className="brandMark"><Target size={21} /></span><span>CarrerFit.com</span>
      </Link>
      <button className="menuButton" onClick={() => setOpen(!open)} aria-label="Toggle navigation">{open ? <X /> : <Menu />}</button>
      <nav className={open ? "open" : ""}>
        {links.map(([href, label]) => <Link className={pathname === href ? "current" : ""} href={href} key={href} onClick={() => setOpen(false)}>{label}</Link>)}
      </nav>
      <Link className="navCta" href="/assessment">Get my career matches</Link>
    </header>
  );
}
