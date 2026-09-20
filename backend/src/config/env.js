/**
 * Load the backend's local environment file consistently, regardless of
 * whether Node was started from the repository root or the backend folder.
 *
 * On Vercel, the platform-provided environment variables are already present
 * in process.env. dotenv does not overwrite them.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
