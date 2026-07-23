import { describe, expect, it } from 'vitest';
import { BwItem, ItemType, FieldType } from './bitwarden';
import { mapItem, toOtpauthUri } from './mapping';

const noAttachments = () => [];

describe('toOtpauthUri', () => {
  it('wraps a bare base32 secret', () => {
    expect(toOtpauthUri('JBSWY3DPEHPK3PXP', 'GitHub')).toBe(
      'otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP',
    );
  });

  it('passes through an existing otpauth URI', () => {
    const uri = 'otpauth://totp/x?secret=ABC&issuer=y';
    expect(toOtpauthUri(uri, 'x')).toBe(uri);
  });
});

describe('mapItem', () => {
  it('maps a login with TOTP and multiple URIs', () => {
    const item: BwItem = {
      id: '1',
      type: ItemType.Login,
      name: 'Example',
      folderId: 'f1',
      login: {
        username: 'user',
        password: 'secret',
        totp: 'JBSWY3DPEHPK3PXP',
        uris: [{ uri: 'https://a.com' }, { uri: 'https://b.com' }],
      },
    };
    const entry = mapItem(item, noAttachments);
    expect(entry.username).toBe('user');
    expect(entry.password).toBe('secret');
    expect(entry.url).toBe('https://a.com');
    expect(entry.otp).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(entry.fields).toContainEqual({ name: 'URL 2', value: 'https://b.com', protected: false });
    expect(entry.folderId).toBe('f1');
  });

  it('maps an SSH key to fields plus a private-key attachment', () => {
    const item: BwItem = {
      id: '2',
      type: ItemType.SshKey,
      name: 'my server',
      sshKey: {
        privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----',
        publicKey: 'ssh-ed25519 AAAA...',
        keyFingerprint: 'SHA256:xyz',
      },
    };
    const entry = mapItem(item, noAttachments);
    expect(entry.fields).toContainEqual({ name: 'Public Key', value: 'ssh-ed25519 AAAA...', protected: false });
    expect(entry.fields.find((f) => f.name === 'Private Key')?.protected).toBe(true);
    expect(entry.attachments).toHaveLength(1);
    expect(entry.attachments[0].name).toBe('my server');
    expect(new TextDecoder().decode(entry.attachments[0].data)).toContain('BEGIN OPENSSH');
  });

  it('maps hidden custom fields as protected', () => {
    const item: BwItem = {
      id: '3',
      type: ItemType.SecureNote,
      name: 'note',
      notes: 'hello',
      fields: [
        { name: 'plain', value: 'v', type: FieldType.Text },
        { name: 'secret', value: 's', type: FieldType.Hidden },
      ],
    };
    const entry = mapItem(item, noAttachments);
    expect(entry.notes).toBe('hello');
    expect(entry.fields).toContainEqual({ name: 'plain', value: 'v', protected: false });
    expect(entry.fields).toContainEqual({ name: 'secret', value: 's', protected: true });
  });

  it('attaches every file found in the item folder, by item id', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const item: BwItem = {
      id: '4',
      type: ItemType.Login,
      name: 'with file',
    };
    const entry = mapItem(item, (id) => (id === '4' ? [{ name: 'doc.pdf', data: bytes }] : []));
    expect(entry.attachments).toContainEqual({ name: 'doc.pdf', data: bytes });
  });
});
