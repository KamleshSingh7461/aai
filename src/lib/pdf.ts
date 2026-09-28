import { PDFDocument } from "pdf-lib";

/** Combines camera photos (JPEG/PNG) into one PDF, one image per page. */
export async function imagesToPdf(images: { bytes: Buffer; type: string }[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (const img of images) {
    const embedded = img.type === "image/png" ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes);
    const page = pdf.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }
  return Buffer.from(await pdf.save());
}

export async function countPages(bytes: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getPageCount();
}
