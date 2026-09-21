import { writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { extractPdfText, replacePdfText } from "./replace-pdf-text.js";

interface CliArgs {
  input?: string;
  output?: string;
  find?: string;
  replace?: string;
  caseInsensitive: boolean;
  max?: number;
  font?: string;
  extract: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`Parse a PDF and replace one string with another.

Usage:
  npm start -- --input file.pdf --find "old" --replace "new" --output out.pdf
  npm start -- file.pdf "old" "new" [out.pdf]

Options:
  -i, --input <path>       Input PDF
  -o, --output <path>      Output PDF (default: <name>-replaced.pdf)
  -f, --find <text>        Text to search for
  -r, --replace <text>     Replacement text
  -n, --max <count>        Replace at most N matches
      --font <path>        TTF/OTF used when the original font cannot encode the new text
      --ignore-case        Case-insensitive search
      --extract            Print extracted text and exit
  -h, --help               Show this help
`);
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    caseInsensitive: false,
    extract: false,
    help: false,
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    const take = (): string => {
      const value = argv[++i];
      if (value === undefined) {
        throw new Error(`Missing value for ${arg}`);
      }
      return value;
    };

    switch (arg) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "-i":
      case "--input":
        args.input = take();
        break;
      case "-o":
      case "--output":
        args.output = take();
        break;
      case "-f":
      case "--find":
        args.find = take();
        break;
      case "-r":
      case "--replace":
        args.replace = take();
        break;
      case "-n":
      case "--max":
        args.max = Number(take());
        if (!Number.isFinite(args.max) || args.max < 1) {
          throw new Error("--max must be a positive number.");
        }
        break;
      case "--font":
        args.font = take();
        break;
      case "--ignore-case":
        args.caseInsensitive = true;
        break;
      case "--extract":
        args.extract = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positional.push(arg);
    }
  }

  args.input ??= positional[0];
  args.find ??= positional[1];
  args.replace ??= positional[2];
  args.output ??= positional[3];

  return args;
}

function defaultOutputPath(inputPath: string): string {
  const file = basename(inputPath);
  const replaced = file.toLowerCase().endsWith(".pdf")
    ? `${file.slice(0, -4)}-replaced.pdf`
    : `${file}-replaced.pdf`;
  return resolve(inputPath, "..", replaced);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.input) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = resolve(args.input);

  if (args.extract) {
    console.log(await extractPdfText(inputPath));
    return;
  }

  if (args.find === undefined || args.replace === undefined) {
    printHelp();
    process.exit(1);
  }

  const outputPath = resolve(args.output ?? defaultOutputPath(inputPath));
  const result = await replacePdfText({
    inputPath,
    find: args.find,
    replaceWith: args.replace,
    caseSensitive: !args.caseInsensitive,
    maxReplacements: args.max,
    substituteFontPath: args.font,
  });

  await writeFile(outputPath, result.bytes);

  console.log(`Found ${result.matchCount} match(es).`);
  console.log(`Replaced ${result.replaced.length} occurrence(s).`);

  for (const item of result.replaced) {
    console.log(
      `  page ${item.pageIndex + 1}: "${item.original}" -> "${item.replacement}" [${item.strategy}]`
    );
  }

  for (const item of result.skipped) {
    console.log(`  skipped page ${item.pageIndex + 1}: "${item.text}" (${item.reason})`);
  }

  console.log(`Wrote ${outputPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
