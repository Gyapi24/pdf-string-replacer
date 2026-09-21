import "./buffer-polyfill";
import "./pdfjs-worker";
import { zipSync } from "fflate";
import {
  clonePdfBytes,
  extractItems,
  loadPdf,
  renderFirstPage,
} from "./pdf";
import { replacePdfTextInBytes } from "./replace";

const fileInput = document.querySelector<HTMLInputElement>("#file")!;
const dropzone = document.querySelector<HTMLLabelElement>("#dropzone")!;
const fileLabel = document.querySelector<HTMLSpanElement>("#file-label")!;
const fileListPanel = document.querySelector<HTMLElement>("#file-list-panel")!;
const fileListEl = document.querySelector<HTMLUListElement>("#file-list")!;
const sampleButton = document.querySelector<HTMLButtonElement>("#sample")!;
const findInput = document.querySelector<HTMLInputElement>("#find")!;
const replaceInput = document.querySelector<HTMLInputElement>("#replace")!;
const ignoreCase = document.querySelector<HTMLInputElement>("#ignore-case")!;
const fontInput = document.querySelector<HTMLInputElement>("#font")!;
const runButton = document.querySelector<HTMLButtonElement>("#run")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const previewNameEl = document.querySelector<HTMLSpanElement>("#preview-name")!;
const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
const textEl = document.querySelector<HTMLPreElement>("#text")!;

interface LoadedPdf {
  id: string;
  name: string;
  bytes: Uint8Array;
}

interface OutputPdf {
  name: string;
  bytes: Uint8Array;
  replaced: number;
  matched: number;
  skipped: number;
  note: string;
}

let loaded: LoadedPdf[] = [];
let outputs: OutputPdf[] = [];
let previewIndex = 0;

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function updateButtons(): void {
  runButton.disabled = loaded.length === 0 || !findInput.value.trim();
  downloadButton.disabled = outputs.length === 0;
  downloadButton.textContent =
    outputs.length > 1 ? `Download ZIP (${outputs.length})` : "Download PDF";
}

function replacedName(name: string): string {
  return name.toLowerCase().endsWith(".pdf")
    ? `${name.slice(0, -4)}-replaced.pdf`
    : `${name}-replaced.pdf`;
}

function renderFileList(): void {
  fileListPanel.hidden = loaded.length === 0;
  fileListEl.replaceChildren();

  loaded.forEach((file, index) => {
    const item = document.createElement("li");
    item.className = index === previewIndex ? "active" : "";

    const nameBtn = document.createElement("button");
    nameBtn.type = "button";
    nameBtn.className = "file-name";
    nameBtn.textContent = file.name;
    nameBtn.addEventListener("click", () => {
      void showPreview(index);
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "file-remove";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", () => {
      loaded = loaded.filter((entry) => entry.id !== file.id);
      outputs = [];
      if (loaded.length === 0) {
        previewIndex = 0;
        previewNameEl.textContent = "";
        textEl.textContent = "";
        const context = canvas.getContext("2d");
        context?.clearRect(0, 0, canvas.width, canvas.height);
        fileLabel.textContent = "Drop PDFs here or click to choose one or more";
        setStatus("Choose PDFs to get started.");
      } else {
        previewIndex = Math.min(previewIndex, loaded.length - 1);
        void showPreview(previewIndex);
        fileLabel.textContent = `${loaded.length} PDF${loaded.length === 1 ? "" : "s"} selected`;
        setStatus(`Loaded ${loaded.length} PDF${loaded.length === 1 ? "" : "s"}.`);
      }
      renderFileList();
      updateButtons();
    });

    const output = outputs.find((entry) => entry.name === replacedName(file.name));
    const meta = document.createElement("span");
    meta.className = "file-meta";
    meta.textContent = output
      ? `${output.replaced}/${output.matched} replaced`
      : "ready";

    item.append(nameBtn, meta, removeBtn);
    fileListEl.append(item);
  });
}

async function showPreview(index: number): Promise<void> {
  const file = loaded[index];
  if (!file) {
    return;
  }

  previewIndex = index;
  const output = outputs.find((entry) => entry.name === replacedName(file.name));
  const bytes = output?.bytes ?? file.bytes;
  const label = output ? output.name : file.name;
  previewNameEl.textContent = `(${label})`;

  const pdf = await loadPdf(bytes);
  try {
    const extracted = await extractItems(pdf);
    textEl.textContent = extracted.plainText || "(no extractable text)";
  } finally {
    await pdf.destroy();
  }

  await renderFirstPage(bytes, canvas);
  renderFileList();
}

