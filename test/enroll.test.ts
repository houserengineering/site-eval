import { describe, expect, it } from 'vitest';
import { parseEnrollHash } from '../src/app/enroll';

describe('enrollment link', () => {
  it('reads the token and the service URL', () => {
    expect(parseEnrollHash('#/enroll/sev_abcDEF123-_xyz?u=https%3A%2F%2Fa-b.trycloudflare.com')).toEqual({
      token: 'sev_abcDEF123-_xyz',
      serviceUrl: 'https://a-b.trycloudflare.com',
    });
    expect(parseEnrollHash('#/enroll/sev_abcDEF123')).toEqual({ token: 'sev_abcDEF123', serviceUrl: undefined });
  });

  it('ignores other routes, short tokens and non-https service URLs', () => {
    expect(parseEnrollHash('#/settings')).toBeUndefined();
    expect(parseEnrollHash('#/enroll/')).toBeUndefined();
    expect(parseEnrollHash('#/enroll/abc')).toBeUndefined();
    expect(parseEnrollHash('#/enroll/sev_abc<script>')).toBeUndefined();
    expect(parseEnrollHash('#/enroll/sev_abcDEF123?u=http%3A%2F%2Fevil.test')?.serviceUrl).toBeUndefined();
    expect(parseEnrollHash('#/enroll/sev_abcDEF123?u=javascript%3Aalert(1)')?.serviceUrl).toBeUndefined();
  });
});
