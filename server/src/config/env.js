import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
const result = dotenv.config({ path: envPath });

// Deliberately export only presence/status metadata, never parsed values.
export const envFileLoaded = !result.error;
export const envFileMissing = Boolean(result.error);
