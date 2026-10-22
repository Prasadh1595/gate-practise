// Dependency-free password hashing (scrypt) + ids, replacing bcryptjs / uuid.
const crypto = require('crypto');

function hashSync(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function compareSync(password, stored) {
  try {
    const [scheme, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

const uuid = () => crypto.randomUUID();

module.exports = { hashSync, compareSync, uuid };
