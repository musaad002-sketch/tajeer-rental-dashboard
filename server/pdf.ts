import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";

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

export async function generateContractPdf(data: any) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await loadArabicFont();
  const arabicFont = await pdfDoc.embedFont(fontBytes);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  
  const drawTextRtl = (text: string, x: number, y: number, size: number = 12) => {
    page.drawText(text, { x: width - x - arabicFont.widthOfTextAtSize(text, size), y, size, font: arabicFont, color: rgb(0, 0, 0) });
  };

  drawTextRtl("عقد إيجار سيارة - تأجيرك", 50, height - 50, 18);
  drawTextRtl(`رقم العقد: ${data.contractNumber}`, 50, height - 80);
  drawTextRtl(`التاريخ: ${new Date().toLocaleDateString("ar-SA")}`, 50, height - 100);
  
  drawTextRtl("بيانات المستأجر:", 50, height - 140, 14);
  drawTextRtl(`الاسم: ${data.customerName}`, 70, height - 160);
  drawTextRtl(`رقم الهوية: ${data.identityNumber}`, 70, height - 180);
  
  drawTextRtl("بيانات المركبة:", 50, height - 220, 14);
  drawTextRtl(`السيارة: ${data.vehicleMake} ${data.vehicleModel}`, 70, height - 240);
  drawTextRtl(`رقم اللوحة: ${data.plateNumber}`, 70, height - 260);
  
  drawTextRtl("تفاصيل الإيجار:", 50, height - 300, 14);
  drawTextRtl(`تاريخ الاستلام: ${data.startDate}`, 70, height - 320);
  drawTextRtl(`تاريخ الإرجاع المتوقع: ${data.expectedReturnDate}`, 70, height - 340);
  drawTextRtl(`القيمة الإجمالية: ${data.totalAmount} ر.س`, 70, height - 360);
  drawTextRtl(`المبلغ المدفوع: ${data.paidAmount} ر.س`, 70, height - 380);
  
  drawTextRtl("توقيع المستأجر: ____________________", 50, 100);
  drawTextRtl("ختم المؤسسة: ____________________", 350, 100);

  return await pdfDoc.save();
}

export function formatReceiptData(row: { payment: { id: number; amount: string; method: string; notes: string | null; createdAt: Date }; contract?: { contractNumber: string } | null; customer?: { fullName: string } | null }) {
  return { receiptNumber: row.payment.id, contractNumber: row.contract?.contractNumber ?? "-", customerName: row.customer?.fullName ?? "-", amount: row.payment.amount, paymentMethod: row.payment.method, createdAt: row.payment.createdAt, details: row.payment.notes };
}

export async function generateReceiptPdf(data: any) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await loadArabicFont();
  const arabicFont = await pdfDoc.embedFont(fontBytes);
  const page = pdfDoc.addPage([595.28, 420.94]); // A5 Landscape-ish
  const { width, height } = page.getSize();
  
  const drawTextRtl = (text: string, x: number, y: number, size: number = 12) => {
    page.drawText(text, { x: width - x - arabicFont.widthOfTextAtSize(text, size), y, size, font: arabicFont, color: rgb(0, 0, 0) });
  };

  drawTextRtl("سند قبض - تأجيرك", 50, height - 50, 18);
  drawTextRtl(`رقم السند: ${data.receiptNumber ?? "-"}`, 50, height - 80);
  drawTextRtl(`التاريخ: ${new Date(data.createdAt ?? new Date()).toLocaleDateString("ar-SA")}`, 50, height - 100);
  
  drawTextRtl(`استلمنا من السيد/ة: ${data.customerName}`, 50, height - 140);
  drawTextRtl(`مبلغ وقدره: ${data.amount} ر.س`, 50, height - 160);
  drawTextRtl(`طريقة الدفع: ${data.paymentMethod ?? "cash"}`, 50, height - 180);
  drawTextRtl(`وذلك عن: ${data.details || "دفعة عقد إيجار"}`, 50, height - 200);
  drawTextRtl(`رقم العقد المرتبط: ${data.contractNumber}`, 50, height - 220);
  
  drawTextRtl("توقيع المستلم: ____________________", 350, 50);

  return await pdfDoc.save();
}
