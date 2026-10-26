import test from 'node:test';
import assert from 'node:assert/strict';
import { getDefaultCalendarProvider, calendarProviders, calendarFeedUrl } from '../src/utils/calendarSubscription.ts';

test('selects a calendar for Apple, Android, Windows and other devices', () => {
  const cases = [
    [{ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone' }, 'Apple'],
    [{ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', platform: 'iPad' }, 'Apple'],
    [{ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }, 'Apple'],
    [{ platform: 'MacIntel', maxTouchPoints: 0 }, 'Apple'],
    [{ userAgent: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l' }, 'Google'],
    [{ platform: 'Linux x86_64', userAgentData: { platform: 'Android' } }, 'Google'],
    [{ platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 'Outlook'],
    [{ userAgentData: { platform: 'Windows' } }, 'Outlook'],
    [{ platform: 'Linux x86_64' }, 'Google'],
    [{ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64)' }, 'Google'],
    [{}, 'Google'],
  ] as const;
  for (const [device, expected] of cases) assert.equal(getDefaultCalendarProvider(device), expected);
});

test('all subscription options refer to the supplied public calendar', () => {
  assert.equal(calendarProviders.Apple.href.replace(/^webcal:/, 'https:'), calendarFeedUrl);
  for (const key of ['Outlook', 'Microsoft365'] as const) {
    const url = new URL(calendarProviders[key].href);
    assert.equal(url.searchParams.get('url'), calendarFeedUrl);
    assert.equal(url.searchParams.get('name'), "Acton Citizens' Band");
  }
  assert.equal(new URL(calendarProviders.Google.href).searchParams.get('cid'),
    decodeURIComponent(new URL(calendarFeedUrl).pathname.split('/')[3]));
});
