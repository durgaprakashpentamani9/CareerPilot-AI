import mongoose from 'mongoose';
import { ConnectionString } from 'mongodb-connection-string-url';

export const dbState = { mode: 'memory', connected: false };

function validateMongoUri(uri) {
  if (typeof uri !== 'string' || !uri.trim()) return 'missing';
  try {
    const parsed = new ConnectionString(uri);
    if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) return 'scheme';
    if (!parsed.hosts?.length) return 'host';
    if (parsed.protocol === 'mongodb+srv:' && (parsed.hosts.length !== 1 || parsed.hosts[0].includes(':'))) return 'srv_port';
    return 'valid';
  } catch {
    return 'format';
  }
}

function classifyConnectionError(error) {
  const seen = new Set();
  const pending = [error];
  const codes = new Set();
  const names = new Set();
  const messages = [];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (current.code) codes.add(String(current.code).toUpperCase());
    if (current.name) names.add(String(current.name));
    if (current.codeName) names.add(String(current.codeName));
    if (typeof current.message === 'string') messages.push(current.message.toLowerCase());
    pending.push(current.cause, current.reason);
    if (current.servers instanceof Map) pending.push(...current.servers.values());
  }
  const message = messages.join(' ');
  if (codes.has('18') || names.has('AuthenticationFailed') || /authentication failed|bad auth|auth failed/.test(message)) return 'authentication';
  if ([...codes].some(code => ['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT'].includes(code)) || [...names].some(name => /TLS|Certificate/.test(name)) || /tls handshake|certificate verify|ssl routines|wrong version number/.test(message)) return 'tls';
  if (/querysrv.*econnrefused|econnrefused.*querysrv/.test(message)) return 'dns_resolver_refused';
  if ([...codes].some(code => ['ENOTFOUND', 'EAI_AGAIN', 'ENODATA', 'ESERVFAIL'].includes(code)) || /querysrv|dns|enotfound|eai_again|enodata/.test(message)) return 'dns';
  if (/ip address|whitelist|allowlist|not authorized to access|network access/.test(message)) return 'atlas_network_access';
  if ([...codes].some(code => ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'].includes(code)) || /econnrefused|etimedout|econnreset|timed out|connection refused|network is unreachable/.test(message)) return 'network';
  if ([...names].some(name => /ServerSelectionError|TopologyDescription/.test(name)) || /server selection|serverselection/.test(message)) return 'server_selection';
  if ([...names].some(name => /MongoParseError|MongoInvalidArgumentError/.test(name))) return 'uri_format';
  return 'other';
}

function safeFailureHint(category) {
  return {
    uri_format: 'MongoDB URI format is invalid; check scheme, hostname, and SRV options.',
    authentication: 'MongoDB authentication failed; check the database username, password encoding, and authSource.',
    tls: 'MongoDB TLS validation failed; use Atlas TLS settings and a current Node.js CA certificate store. Certificate validation remains enabled.',
    dns: 'MongoDB DNS lookup failed; check the Atlas cluster hostname and DNS/SRV access.',
    dns_resolver_refused: 'The configured DNS resolver refused the Atlas SRV lookup; check approved DNS access for SRV records.',
    atlas_network_access: 'Atlas rejected network access; check the project IP access list and outbound network rules.',
    network: 'MongoDB host could not be reached; check network access, firewall rules, and cluster availability.',
    server_selection: 'MongoDB hosts were discovered but no server became selectable; verify topology options and replica-set reachability.',
    other: 'MongoDB connection failed for an unclassified reason; inspect Atlas status and the local network configuration.',
  }[category];
}

// Use short, bounded connection attempts so a missing or unreachable Atlas
// cluster never prevents the local in-memory application from starting.
export async function connectDatabase(uri = process.env.MONGODB_URI) {
  const uriStatus = validateMongoUri(uri);
  if (uriStatus === 'missing') {
    dbState.mode = 'memory';
    dbState.connected = false;
    console.info('Database mode: in-memory (MONGODB_URI is not configured).');
    return false;
  }
  if (uriStatus !== 'valid') {
    dbState.mode = 'memory';
    dbState.connected = false;
    console.warn(`MongoDB URI validation failed (${uriStatus}); continuing with in-memory storage.`);
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      family: 4,
      bufferCommands: false,
    });
    dbState.mode = 'mongo';
    dbState.connected = true;
    console.info('Database mode: MongoDB connected.');
    return true;
  } catch (error) {
    dbState.mode = 'memory';
    dbState.connected = false;
    // Log a category and a static hint only. Never log the URI or raw driver
    // exception because either can contain credentials or private host data.
    const category = classifyConnectionError(error);
    console.warn(`MongoDB connection failed (${category}); ${safeFailureHint(category)} Continuing with in-memory storage.`);
    try { await mongoose.disconnect(); } catch { /* best-effort cleanup */ }
    return false;
  }
}

export async function closeDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  dbState.mode = 'memory';
  dbState.connected = false;
}