async function addFiles(files: File[]): Promise<void> {
  const pdfs = files.filter(
    (file) =>
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );

  if (pdfs.length === 0) {
    setStatus("No PDF files found in that selection.");
    return;
  }

  outputs = [];
  for (const file of pdfs) {
    const bytes = clonePdfBytes(await file.arrayBuffer());
    const existing = loaded.findIndex((entry) => entry.name === file.name);
    const next: LoadedPdf = {
      id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
      name: file.name,
      bytes,
    };
    if (existing >= 0) {
      loaded[existing] = next;
    } else {
      loaded.push(next);
    }
  }

  fileLabel.textContent = `${loaded.length} PDF${loaded.length === 1 ? "" : "s"} selected`;
  setStatus(`Loaded ${loaded.length} PDF${loaded.length === 1 ? "" : "s"}. Enter text to replace.`);
  renderFileList();
  updateButtons();
  await showPreview(loaded.length - 1);
}

fileInput.addEventListener("change", async () => {
  const files = [...(fileInput.files ?? [])];
  if (files.length === 0) {
    return;
  }
  try {
    await addFiles(files);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    fileInput.value = "";
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("drag");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("drag");
});

dropzone.addEventListener("drop", async (event) => {
  event.preventDefault();
  dropzone.classList.remove("drag");
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length === 0) {
    return;
  }
  try {
    await addFiles(files);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
});

sampleButton.addEventListener("click", async () => {
  try {
    const response = await fetch("/sample.pdf");
    if (!response.ok) {
      setStatus("Could not load the sample PDF.");
      return;
    }
    const bytes = await response.arrayBuffer();
    const file = new File([bytes], "sample.pdf", { type: "application/pdf" });
    await addFiles([file]);
    findInput.value = "Acme Corp";
    replaceInput.value = "Globex Inc";
    updateButtons();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error));
  }
});

findInput.addEventListener("input", updateButtons);

runButton.addEventListener("click", async () => {
  if (loaded.length === 0) {
    return;
  }

  const find = findInput.value;
  if (!find) {
    return;
  }

  runButton.disabled = true;
  outputs = [];
  setStatus(`Replacing in ${loaded.length} PDF${loaded.length === 1 ? "" : "s"}…`);

  try {
    const fontFile = fontInput.files?.[0];
    const substituteFont = fontFile
      ? new Uint8Array(await fontFile.arrayBuffer())
      : undefined;

    const nextOutputs: OutputPdf[] = [];
    let totalMatched = 0;
    let totalReplaced = 0;
    let totalSkipped = 0;
    let filesWithMatches = 0;

    for (let i = 0; i < loaded.length; i += 1) {
      const file = loaded[i]!;
      setStatus(`Replacing in ${file.name} (${i + 1}/${loaded.length})…`);

      const result = await replacePdfTextInBytes({
        bytes: clonePdfBytes(file.bytes),
        find,
        replaceWith: replaceInput.value,
        caseSensitive: !ignoreCase.checked,
        substituteFont,
      });

      totalMatched += result.matchCount;
      totalReplaced += result.replaced.length;
      totalSkipped += result.skipped.length;

      if (result.matchCount > 0) {
        filesWithMatches += 1;
      }

      const note =
        result.matchCount === 0
          ? "no matches"
          : result.replaced.length === 0
            ? `found ${result.matchCount}, none rewritten`
            : `rewrote ${result.replaced.length}/${result.matchCount}`;

      nextOutputs.push({
        name: replacedName(file.name),
        bytes: result.replaced.length > 0 ? result.bytes : clonePdfBytes(file.bytes),
        replaced: result.replaced.length,
        matched: result.matchCount,
        skipped: result.skipped.length,
        note,
      });
    }

    outputs = nextOutputs.filter((entry) => entry.replaced > 0);

    if (outputs.length === 0) {
      setStatus(
        totalMatched === 0
          ? `No matches for "${find}" in ${loaded.length} PDF${loaded.length === 1 ? "" : "s"}.`
          : `Found ${totalMatched} match(es) across ${filesWithMatches} file(s), but none could be rewritten.`
      );
      renderFileList();
      updateButtons();
      return;
    }

    const previewSource = outputs[0]!;
    const previewLoadedIndex = loaded.findIndex(
      (file) => replacedName(file.name) === previewSource.name
    );
    if (previewLoadedIndex >= 0) {
      await showPreview(previewLoadedIndex);
    }

    setStatus(
      `Done: rewrote ${totalReplaced} match(es) across ${outputs.length}/${loaded.length} file(s)` +
        (totalSkipped > 0 ? `, skipped ${totalSkipped}` : "") +
        `. Download when ready.`
    );
  } catch (error) {
    outputs = [];
    setStatus(error instanceof Error ? error.message : String(error));
  } finally {
    renderFileList();
    updateButtons();
  }
});

downloadButton.addEventListener("click", () => {
  if (outputs.length === 0) {
    return;
  }

  if (outputs.length === 1) {
    const only = outputs[0]!;
    const blob = new Blob([only.bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = only.name;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const files: Record<string, Uint8Array> = {};
  for (const output of outputs) {
    files[output.name] = output.bytes;
  }
  const zipped = zipSync(files);
  const blob = new Blob([zipped], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "replaced-pdfs.zip";
  link.click();
  URL.revokeObjectURL(url);
});

setStatus("Choose one or more PDFs to get started.");
updateButtons();
