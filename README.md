# Bitwarden -> KeePass

A small, fully client-side web app that converts a Bitwarden/Vaultwarden export into a KeePass
`.kdbx` database. Drop in your export, set a master password, download the database, and open it
offline in [KeePassXC](https://keepassxc.org/) - with passwords, TOTP, attachments and SSH keys.

Everything runs in your browser. The export contains your **decrypted** vault in plaintext, so the
app never uploads it anywhere - parsing and `.kdbx` generation happen entirely on your device.

## What gets converted

- **Folders** -> KeePass groups (items without a folder go to `No Folder`).
- **Logins** -> username, password, URL (extra URIs as fields), notes.
- **TOTP** -> stored in the `otp` field as an `otpauth://` URI, so KeePassXC generates codes natively.
- **Cards / Identities** -> structured custom fields.
- **SSH keys** -> public key + fingerprint as fields, private key as a protected field **and** as an
  attachment so KeePassXC's SSH agent can use it.
- **Custom fields** -> string fields (hidden ones stay protected).
- **Attachments** -> embedded into the matching entry.
- **Master** entry -> the complete original export, attached verbatim as a safety net.

Deleted (trashed) items are skipped.

## Producing the export

In the Bitwarden/Vaultwarden web vault: **Tools -> Export vault -> `.zip (with attachments)`**
(recommended, includes attachments and SSH keys). A plain `.json` export also works but has no
attachments. Encrypted exports are not supported (they can't be decrypted offline).

## Develop

```bash
npm install
npm run dev      # local dev server
npm run test     # unit + full round-trip tests
npm run build    # production build into dist/
```

## Security notes

- No backend, no telemetry, no external requests - enforced by a strict CSP.
- The master password you enter protects the output `.kdbx` only; it's unrelated to your Bitwarden
  master password and is never persisted.
- After converting, store the `.kdbx` somewhere safe and clear the plaintext export.
