import type { LookupAddress } from 'node:dns';
import { describe, expect, it } from 'vitest';
import { pinnedLookup, type ResolvedAddress } from '../src/modules/webhooks/http';

const addresses: [ResolvedAddress, ...ResolvedAddress[]] = [
  { address: '2001:db8::1', family: 6 },
  { address: '203.0.113.7', family: 4 },
];

const resolve = (all: boolean) =>
  new Promise<{ address: string | LookupAddress[]; family?: number }>((done, fail) => {
    pinnedLookup(addresses)('hooks.example', { all }, (error, address, family) =>
      error ? fail(error) : done({ address, family }),
    );
  });

describe('pinned webhook lookup', () => {
  it('offers every validated address, so a dead first one does not fail the delivery', async () => {
    expect((await resolve(true)).address).toEqual(addresses);
  });

  it('answers a single-address lookup with the first validated address', async () => {
    expect(await resolve(false)).toEqual({ address: '2001:db8::1', family: 6 });
  });
});
