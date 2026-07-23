import { unzipSync } from 'fflate';

export interface ExtractedFile {
  name: string;
  data: Uint8Array;
}

/** The extracted contents of an export: the vault JSON plus decrypted attachment blobs. */
export interface ExportContents {
  json: string;
  /** Attachment files grouped by their owning item id. */
  attachments: Map<string, ExtractedFile[]>;
}

const decoder = new TextDecoder();

/**
 * Reads a Bitwarden export. Accepts either a ".zip (with attachments)" archive
 * (a root *.json plus an `attachments/<itemId>/<fileName>` tree) or a bare *.json file.
 *
 * Files are grouped by the folder name (the item id) rather than matched against the
 * fileName in the JSON, because Bitwarden sanitizes and de-duplicates names on disk.
 */
export function readExport(fileName: string, bytes: Uint8Array): ExportContents {
  if (fileName.toLowerCase().endsWith('.json')) {
    return { json: decoder.decode(bytes), attachments: new Map() };
  }

  const files = unzipSync(bytes);
  const attachments = new Map<string, ExtractedFile[]>();
  let json: string | undefined;

  for (const [path, data] of Object.entries(files)) {
    const normalized = path.replace(/\\/g, '/');
    const match = normalized.match(/(?:^|\/)attachments\/([^/]+)\/(.+)$/);
    if (match && data.length > 0) {
      const [, itemId, rest] = match;
      const name = rest.split('/').pop() ?? rest;
      const list = attachments.get(itemId) ?? [];
      list.push({ name, data });
      attachments.set(itemId, list);
    } else if (normalized.toLowerCase().endsWith('.json') && data.length > 0) {
      json = decoder.decode(data);
    }
  }

  if (!json) {
    throw new Error('No vault JSON file found inside the zip.');
  }
  return { json, attachments };
}
