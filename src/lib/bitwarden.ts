/** Types and parsing for Bitwarden / Vaultwarden vault exports (unencrypted JSON). */

export enum ItemType {
  Login = 1,
  SecureNote = 2,
  Card = 3,
  Identity = 4,
  SshKey = 5,
}

export enum FieldType {
  Text = 0,
  Hidden = 1,
  Boolean = 2,
  Linked = 3,
}

export interface BwFolder {
  id: string;
  name: string;
}

export interface BwUri {
  uri: string | null;
  match?: number | null;
}

export interface BwLogin {
  username?: string | null;
  password?: string | null;
  totp?: string | null;
  uris?: BwUri[] | null;
  fido2Credentials?: { rpId?: string | null }[] | null;
}

export interface BwCard {
  cardholderName?: string | null;
  brand?: string | null;
  number?: string | null;
  expMonth?: string | null;
  expYear?: string | null;
  code?: string | null;
}

export interface BwIdentity {
  title?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  username?: string | null;
  company?: string | null;
  ssn?: string | null;
  passportNumber?: string | null;
  licenseNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  address1?: string | null;
  address2?: string | null;
  address3?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface BwSshKey {
  privateKey?: string | null;
  publicKey?: string | null;
  keyFingerprint?: string | null;
}

export interface BwField {
  name?: string | null;
  value?: string | null;
  type?: FieldType;
}

export interface BwAttachment {
  id?: string | null;
  fileName?: string | null;
  size?: string | null;
}

export interface BwItem {
  id: string;
  type: ItemType;
  name?: string | null;
  notes?: string | null;
  folderId?: string | null;
  favorite?: boolean;
  deletedDate?: string | null;
  fields?: BwField[] | null;
  attachments?: BwAttachment[] | null;
  login?: BwLogin | null;
  card?: BwCard | null;
  identity?: BwIdentity | null;
  sshKey?: BwSshKey | null;
}

export interface BwExport {
  folders?: BwFolder[] | null;
  items?: BwItem[] | null;
}

/** Parses the export JSON, rejecting encrypted exports which we cannot decrypt offline. */
export function parseExport(json: string): BwExport {
  const data = JSON.parse(json);
  if (data?.encrypted === true) {
    throw new Error(
      'This is an encrypted export. Export as ".zip (with attachments)" or unencrypted ".json" instead.',
    );
  }
  if (!Array.isArray(data?.items)) {
    throw new Error('Not a Bitwarden export: no "items" array found.');
  }
  return data as BwExport;
}
