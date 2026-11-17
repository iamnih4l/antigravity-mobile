import crypto from 'node:crypto';
import path from 'node:path';

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{35}/g,
  /ya29\.[0-9A-Za-z\-_]+/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{30,}/g,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]+['"]/gi,
];

export function redactSensitiveData(input) {
  if (typeof input !== 'string') return input;
  let out = input;
  for (const regex of SECRET_PATTERNS) {
    out = out.replace(regex, '[REDACTED_CREDENTIAL]');
  }
  return out;
}

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\b/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bsudo\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bchmod\s+777\b/i,
  /\bcurl\b.*\|\s*(sh|bash)\b/i,
];

export function evaluateCommandPolicy(command) {
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return {
        requiresApproval: true,
        riskLevel: 'critical',
        reason: `Command matches restricted security policy pattern (${pattern.source})`,
      };
    }
  }
  return { requiresApproval: false, riskLevel: 'normal', reason: null };
}

export class SecurityManager {
  constructor(db, options = {}) {
    this.db = db;
    this.hmacSecret = options.hmacSecret || crypto.randomBytes(32).toString('hex');
    this.authorizedRoots = new Set((options.authorizedRoots || [process.cwd()]).map((p) => path.resolve(p)));
    this.activePairingCode = null;
    this.pairingExpiresAt = 0;
    this.sessions = new Map();
    this.rateBuckets = new Map();
    this.sessionTtlMs = options.sessionTtlMs || 12 * 60 * 60 * 1000; // 12 hours
  }

  generatePairingQrPayload(hostUrl = 'http://127.0.0.1:8787') {
    const code = crypto.randomInt(100000, 999999).toString();
    const nonce = crypto.randomBytes(12).toString('hex');
    this.activePairingCode = { code, nonce };
    this.pairingExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    const qrPayload = JSON.stringify({
      protocol: 'antigravity-mobile-v1',
      endpoint: hostUrl,
      pairingCode: code,
      nonce,
      expiresAt: new Date(this.pairingExpiresAt).toISOString(),
    });
    return {
      pairingCode: code,
      nonce,
      expiresAt: new Date(this.pairingExpiresAt).toISOString(),
      qrPayload,
    };
  }

  async pairDevice({ pairingCode, deviceName = 'iPhone 16 Pro (Antigravity PWA)', clientIp = '127.0.0.1' }) {
    if (!this.activePairingCode || Date.now() > this.pairingExpiresAt) {
      throw new Error('Pairing code expired. Generate a new QR code.');
    }
    if (String(pairingCode) !== this.activePairingCode.code) {
      throw new Error('Invalid pairing code.');
    }
    // Single-use pairing code
    this.activePairingCode = null;
    const deviceId = `dev_${crypto.randomBytes(6).toString('hex')}`;
    const rawToken = `agm_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHmac('sha256', this.hmacSecret).update(rawToken).digest('hex');
    const pairedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + this.sessionTtlMs).toISOString();

    this.sessions.set(tokenHash, {
      deviceId,
      deviceName,
      pairedAt,
      expiresAt: Date.now() + this.sessionTtlMs,
      clientIp,
    });

    await this.db.exec(
      `INSERT INTO paired_devices (device_id, device_name, paired_at, expires_at, last_ip, token_hash, revoked)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [deviceId, deviceName, pairedAt, expiresAt, clientIp, tokenHash]
    );

    await this.db.recordEvent({
      project: 'security',
      category: 'security',
      description: `Paired mobile device "${deviceName}" (${deviceId}) via QR verification`,
      status: 'completed',
      details: { deviceId, deviceName, clientIp, expiresAt },
    });

    return {
      deviceId,
      deviceName,
      token: rawToken,
      expiresAt,
    };
  }

  verifyToken(rawToken) {
    if (!rawToken) return null;
    const clean = rawToken.replace(/^Bearer\s+/i, '').trim();
    const tokenHash = crypto.createHmac('sha256', this.hmacSecret).update(clean).digest('hex');
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(tokenHash);
      return null;
    }
    return session;
  }

  checkRateLimit(key = 'default', maxPerMinute = 120) {
    const now = Date.now();
    const bucket = this.rateBuckets.get(key) || { count: 0, resetAt: now + 60000 };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + 60000;
    }
    bucket.count += 1;
    this.rateBuckets.set(key, bucket);
    return bucket.count <= maxPerMinute;
  }

  authorizeWorkspacePath(targetPath) {
    const resolved = path.resolve(targetPath);
    for (const root of this.authorizedRoots) {
      if (resolved === root || resolved.startsWith(root + path.sep)) {
        return resolved;
      }
    }
    throw new Error(`Access denied: path "${targetPath}" is outside authorized workspaces.`);
  }

  addAuthorizedWorkspace(dirPath) {
    const resolved = path.resolve(dirPath);
    this.authorizedRoots.add(resolved);
    return Array.from(this.authorizedRoots);
  }
}
