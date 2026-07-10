import { jsPDF } from "jspdf";

export interface CertificateData {
  productName: string;
  brand: string;
  productCode: string;
  category: string;
  verificationHash: string;
  trustScore: number;
  issueDate: string;
  qrDataUrl?: string; // We can generate this from a canvas before calling this
}

export function generateProductCertificate(data: CertificateData): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  // Colors
  const bgDark = "#10141a";
  const textLight = "#dfe2eb";
  const primaryCyan = "#71ffe8";
  const gold = "#f9bc48";

  // Fill background
  doc.setFillColor(bgDark);
  doc.rect(0, 0, 210, 297, "F");

  // Border
  doc.setDrawColor(primaryCyan);
  doc.setLineWidth(1);
  doc.rect(10, 10, 190, 277, "S");
  doc.setLineWidth(0.5);
  doc.rect(12, 12, 186, 273, "S");

  // Title
  doc.setTextColor(primaryCyan);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("AUTHENTICHAIN", 105, 40, { align: "center" });
  
  doc.setTextColor(gold);
  doc.setFontSize(16);
  doc.text("Certificate of Authenticity", 105, 52, { align: "center" });

  doc.setDrawColor(primaryCyan);
  doc.setLineWidth(0.5);
  doc.line(40, 60, 170, 60);

  // Content
  doc.setTextColor(textLight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);

  const startY = 80;
  const lineSpacing = 12;

  doc.text(`This document certifies the authenticity and provenance of the following product,`, 105, startY, { align: "center" });
  doc.text(`recorded immutably on the AuthentiChain network.`, 105, startY + 6, { align: "center" });

  doc.setFontSize(14);
  const detailsY = startY + 30;
  
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryCyan);
  doc.text("Product Details", 30, detailsY);
  
  doc.setFont("helvetica", "normal");
  doc.setTextColor(textLight);
  doc.setFontSize(12);
  
  const drawRow = (label: string, value: string, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.text(label + ":", 30, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, 80, y);
  };

  drawRow("Product Name", data.productName, detailsY + lineSpacing * 1);
  drawRow("Brand", data.brand, detailsY + lineSpacing * 2);
  drawRow("Product Code", data.productCode, detailsY + lineSpacing * 3);
  drawRow("Category", data.category, detailsY + lineSpacing * 4);
  drawRow("Trust Score", `${data.trustScore} / 100`, detailsY + lineSpacing * 5);
  drawRow("Date Issued", new Date(data.issueDate).toLocaleDateString(), detailsY + lineSpacing * 6);

  // Hash Section
  const hashY = detailsY + lineSpacing * 8;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(primaryCyan);
  doc.text("Cryptographic Verification", 30, hashY);
  
  doc.setFont("helvetica", "normal");
  doc.setTextColor(textLight);
  doc.setFontSize(10);
  doc.text("SHA-256 Anchor:", 30, hashY + 8);
  
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  
  // Hash might be long, split it if needed, but 64 chars fits on one line in courier 9
  doc.text(data.verificationHash, 30, hashY + 14);

  // QR Code
  if (data.qrDataUrl) {
    const qrSize = 50;
    doc.addImage(data.qrDataUrl, "PNG", 105 - (qrSize/2), hashY + 30, qrSize, qrSize);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(textLight);
    doc.text("Scan to verify online", 105, hashY + 30 + qrSize + 8, { align: "center" });
  }

  // Footer
  doc.setFontSize(10);
  doc.setTextColor(textLight);
  doc.text("Powered by AuthentiChain Next-Gen Supply Chain Security", 105, 270, { align: "center" });

  // Save
  doc.save(`AuthentiChain_Certificate_${data.productCode}.pdf`);
}
