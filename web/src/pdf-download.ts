export type PDFDestination = {
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
};

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
  excludeAcceptAllOption: boolean;
}) => Promise<PDFDestination>;

export function pdfFilename(number: string): string {
  return `Faktura-${number.replace(/[^\p{L}\p{N}_-]/gu, '_') || 'faktura'}.pdf`;
}

// Call directly from the click handler, before saving or rendering consumes user activation.
export function choosePDFDestination(filename: string): Promise<PDFDestination | null> {
  const browser = window as Window & { showSaveFilePicker?: SavePicker };
  if (!browser.showSaveFilePicker) return Promise.resolve(null);
  return browser.showSaveFilePicker({
    suggestedName: filename,
    types: [{ description: 'PDF dokument', accept: { 'application/pdf': ['.pdf'] } }],
    excludeAcceptAllOption: true,
  });
}

export async function savePDF(blob: Blob, filename: string, destination: PDFDestination | null) {
  if (destination) {
    const stream = await destination.createWritable();
    try {
      await stream.write(blob);
      await stream.close();
    } catch (error) {
      await stream.abort().catch(() => {});
      throw error;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Safari needs the object URL to remain alive while its download starts.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
