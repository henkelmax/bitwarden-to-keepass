import * as kdbxweb from 'kdbxweb';
import { registerArgon2 } from './argon2';
import { ItemType, parseExport } from './bitwarden';
import { MappedEntry, mapItem } from './mapping';
import { readExport } from './unzip';

export interface ConversionSummary {
  entries: number;
  attachments: number;
  totp: number;
  sshKeys: number;
  folders: number;
}

export interface ConversionResult {
  kdbx: Uint8Array;
  summary: ConversionSummary;
}

let argon2Registered = false;

/** Converts a Bitwarden export (zip or json) into an encrypted KeePass database. */
export async function convert(
  fileName: string,
  bytes: Uint8Array,
  masterPassword: string,
): Promise<ConversionResult> {
  if (!argon2Registered) {
    registerArgon2();
    argon2Registered = true;
  }

  const { json, attachments } = readExport(fileName, bytes);
  const vault = parseExport(json);

  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(masterPassword));
  const db = kdbxweb.Kdbx.create(credentials, 'Bitwarden Export');
  db.setKdf(kdbxweb.Consts.KdfId.Argon2id);

  const root = db.getDefaultGroup();

  // Safety net: keep the complete original export as an attachment on a "Master" entry,
  // so nothing is lost even if a field or item type isn't mapped.
  const master = db.createEntry(root);
  master.fields.set('Title', 'Master');
  master.fields.set(
    'Notes',
    'Full original Bitwarden export, attached verbatim as a backup in case any item was not mapped.',
  );
  master.binaries.set(fileName, await db.createBinary(toArrayBuffer(bytes)));

  // One KeePass group per Bitwarden folder; items without a folder land in "No Folder".
  const groups = new Map<string | null, kdbxweb.KdbxGroup>();
  for (const folder of vault.folders ?? []) {
    groups.set(folder.id, db.createGroup(root, folder.name || '(unnamed folder)'));
  }
  const noFolderGroup = (): kdbxweb.KdbxGroup => {
    let group = groups.get(null);
    if (!group) {
      group = db.createGroup(root, 'No Folder');
      groups.set(null, group);
    }
    return group;
  };

  const lookup = (itemId: string, name: string) => attachments.get(`${itemId}/${name}`);

  const summary: ConversionSummary = {
    entries: 0,
    attachments: 0,
    totp: 0,
    sshKeys: 0,
    folders: vault.folders?.length ?? 0,
  };

  for (const item of vault.items ?? []) {
    if (item.deletedDate) continue;
    const mapped = mapItem(item, lookup);
    const group = groups.get(mapped.folderId) ?? noFolderGroup();
    await addEntry(db, group, mapped);
    summary.entries++;
    summary.attachments += mapped.attachments.length;
    if (mapped.otp) summary.totp++;
    if (item.type === ItemType.SshKey) summary.sshKeys++;
  }

  const kdbx = new Uint8Array(await db.save());
  return { kdbx, summary };
}

async function addEntry(
  db: kdbxweb.Kdbx,
  group: kdbxweb.KdbxGroup,
  mapped: MappedEntry,
): Promise<void> {
  const entry = db.createEntry(group);
  entry.fields.set('Title', mapped.title);
  if (mapped.username) entry.fields.set('UserName', mapped.username);
  if (mapped.password) {
    entry.fields.set('Password', kdbxweb.ProtectedValue.fromString(mapped.password));
  }
  if (mapped.url) entry.fields.set('URL', mapped.url);
  if (mapped.notes) entry.fields.set('Notes', mapped.notes);
  if (mapped.otp) entry.fields.set('otp', mapped.otp);

  for (const field of mapped.fields) {
    entry.fields.set(
      field.name,
      field.protected ? kdbxweb.ProtectedValue.fromString(field.value) : field.value,
    );
  }

  for (const attachment of mapped.attachments) {
    const binary = await db.createBinary(toArrayBuffer(attachment.data));
    entry.binaries.set(attachment.name, binary);
  }
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer;
  }
  return data.slice().buffer;
}
