import { describe, expect, it } from 'vitest';
import { parseDropboxSetupHash } from '../src/app/dropboxSetup';

describe('Dropbox setup link', () => {
  it('reads the refresh token from the link', () => {
    expect(parseDropboxSetupHash('#/dropbox-setup/abcDEF123_-abcDEF123_-xyz')).toBe('abcDEF123_-abcDEF123_-xyz');
  });
  it('ignores other links and malformed tokens', () => {
    expect(parseDropboxSetupHash('#/settings')).toBeUndefined();
    expect(parseDropboxSetupHash('#/enroll/abcDEF123_-abcDEF123_-xyz')).toBeUndefined();
    expect(parseDropboxSetupHash('#/dropbox-setup/short')).toBeUndefined();
    expect(parseDropboxSetupHash('#/dropbox-setup/has spaces in it and more text')).toBeUndefined();
    expect(parseDropboxSetupHash('#/dropbox-setup/abcDEF123_-abcDEF123_-xyz/extra')).toBeUndefined();
  });
});
