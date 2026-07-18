import mammoth from "mammoth";

const PDF_TYPES = new Set(["application/pdf"]);
const DOCX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
]);

export async function extractResumeText(file: Express.Multer.File) {
  const lowerName = file.originalname.toLowerCase();
  let text = "";
  if (PDF_TYPES.has(file.mimetype) || lowerName.endsWith(".pdf")) {
    const [{ getDocument }, pdfjsWorker] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.mjs"),
    ]);
    (globalThis as typeof globalThis & { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;
    const document = await getDocument({ data: new Uint8Array(file.buffer), useSystemFonts: true }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 30); pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let previousY: number | undefined;
      const lines: string[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = item.transform[5];
        const separator = previousY !== undefined && Math.abs(y - previousY) > 2 ? "\n" : " ";
        lines.push(`${separator}${item.str}`);
        previousY = y;
      }
      pages.push(lines.join("").trim());
      page.cleanup();
    }
    text = pages.join("\n\n");
    await document.destroy();
  } else if (DOCX_TYPES.has(file.mimetype) && lowerName.endsWith(".docx")) {
    text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
  } else {
    throw new ResumeFileError("Upload a PDF or modern Word document (.docx).", 415);
  }

  const normalized = text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (normalized.length < 120) throw new ResumeFileError("We could not read enough text from this resume. Try exporting it as a text-based PDF or DOCX.", 422);
  return normalized.slice(0, 24_000);
}

export class ResumeFileError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
