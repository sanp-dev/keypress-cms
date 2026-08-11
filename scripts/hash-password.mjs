// scripts/hash-password.mjs
import { pbkdf2, randomBytes } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

async function hashPassword(password) {
  const salt = randomBytes(16);
  const key  = await pbkdf2Async(password, salt, 100000, 32, 'sha256');
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

const password = process.argv[2];

if (!password) {
  console.error('\n❌  Usage: node scripts/hash-password.mjs <your-password>\n');
  process.exit(1);
}

const hash = await hashPassword(password);

console.log('\n✅  Hash generated:\n');
console.log(hash);
console.log('\n👆  Paste this into the "hash" field of USERS_JSON\n');