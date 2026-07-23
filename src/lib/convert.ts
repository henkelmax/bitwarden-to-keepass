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

// kdbxweb defaults to a very weak KDF (1 MiB memory, 2 iterations). Use parameters comparable to
// a modern KeePass client so the exported database resists brute-forcing of the master password.
const ARGON2_MEMORY_BYTES = 64 * 1024 * 1024;
const ARGON2_ITERATIONS = 10;
const ARGON2_PARALLELISM = 4;

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
  const { ValueType } = kdbxweb.VarDictionary;
  const kdf = db.header.kdfParameters!;
  kdf.set('M', ValueType.UInt64, kdbxweb.Int64.from(ARGON2_MEMORY_BYTES));
  kdf.set('I', ValueType.UInt64, kdbxweb.Int64.from(ARGON2_ITERATIONS));
  kdf.set('P', ValueType.UInt32, ARGON2_PARALLELISM);

  const root = db.getDefaultGroup();

  // Safety net: keep the complete original export as an attachment on a dedicated entry,
  // so nothing is lost even if a field or item type isn't mapped.
  const master = db.createEntry(root);
  master.fields.set('Title', 'Original Bitwarden export');
  master.fields.set(
    'Notes',
    'Full original Bitwarden export, attached verbatim as a backup in case any item was not mapped.',
  );
  master.binaries.set(fileName, await db.createBinary(toArrayBuffer(bytes)));

  // Bitwarden stores nested folders as a flat list with "/" in the name ("Top/Nested"),
  // so build the matching KeePass group hierarchy, reusing shared parents.
  const pathGroups = new Map<string, kdbxweb.KdbxGroup>();
  const ensureGroup = (name: string): kdbxweb.KdbxGroup => {
    const segments = name.split('/').map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return db.createGroup(root, '(unnamed folder)');
    let parent = root;
    let path = '';
    for (const segment of segments) {
      path = path ? `${path}/${segment}` : segment;
      let group = pathGroups.get(path);
      if (!group) {
        group = db.createGroup(parent, segment);
        pathGroups.set(path, group);
      }
      parent = group;
    }
    return parent;
  };

  const groups = new Map<string | null, kdbxweb.KdbxGroup>();
  for (const folder of vault.folders ?? []) {
    groups.set(folder.id, ensureGroup(folder.name ?? ''));
  }
  const noFolderGroup = (): kdbxweb.KdbxGroup => {
    let group = groups.get(null);
    if (!group) {
      group = db.createGroup(root, 'No Folder');
      groups.set(null, group);
    }
    return group;
  };

  const lookup = (itemId: string) => attachments.get(itemId) ?? [];

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
    const name = uniqueFieldName(entry, field.name);
    entry.fields.set(
      name,
      field.protected ? kdbxweb.ProtectedValue.fromString(field.value) : field.value,
    );
  }

  for (const attachment of mapped.attachments) {
    const binary = await db.createBinary(toArrayBuffer(attachment.data));
    entry.binaries.set(attachment.name, binary);
  }
}

/**
 * Finds a field name that doesn't collide with one already on the entry, so custom fields
 * can't overwrite standard fields (Title, Password, ...) or each other. KeePass field names
 * must be unique, so colliding names get a numeric suffix ("Title", "Title 2", ...).
 */
function uniqueFieldName(entry: kdbxweb.KdbxEntry, name: string): string {
  if (!entry.fields.has(name)) return name;
  let i = 2;
  while (entry.fields.has(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer;
  }
  return data.slice().buffer;
}
