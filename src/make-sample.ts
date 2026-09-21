import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function main(): Promise<void> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText("Invoice 1042", {
    x: 72,
    y: 760,
    size: 22,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText("Customer: Acme Corp", {
    x: 72,
    y: 710,
    size: 14,
    font,
    color: rgb(0.15, 0.15, 0.15),
  });

  page.drawText("Payment terms: Net 30", {
    x: 72,
    y: 686,
    size: 14,
    font,
    color: rgb(0.15, 0.15, 0.15),
  });

  page.drawText("Thank you for your business.", {
    x: 72,
    y: 640,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });

  const bytes = await pdf.save();
  const outputPath = resolve("sample.pdf");
  await writeFile(outputPath, bytes);
  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
