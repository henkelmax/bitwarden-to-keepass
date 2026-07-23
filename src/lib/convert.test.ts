import { strToU8, zipSync } from 'fflate';
import * as kdbxweb from 'kdbxweb';
import { describe, expect, it } from 'vitest';
import { ItemType } from './bitwarden';
import { convert } from './convert';

const PASSWORD = 'correct horse battery';

const exportJson = {
  encrypted: false,
  folders: [
    { id: 'work', name: 'Work' },
    { id: 'servers', name: 'Servers' },
    { id: 'nested', name: 'Clients/Acme' },
  ],
  items: [
    {
      id: 'login-1',
      type: ItemType.Login,
      name: 'GitHub',
      folderId: 'work',
      login: {
        username: 'octocat',
        password: 'hunter2',
        totp: 'JBSWY3DPEHPK3PXP',
        uris: [{ uri: 'https://github.com' }],
      },
      // JSON name intentionally differs from the on-disk name (spaces vs hyphens).
      attachments: [{ id: 'att-1', fileName: 'recovery codes.txt' }],
    },
    {
      id: 'client-1',
      type: ItemType.Login,
      name: 'Acme login',
      folderId: 'nested',
      login: { username: 'acme', password: 'pw' },
    },
    {
      id: 'ssh-1',
      type: ItemType.SshKey,
      name: 'prod-server',
      folderId: 'servers',
      sshKey: {
        privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nKEYDATA\n-----END OPENSSH PRIVATE KEY-----',
        publicKey: 'ssh-ed25519 AAAAPUB prod',
        keyFingerprint: 'SHA256:abcdef',
      },
    },
    {
      id: 'note-1',
      type: ItemType.SecureNote,
      name: 'Loose note',
      notes: 'no folder here',
    },
    {
      id: 'trash-1',
      type: ItemType.Login,
      name: 'Deleted',
      deletedDate: '2026-01-01T00:00:00Z',
      login: { password: 'x' },
    },
  ],
};

const attachmentBytes = strToU8('code-1\ncode-2\n');

function buildZip(): Uint8Array {
  return zipSync({
    'bitwarden_export.json': strToU8(JSON.stringify(exportJson)),
    'attachments/login-1/recovery-codes.txt': attachmentBytes,
  });
}

async function loadDb(kdbx: Uint8Array): Promise<kdbxweb.Kdbx> {
  const credentials = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(PASSWORD));
  return kdbxweb.Kdbx.load(kdbx.buffer as ArrayBuffer, credentials);
}

function groupByName(db: kdbxweb.Kdbx, name: string): kdbxweb.KdbxGroup {
  const group = db.getDefaultGroup().groups.find((g) => g.name === name);
  if (!group) throw new Error(`group not found: ${name}`);
  return group;
}

function entryByTitle(group: kdbxweb.KdbxGroup, title: string): kdbxweb.KdbxEntry {
  const entry = group.entries.find((e) => e.fields.get('Title') === title);
  if (!entry) throw new Error(`entry not found: ${title}`);
  return entry;
}

function binaryBytes(entry: kdbxweb.KdbxEntry, name: string): Uint8Array {
  const binary = entry.binaries.get(name);
  if (!binary) throw new Error(`binary not found: ${name}`);
  const value = 'value' in binary ? binary.value : binary;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (value instanceof Uint8Array) return value;
  return value.getBinary(); // ProtectedValue
}

describe('convert (full round-trip)', () => {
  it('produces a kdbx with folders, attachments, TOTP and SSH keys in the right groups', async () => {
    const zip = buildZip();
    const { kdbx, summary } = await convert('vault.zip', zip, PASSWORD);

    expect(summary).toMatchObject({ folders: 3, totp: 1, sshKeys: 1 });
    expect(summary.entries).toBe(4); // deleted item skipped

    const db = await loadDb(kdbx);

    // Login lands in its folder, with TOTP and its attachment. The attachment is matched by
    // folder (item id), so the on-disk name is used even though the JSON name differs.
    const github = entryByTitle(groupByName(db, 'Work'), 'GitHub');
    expect(github.fields.get('UserName')).toBe('octocat');
    expect((github.fields.get('Password') as kdbxweb.ProtectedValue).getText()).toBe('hunter2');
    expect(github.fields.get('otp')).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(new TextDecoder().decode(binaryBytes(github, 'recovery-codes.txt'))).toBe('code-1\ncode-2\n');

    // Nested Bitwarden folder "Clients/Acme" becomes real nested groups.
    const acme = groupByName(db, 'Clients').groups.find((g) => g.name === 'Acme');
    if (!acme) throw new Error('nested group Acme not found');
    entryByTitle(acme, 'Acme login');

    // SSH key lands in its folder, with the private key as both field and attachment.
    const server = entryByTitle(groupByName(db, 'Servers'), 'prod-server');
    expect(server.fields.get('Public Key')).toBe('ssh-ed25519 AAAAPUB prod');
    expect((server.fields.get('Private Key') as kdbxweb.ProtectedValue).getText()).toContain('BEGIN OPENSSH');
    expect(new TextDecoder().decode(binaryBytes(server, 'prod-server'))).toContain('KEYDATA');

    // Item without a folder goes to "No Folder".
    entryByTitle(groupByName(db, 'No Folder'), 'Loose note');

    // Deleted item is not present anywhere.
    const allTitles = db
      .getDefaultGroup()
      .groups.flatMap((g) => g.entries.map((e) => e.fields.get('Title')));
    expect(allTitles).not.toContain('Deleted');

    // Master safety-net entry holds the full original export.
    const master = entryByTitle(db.getDefaultGroup(), 'Master');
    expect(binaryBytes(master, 'vault.zip')).toEqual(zip);
  });

  it('accepts a bare .json export (no attachments)', async () => {
    const { summary } = await convert('vault.json', strToU8(JSON.stringify(exportJson)), PASSWORD);
    expect(summary.entries).toBe(4);
    // Only the SSH private key; the login's file attachment is absent without the zip.
    expect(summary.attachments).toBe(1);
  });

  it("keeps the entry title when a custom field is also named 'Title'", async () => {
    const json = {
      encrypted: false,
      items: [
        {
          id: 'id-1',
          type: ItemType.Identity,
          name: 'John Doe',
          identity: { title: 'Mr', firstName: 'John' },
        },
      ],
    };
    const { kdbx } = await convert('vault.json', strToU8(JSON.stringify(json)), PASSWORD);
    const db = await loadDb(kdbx);
    const entry = entryByTitle(groupByName(db, 'No Folder'), 'John Doe');
    expect(entry.fields.get('Title')).toBe('John Doe');
    expect(entry.fields.get('Title 2')).toBe('Mr');
  });
});
