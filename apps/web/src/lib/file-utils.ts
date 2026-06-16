import JSZip from "jszip";
import type { TransferFile } from "@blacking/protocol";

export async function readFilesFromInput(fileList: FileList): Promise<TransferFile[]> {
  const files = Array.from(fileList);
  const results: TransferFile[] = [];

  for (const file of files) {
    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const buffer = await file.arrayBuffer();
    results.push({ path: relativePath, content: new Uint8Array(buffer) });
  }

  return results;
}

export function downloadFile(path: string, content: Uint8Array): void {
  const blob = new Blob([new Uint8Array(content) as BlobPart]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = path.split("/").pop() ?? path;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadAsZip(files: TransferFile[], zipName = "transfer.zip"): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = zipName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
