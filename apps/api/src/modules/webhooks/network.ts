import { BlockList, isIP } from 'node:net';

/** Ranges a webhook must not reach by default: loopback, private, link-local, multicast and friends. */
const nonPublic = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  nonPublic.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  nonPublic.addSubnet(address, prefix, 'ipv6');
}

/** True for an IP literal that is safe to call from the server. IPv4-mapped IPv6 is judged as IPv4. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !nonPublic.check(address, family === 4 ? 'ipv4' : 'ipv6');
}
