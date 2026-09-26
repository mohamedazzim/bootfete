// Dynamic certificate engine: overlays verified participant data onto an
// admin-uploaded base template (PDF via pdf-lib, PNG/JPEG via sharp).
// Coordinates are configured in a top-left-origin space (matching the
// image preview admins see); PDF output converts to bottom-left origin.
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import type {
  CertificateTemplate,
  CertificatePlaceholders,
  CertificatePlaceholder,
} from "@shared/schema";

export interface TemplateCertificateData {
  name: string;
  event: string;
  position: string;
  college: string;
  date: string;
  location: string;
}

export type PlaceholderKey = keyof CertificatePlaceholders;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function templateFilePath(template: CertificateTemplate): string {
  const rel = template.templateUrl.startsWith("/")
    ? template.templateUrl.slice(1)
    : template.templateUrl;
  return path.join(process.cwd(), rel);
}

function resolvedEntries(
  placeholders: CertificatePlaceholders,
  data: TemplateCertificateData,
): Array<{ key: PlaceholderKey; ph: CertificatePlaceholder; value: string }> {
  const out: Array<{ key: PlaceholderKey; ph: CertificatePlaceholder; value: string }> = [];
  (Object.keys(placeholders) as PlaceholderKey[]).forEach((key) => {
    const ph = placeholders[key];
    const value = data[key] ?? "";
    if (ph && value) out.push({ key, ph, value });
  });
  return out;
}

async function renderPdf(
  template: CertificateTemplate,
  entries: Array<{ key: PlaceholderKey; ph: CertificatePlaceholder; value: string }>,
): Promise<Buffer> {
  const bytes = fs.readFileSync(templateFilePath(template));
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPages()[0];
  const { height } = page.getSize();
  const font: PDFFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont: PDFFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const { key, ph, value } of entries) {
    const size = ph.fontSize || 24;
    const { r, g, b } = hexToRgb(ph.fontColor || "#1e293b");
    // Bold for the participant name; regular for everything else.
    const useFont = key === "name" ? boldFont : font;
    const textWidth = useFont.widthOfTextAtSize(value, size);
    let x = ph.x;
    if (ph.alignment === "center") x = ph.x - textWidth / 2;
    else if (ph.alignment === "right") x = ph.x - textWidth;
    page.drawText(value, {
      x,
      y: height - ph.y, // top-left-origin config -> PDF bottom-left origin
      size,
      font: useFont,
      color: rgb(r, g, b),
    });
  }
  return Buffer.from(await pdf.save());
}

async function renderImage(
  template: CertificateTemplate,
  entries: Array<{ key: PlaceholderKey; ph: CertificatePlaceholder; value: string }>,
): Promise<Buffer> {
  const input = sharp(templateFilePath(template));
  const meta = await input.metadata();
  const w = meta.width || 1200;
  const h = meta.height || 800;

  const texts = entries.map(({ ph, value }) => {
    const size = ph.fontSize || 48;
    const anchor = ph.alignment === "center" ? "middle" : ph.alignment === "right" ? "end" : "start";
    const weight = "bold";
    return `<text x="${ph.x}" y="${ph.y}" font-family="sans-serif" font-size="${size}" font-weight="${weight}" fill="${ph.fontColor || "#1e293b"}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
  }).join("");

  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${texts}</svg>`,
  );
  return input.composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

export async function renderTemplateCertificate(
  template: CertificateTemplate,
  data: TemplateCertificateData,
): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  const entries = resolvedEntries(template.placeholders || {}, data);
  if (template.fileType === "pdf") {
    return { buffer: await renderPdf(template, entries), contentType: "application/pdf", extension: "pdf" };
  }
  return { buffer: await renderImage(template, entries), contentType: "image/png", extension: "png" };
}

/** Human-friendly position label from a 1-based rank. */
export function positionLabel(rank: number): string {
  if (rank === 1) return "Winner";
  if (rank === 2) return "Runner-Up";
  if (rank === 3) return "2nd Runner-Up";
  return "Participant";
}
