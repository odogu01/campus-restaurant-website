/**
 * Random password generator for vendor accounts.
 * Produces a 10-character alphanumeric password (crypto-secure).
 */
const crypto = require('crypto');

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 10;

/**
 * @returns {string} random 10-char alphanumeric password
 */
function generatePassword(length = LENGTH) {
  // crypto.randomInt avoids modulo bias — better than Math.random()*charset.
  return Array.from(
    { length },
    () => CHARSET[crypto.randomInt(CHARSET.length)]
  ).join('');
}

module.exports = { generatePassword };