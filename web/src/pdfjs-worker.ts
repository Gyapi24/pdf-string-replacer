import * as pdfjsLegacy from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjsLegacy.GlobalWorkerOptions.workerSrc = workerUrl;
