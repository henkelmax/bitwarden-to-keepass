import {
  BwItem,
  BwIdentity,
  FieldType,
  ItemType,
} from './bitwarden';

export interface MappedField {
  name: string;
  value: string;
  protected: boolean;
}

export interface MappedAttachment {
  name: string;
  data: Uint8Array;
}

/** A KeePass-ready entry, decoupled from the kdbxweb database so it can be unit tested. */
export interface MappedEntry {
  folderId: string | null;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  /** otpauth:// URI stored in the KeePassXC "otp" field. */
  otp?: string;
  fields: MappedField[];
  attachments: MappedAttachment[];
}

/** Returns all decrypted attachment files belonging to an item. */
export type AttachmentLookup = (itemId: string) => MappedAttachment[];

const encoder = new TextEncoder();

/** Builds an otpauth:// URI KeePassXC understands, wrapping a bare base32 secret if needed. */
export function toOtpauthUri(totp: string, label: string): string {
  const value = totp.trim();
  if (value.startsWith('otpauth://') || value.startsWith('steam://')) {
    return value;
  }
  const secret = value.replace(/\s+/g, '');
  return `otpauth://totp/${encodeURIComponent(label || 'TOTP')}?secret=${secret}`;
}

function push(fields: MappedField[], name: string, value: unknown, isProtected = false): void {
  if (value !== null && value !== undefined && String(value).length > 0) {
    fields.push({ name, value: String(value), protected: isProtected });
  }
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned.length > 0 ? cleaned : 'key';
}

const IDENTITY_LABELS: [keyof BwIdentity, string][] = [
  ['title', 'Title'],
  ['firstName', 'First Name'],
  ['middleName', 'Middle Name'],
  ['lastName', 'Last Name'],
  ['username', 'Username'],
  ['company', 'Company'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['ssn', 'SSN'],
  ['passportNumber', 'Passport Number'],
  ['licenseNumber', 'License Number'],
  ['address1', 'Address 1'],
  ['address2', 'Address 2'],
  ['address3', 'Address 3'],
  ['city', 'City'],
  ['state', 'State'],
  ['postalCode', 'Postal Code'],
  ['country', 'Country'],
];

/** Maps a single Bitwarden item to a normalized KeePass entry. */
export function mapItem(item: BwItem, lookup: AttachmentLookup): MappedEntry {
  const entry: MappedEntry = {
    folderId: item.folderId ?? null,
    title: item.name?.trim() || '(no name)',
    notes: item.notes ?? undefined,
    fields: [],
    attachments: [],
  };

  switch (item.type) {
    case ItemType.Login: {
      const login = item.login ?? {};
      entry.username = login.username ?? undefined;
      entry.password = login.password ?? undefined;
      const uris = (login.uris ?? []).map((u) => u.uri).filter((u): u is string => !!u);
      entry.url = uris[0];
      uris.slice(1).forEach((uri, i) => push(entry.fields, `URL ${i + 2}`, uri));
      if (login.totp) {
        entry.otp = toOtpauthUri(login.totp, entry.title);
      }
      const passkeys = (login.fido2Credentials ?? []).map((c) => c.rpId).filter(Boolean);
      if (passkeys.length > 0) {
        push(entry.fields, 'Passkeys (not usable in KeePass)', passkeys.join(', '));
      }
      break;
    }
    case ItemType.Card: {
      const card = item.card ?? {};
      push(entry.fields, 'Cardholder Name', card.cardholderName);
      push(entry.fields, 'Brand', card.brand);
      push(entry.fields, 'Number', card.number, true);
      if (card.expMonth || card.expYear) {
        push(entry.fields, 'Expiration', `${card.expMonth ?? '??'}/${card.expYear ?? '????'}`);
      }
      push(entry.fields, 'Security Code', card.code, true);
      break;
    }
    case ItemType.Identity: {
      const identity = item.identity ?? {};
      for (const [key, label] of IDENTITY_LABELS) {
        push(entry.fields, label, identity[key]);
      }
      break;
    }
    case ItemType.SshKey: {
      const ssh = item.sshKey ?? {};
      push(entry.fields, 'Public Key', ssh.publicKey);
      push(entry.fields, 'Fingerprint', ssh.keyFingerprint);
      push(entry.fields, 'Private Key', ssh.privateKey, true);
      if (ssh.privateKey) {
        entry.attachments.push({
          name: sanitizeFileName(entry.title),
          data: encoder.encode(ssh.privateKey),
        });
      }
      break;
    }
    case ItemType.SecureNote:
    default:
      break;
  }

  for (const field of item.fields ?? []) {
    if (!field.name || field.type === FieldType.Linked) continue;
    push(entry.fields, field.name, field.value, field.type === FieldType.Hidden);
  }

  for (const file of lookup(item.id)) {
    entry.attachments.push(file);
  }

  return entry;
}
