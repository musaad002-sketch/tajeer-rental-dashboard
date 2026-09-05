import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import { officePrint } from "../shared/officePrint";
import { formatGregorianDate } from "../shared/dateFormat";

const officeLetterheadPath = "/manus-storage/mishari-office-letterhead_30b0512c.png";

async function loadArabicFont() {
  const candidates = [
    process.env.TAJEERK_ARABIC_FONT,
    "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/tahoma.ttf",
  ].filter(Boolean) as string[];
  for (const path of candidates) {
    try { return await fs.readFile(path); } catch { /* try next installed font */ }
  }
  throw new Error("لم يتم العثور على خط عربي. اضبط TAJEERK_ARABIC_FONT على مسار ملف TTF عربي.");
}

async function drawOfficeLetterhead(pdfDoc: PDFDocument, page: PDFPage, origin?: string) {
  if (!origin) return;
  try {
    const response = await fetch(new URL(officeLetterheadPath, origin).toString());
    if (!response.ok) return;
    const letterhead = await pdfDoc.embedPng(await response.arrayBuffer());
    const { width, height } = page.getSize();
    page.drawImage(letterhead, { x: 0, y: 0, width, height });
  } catch { /* يستمر إنشاء المستند بالترويسة النصية عند تعذر تحميل الخلفية */ }
}

function drawOfficeHeader(page: PDFPage, font: PDFFont) {
  const { width, height } = page.getSize();
  page.drawText(officePrint.englishName, { x: 34, y: height - 47, size: 8, font, color: rgb(0.15, 0.15, 0.15) });
  page.drawText(officePrint.arabicName, { x: width - 212, y: height - 47, size: 9, font, color: rgb(0.15, 0.15, 0.15) });
  page.drawLine({ start: { x: 30, y: height - 72 }, end: { x: width - 30, y: height - 72 }, thickness: 0.8, color: rgb(0.35, 0.35, 0.35) });
}

function drawBankDetails(drawTextRtl: (text: string, x: number, y: number, size?: number) => void, headingY: number) {
  drawTextRtl("بيانات التحويل البنكي:", 50, headingY, 13);
  drawTextRtl(`${officePrint.bank.nameArabic} — ${officePrint.bank.accountHolder}`, 70, headingY - 22, 10);
  drawTextRtl(`رقم الحساب: ${officePrint.bank.accountNumber}`, 70, headingY - 41, 10);
  drawTextRtl(`IBAN: ${officePrint.bank.iban}`, 70, headingY - 60, 10);
}

export async function generateContractPdf(data: any, origin?: string) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const arabicFont = await pdfDoc.embedFont(await loadArabicFont());
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  await drawOfficeLetterhead(pdfDoc, page, origin);
  drawOfficeHeader(page, arabicFont);
  const drawTextRtl = (text: string, x: number, y: number, size = 12) => page.drawText(text, { x: width - x - arabicFont.widthOfTextAtSize(text, size), y, size, font: arabicFont, color: rgb(0, 0, 0) });

  drawTextRtl("عقد إيجار سيارة", 50, height - 145, 18);
  drawTextRtl(`رقم العقد: ${data.contractNumber}`, 50, height - 175);
  drawTextRtl(`التاريخ: ${formatGregorianDate(new Date())}`, 50, height - 195);
  drawTextRtl("بيانات المستأجر:", 50, height - 235, 14);
  drawTextRtl(`الاسم: ${data.customerName}`, 70, height - 255);
  drawTextRtl(`رقم الهوية: ${data.identityNumber}`, 70, height - 275);
  drawTextRtl("بيانات المركبة:", 50, height - 315, 14);
  drawTextRtl(`السيارة: ${data.vehicleMake} ${data.vehicleModel}`, 70, height - 335);
  drawTextRtl(`رقم اللوحة: ${data.plateNumber}`, 70, height - 355);
  drawTextRtl("تفاصيل الإيجار:", 50, height - 395, 14);
  drawTextRtl(`تاريخ الاستلام: ${data.startDate}`, 70, height - 415);
  drawTextRtl(`تاريخ الإرجاع المتوقع: ${data.expectedReturnDate}`, 70, height - 435);
  drawTextRtl(`القيمة الإجمالية: ${data.totalAmount} ر.س`, 70, height - 455);
  drawTextRtl(`المبلغ المدفوع: ${data.paidAmount} ر.س`, 70, height - 475);
  drawBankDetails(drawTextRtl, 205);
  drawTextRtl("توقيع المستأجر: ____________________", 50, 100);
  drawTextRtl("ختم المؤسسة: ____________________", 350, 100);
  return pdfDoc.save();
}

export function formatReceiptData(row: { payment: { id: number; amount: string; method: string; notes: string | null; createdAt: Date }; contract?: { contractNumber: string } | null; customer?: { fullName: string } | null }) {
  return { receiptNumber: row.payment.id, contractNumber: row.contract?.contractNumber ?? "-", customerName: row.customer?.fullName ?? "-", amount: row.payment.amount, paymentMethod: row.payment.method, createdAt: row.payment.createdAt, details: row.payment.notes };
}

export async function generateReceiptPdf(data: any, origin?: string) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const arabicFont = await pdfDoc.embedFont(await loadArabicFont());
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  await drawOfficeLetterhead(pdfDoc, page, origin);
  drawOfficeHeader(page, arabicFont);
  const drawTextRtl = (text: string, x: number, y: number, size = 12) => page.drawText(text, { x: width - x - arabicFont.widthOfTextAtSize(text, size), y, size, font: arabicFont, color: rgb(0, 0, 0) });

  drawTextRtl("سند قبض", 50, height - 145, 18);
  drawTextRtl(`رقم السند: ${data.receiptNumber ?? "-"}`, 50, height - 175);
  drawTextRtl(`التاريخ: ${formatGregorianDate(data.createdAt ?? new Date())}`, 50, height - 195);
  drawTextRtl(`استلمنا من السيد/ة: ${data.customerName}`, 50, height - 245);
  drawTextRtl(`مبلغ وقدره: ${data.amount} ر.س`, 50, height - 270);
  drawTextRtl(`طريقة الدفع: ${data.paymentMethod ?? "cash"}`, 50, height - 295);
  drawTextRtl(`وذلك عن: ${data.details || "دفعة عقد إيجار"}`, 50, height - 320);
  drawTextRtl(`رقم العقد المرتبط: ${data.contractNumber}`, 50, height - 345);
  drawBankDetails(drawTextRtl, 180);
  drawTextRtl("توقيع المستلم: ____________________", 350, 70);
  return pdfDoc.save();
}
