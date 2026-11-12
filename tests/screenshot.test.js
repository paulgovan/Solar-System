import { describe, it, expect } from 'vitest';
import { screenshotFilename, shareURL } from '../src/ui/screenshot.js';
import { dateToJD } from '../src/ephemeris/index.js';
import { state } from '../src/state.js';
import { scale } from '../src/scale.js';

const jd = (iso) => dateToJD(new Date(iso));
const loc = { origin: 'https://paulgovan.github.io', pathname: '/Solar-System/' };

describe('screenshot file name', () => {
  it('is date + time + body', () => {
    expect(screenshotFilename(jd('2026-11-12T20:47Z'), 'earth')).toBe('solar-system_2026-11-12_2047UTC_earth.png');
    expect(screenshotFilename(jd('1969-07-20T20:17Z'), 'moon')).toBe('solar-system_1969-07-20_2017UTC_moon.png');
  });
  it('is safe for any date or body', () => {
    const n = screenshotFilename(jd('0099-03-04T05:06Z'), 'Halley’s Comet!');
    expect(n).toMatch(/^solar-system_0099-03-04_0506UTC_HalleysComet\.png$/);
    expect(screenshotFilename(jd('-000099-03-04T05:06Z'), undefined)).toMatch(/^solar-system_100BC-03-04_0506UTC_sun\.png$/);
    expect(screenshotFilename(jd('2000-01-01T00:00Z'), 'sun')).not.toMatch(/[:/\\ ]/);
  });
});

describe('share URL', () => {
  it('always has the exact time and reflects body, scale and pause', () => {
    state.jd = jd('2027-02-19T15:41Z'); state.selected = 'mars'; state.playing = false; scale.target = 0;
    const u = new URL(shareURL('', loc));
    expect(u.origin + u.pathname).toBe('https://paulgovan.github.io/Solar-System/');
    const p = new URLSearchParams(u.hash.slice(1));
    expect(p.get('t')).toBe('2027-02-19T15:41Z');
    expect(p.get('body')).toBe('mars');
    expect(p.get('scale')).toBe('true');
    expect(p.get('paused')).toBe('1');
  });
  it('drops defaults and keeps parameters other features wrote', () => {
    state.jd = jd('2027-02-19T15:41Z'); state.selected = 'sun'; state.playing = true; scale.target = 1;
    const p = new URLSearchParams(new URL(shareURL('#body=moon&scale=true&paused=1&obs=51.5,-0.1', loc)).hash.slice(1));
    expect(p.get('t')).toBe('2027-02-19T15:41Z');
    expect(p.has('body')).toBe(false);
    expect(p.has('scale')).toBe(false);
    expect(p.has('paused')).toBe(false);
    expect(p.get('obs')).toBe('51.5,-0.1');
  });
});
