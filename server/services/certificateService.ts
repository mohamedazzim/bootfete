// Server-side PDF certificate generation (pdfkit). The route streams the
// PDF straight to the response — nothing is written to disk, so there is
// no file store to secure or clean up.
import PDFDocument from "pdfkit";
import type { Response } from "express";

export interface CertificateData {
  participantName: string;
  eventName: string;
  roundName: string;
  score: number;
  rank: number;
  totalParticipants: number;
  issuedAt: Date;
  certificateId: string;
}

// Landscape A4 in points
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const INDIGO = "#4338ca";
const SLATE = "#334155";
const GOLD = "#b45309";

export function generateCertificate(data: CertificateData, res: Response): void {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="certificate-${data.certificateId}.pdf"`,
  );
  res.setHeader("Cache-Control", "no-store");

  doc.pipe(res);

  // --- Borders ---
  doc.lineWidth(6).strokeColor(INDIGO).rect(18, 18, PAGE_W - 36, PAGE_H - 36).stroke();
  doc.lineWidth(1.5).strokeColor(GOLD).rect(32, 32, PAGE_W - 64, PAGE_H - 64).stroke();

  const cx = PAGE_W / 2;
  let y = 78;

  // --- Header / branding ---
  doc.font("Helvetica").fontSize(13).fillColor(SLATE)
    .text("BISHOP HEBER COLLEGE (AUTONOMOUS)", 0, y, { align: "center", width: PAGE_W });
  y += 22;
  doc.font("Helvetica-Bold").fontSize(30).fillColor(INDIGO)
    .text("BootFete 2K26", 0, y, { align: "center", width: PAGE_W });
  y += 48;

  // --- Title ---
  doc.font("Helvetica-Bold").fontSize(26).fillColor(SLATE)
    .text("Certificate of Achievement", 0, y, { align: "center", width: PAGE_W });
  y += 40;

  doc.font("Helvetica").fontSize(13).fillColor(SLATE)
    .text("This certificate is proudly presented to", 0, y, { align: "center", width: PAGE_W });
  y += 30;

  // --- Participant name ---
  doc.font("Helvetica-Bold").fontSize(34).fillColor(INDIGO)
    .text(data.participantName, 0, y, { align: "center", width: PAGE_W });
  y += 14;
  const nameBottom = doc.y;
  doc.lineWidth(1).strokeColor(GOLD).moveTo(cx - 200, nameBottom + 6).lineTo(cx + 200, nameBottom + 6).stroke();
  y = nameBottom + 28;

  // --- Event / round ---
  doc.font("Helvetica").fontSize(13).fillColor(SLATE)
    .text("for outstanding performance in", 0, y, { align: "center", width: PAGE_W });
  y += 24;
  doc.font("Helvetica-Bold").fontSize(18).fillColor(SLATE)
    .text(`${data.eventName} — ${data.roundName}`, 0, y, { align: "center", width: PAGE_W });
  y += 40;

  // --- Score / rank stat boxes ---
  const boxW = 190;
  const boxH = 74;
  const gap = 30;
  const x1 = cx - boxW - gap / 2;
  const x2 = cx + gap / 2;

  const drawBox = (x: number, label: string, value: string) => {
    doc.lineWidth(1.5).strokeColor(INDIGO).roundedRect(x, y, boxW, boxH, 8).stroke();
    doc.font("Helvetica").fontSize(11).fillColor(SLATE)
      .text(label, x, y + 12, { align: "center", width: boxW });
    doc.font("Helvetica-Bold").fontSize(26).fillColor(INDIGO)
      .text(value, x, y + 30, { align: "center", width: boxW });
  };
  drawBox(x1, "FINAL SCORE", `${data.score} pts`);
  drawBox(x2, "RANK", `#${data.rank} of ${data.totalParticipants}`);
  y += boxH + 34;

  // --- Verification footer ---
  const issued = data.issuedAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
  doc.font("Helvetica").fontSize(10).fillColor(SLATE)
    .text(`Issued on ${issued} (IST)`, 0, y, { align: "center", width: PAGE_W });
  y += 16;
  doc.font("Helvetica-Oblique").fontSize(10).fillColor("#64748b")
    .text(`Certificate ID: ${data.certificateId} • Verify against attempt records`, 0, y, { align: "center", width: PAGE_W });

  doc.end();
}
