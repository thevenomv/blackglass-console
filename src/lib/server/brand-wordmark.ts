/**
 * Blackglass wordmark PNG for server-side PDF embedding (pdf-lib).
 * File: public/brand/blackglass-wordmark.png
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";

const REL = join("public", "brand", "blackglass-wordmark.png");

let bytesMemo: Uint8Array | null | undefined;

export async function readBrandWordmarkPngBytes(): Promise<Uint8Array | null> {
  if (bytesMemo !== undefined) return bytesMemo;
  try {
    const buf = await readFile(join(process.cwd(), REL));
    bytesMemo = new Uint8Array(buf);
    return bytesMemo;
  } catch {
    bytesMemo = null;
    return null;
  }
}

export async function embedBrandWordmark(doc: PDFDocument): Promise<PDFImage | null> {
  const bytes = await readBrandWordmarkPngBytes();
  if (!bytes?.length) return null;
  try {
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

/** @returns drawn height in pt (for vertical spacing), or 0 if nothing drawn */
export function drawBrandWordmarkOnCover(
  page: PDFPage,
  image: PDFImage,
  opts: { marginLeft: number; titleBaselineY: number; maxWidthPt: number },
): number {
  const { marginLeft, titleBaselineY, maxWidthPt } = opts;
  const imgW = maxWidthPt;
  const imgH = (image.height / image.width) * imgW;
  // Align top of wordmark with cap height of the former ~30pt Helvetica title
  const capApprox = 22;
  const imgY = titleBaselineY + capApprox - imgH;
  page.drawImage(image, {
    x: marginLeft,
    y: imgY,
    width: imgW,
    height: imgH,
  });
  return imgH;
}
