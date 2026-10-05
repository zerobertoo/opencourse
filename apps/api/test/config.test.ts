import { describe, expect, it } from 'vitest';
import { INSECURE_DEV_AUTH_SECRET, loadConfig, PLACEHOLDER_AUTH_SECRET } from '../src/config';

const required = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://x',
  AUTH_SECRET: 'a-secret-that-is-long-enough-for-hmac-1234',
};

describe('loadConfig', () => {
  it('applies defaults and parses the CORS origin list', () => {
    const config = loadConfig({ ...required, CORS_ORIGINS: 'http://a.test, http://b.test' });
    expect(config.PORT).toBe(3000);
    expect(config.CORS_ORIGINS).toEqual(['http://a.test', 'http://b.test']);
  });

  it('fails fast with every missing variable named', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*REDIS_URL[\s\S]*AUTH_SECRET/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => loadConfig({ ...required, PORT: '70000' })).toThrow(/PORT/);
  });

  it('rejects a short auth secret', () => {
    expect(() => loadConfig({ ...required, AUTH_SECRET: 'too-short' })).toThrow(/AUTH_SECRET/);
  });

  it('refuses the placeholder from .env.example in production', () => {
    expect(() =>
      loadConfig({ ...required, AUTH_SECRET: PLACEHOLDER_AUTH_SECRET, NODE_ENV: 'production' }),
    ).toThrow(/AUTH_SECRET/);
  });

  it('refuses the development secret in production only', () => {
    const withDevSecret = { ...required, AUTH_SECRET: INSECURE_DEV_AUTH_SECRET };
    expect(() => loadConfig({ ...withDevSecret, NODE_ENV: 'production' })).toThrow(/AUTH_SECRET/);
    expect(loadConfig({ ...withDevSecret, NODE_ENV: 'development' }).AUTH_SECRET).toBe(
      INSECURE_DEV_AUTH_SECRET,
    );
  });

  it('marks cookies secure by default only in production, unless overridden', () => {
    expect(loadConfig({ ...required, NODE_ENV: 'production' }).COOKIE_SECURE).toBe(true);
    expect(loadConfig({ ...required, NODE_ENV: 'development' }).COOKIE_SECURE).toBe(false);
    expect(
      loadConfig({ ...required, NODE_ENV: 'production', COOKIE_SECURE: 'false' }).COOKIE_SECURE,
    ).toBe(false);
  });
});
