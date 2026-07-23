import { unzipSync } from 'fflate';

/** The extracted contents of an export: the vault JSON plus decrypted attachment blobs. */
export interface ExportContents {
  json: string;
  /** Attachment bytes keyed by "<itemId>/<fileName>". */
  attachments: Map<string, Uint8Array>;
}

const decoder = new TextDecoder();

/**
 * Reads a Bitwarden export. Accepts either a ".zip (with attachments)" archive
 * (a root *.json plus an `attachments/<itemId>/<fileName>` tree) or a bare *.json file.
 */
export function readExport(fileName: string, bytes: Uint8Array): ExportContents {
  if (fileName.toLowerCase().endsWith('.json')) {
    return { json: decoder.decode(bytes), attachments: new Map() };
  }

  const files = unzipSync(bytes);
  const attachments = new Map<string, Uint8Array>();
  let json: string | undefined;

  for (const [path, data] of Object.entries(files)) {
    const normalized = path.replace(/\\/g, '/');
    const attachmentKey = normalized.match(/(?:^|\/)attachments\/(.+\/.+)$/);
    if (attachmentKey) {
      attachments.set(attachmentKey[1], data);
    } else if (normalized.toLowerCase().endsWith('.json') && data.length > 0) {
      json = decoder.decode(data);
    }
  }

  if (!json) {
    throw new Error('No vault JSON file found inside the zip.');
  }
  return { json, attachments };
}
