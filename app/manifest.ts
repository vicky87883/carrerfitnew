import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest { return { name: "CarrerFit.com", short_name: "CarrerFit", description: "AI-powered career clarity, resume matching, and interview practice.", start_url: "/", display: "standalone", background_color: "#f5f4ef", theme_color: "#10131a" }; }
