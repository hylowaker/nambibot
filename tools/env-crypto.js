#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs     = require('fs');

const ALGO       = 'aes-256-gcm';
const SALT_LEN   = 16;
const IV_LEN     = 12;
const TAG_LEN    = 16;
const KEY_LEN    = 32;
const ITERATIONS = 100_000;
const DIGEST     = 'sha256';

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, ITERATIONS, KEY_LEN, DIGEST);
}

function encrypt(plaintext, passphrase) {
  const salt   = crypto.randomBytes(SALT_LEN);
  const iv     = crypto.randomBytes(IV_LEN);
  const key    = deriveKey(passphrase, salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);

  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag  = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, body]).toString('base64');
}

function decrypt(encoded, passphrase) {
  const buf  = Buffer.from(encoded.trim(), 'base64');
  const salt = buf.subarray(0, SALT_LEN);
  const iv   = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag  = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const body = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  const key      = deriveKey(passphrase, salt);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(body, undefined, 'utf8') + decipher.final('utf8');
}

const [,, cmd] = process.argv;
const passphrase = process.env.NAMBI_PASSPHRASE || '';

if (!passphrase) {
  process.stderr.write('오류: NAMBI_PASSPHRASE 환경변수가 설정되지 않았습니다.\n');
  process.exit(1);
}

if (cmd === 'encrypt') {
  const plaintext = fs.readFileSync('/dev/stdin', 'utf8');
  process.stdout.write(encrypt(plaintext, passphrase) + '\n');

} else if (cmd === 'decrypt') {
  const encoded = fs.readFileSync('/dev/stdin', 'utf8');
  try {
    process.stdout.write(decrypt(encoded, passphrase));
  } catch {
    process.stderr.write('복호화 실패: 잘못된 패스프레이즈이거나 파일이 손상되었습니다.\n');
    process.exit(1);
  }

} else {
  process.stderr.write(`알 수 없는 명령: ${cmd}\n사용법: node env-crypto.js <encrypt|decrypt>\n`);
  process.exit(1);
}
