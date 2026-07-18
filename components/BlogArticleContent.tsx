function headingId(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export default function BlogArticleContent({ content }: { content: string }) {
  const blocks = content.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return <div className="articleContent">{blocks.map((block, index) => {
    if (block.startsWith("## ")) { const text = block.slice(3).trim(); return <h2 id={headingId(text)} key={`${text}-${index}`}>{text}</h2>; }
    if (block.split("\n").every((line) => line.startsWith("- "))) return <ul key={`list-${index}`}>{block.split("\n").map((line) => <li key={line}>{line.slice(2)}</li>)}</ul>;
    return <p key={`paragraph-${index}`}>{block}</p>;
  })}</div>;
}
