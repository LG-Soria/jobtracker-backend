"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COOKIE_MAX_AGE_MS = exports.JWT_EXPIRES_IN = exports.JWT_COOKIE_NAME = void 0;
exports.getJwtSecret = getJwtSecret;
exports.buildCookieOptions = buildCookieOptions;
exports.JWT_COOKIE_NAME = 'auth_token';
exports.JWT_EXPIRES_IN = '7d';
exports.COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEV_FALLBACK_SECRET = 'dev-jwt-secret-change-me';
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (secret && secret.trim().length > 0) {
        return secret;
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
    }
    return DEV_FALLBACK_SECRET;
}
function buildCookieOptions() {
    return {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: exports.COOKIE_MAX_AGE_MS,
        path: '/',
    };
}
//# sourceMappingURL=auth.constants.js.map