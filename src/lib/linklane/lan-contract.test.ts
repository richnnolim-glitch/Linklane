import assert from "node:assert/strict";
import test from "node:test";
import {
  LAN_DISCOVERY_MAX_PACKET_BYTES,
  encodeLanDiscoveryPacket,
  parseLanDiscoveryPacket,
  validatePeerAdvertisement,
} from "./lan-contract.ts";

test("round-trips a discovery request", () => {
  const packet = { type: "discover" as const, version: 1 as const, id: "device-12345678" };
  assert.deepEqual(parseLanDiscoveryPacket(encodeLanDiscoveryPacket(packet)), packet);
});

test("round-trips a peer advertisement", () => {
  const packet = {
    type: "advertise" as const,
    peer: { version: 1 as const, id: "device-12345678", name: "Office PC", device: "linux" as const, port: 45822 },
  };
  assert.deepEqual(parseLanDiscoveryPacket(encodeLanDiscoveryPacket(packet)), packet);
});

test("rejects unknown versions, invalid ports and oversized packets", () => {
  assert.equal(parseLanDiscoveryPacket(JSON.stringify({ type: "discover", version: 2, id: "device-12345678" })), null);
  assert.equal(validatePeerAdvertisement({ version: 1, id: "device-12345678", name: "PC", device: "linux", port: 70000 }), null);
  assert.equal(parseLanDiscoveryPacket("x".repeat(LAN_DISCOVERY_MAX_PACKET_BYTES + 1)), null);
});

test("rejects malformed and untrusted discovery payloads", () => {
  assert.equal(parseLanDiscoveryPacket("{"), null);
  assert.equal(validatePeerAdvertisement({ version: 1, id: "bad", name: "PC", device: "linux", port: 45822 }), null);
  assert.equal(validatePeerAdvertisement({ version: 1, id: "device-12345678", name: "PC", device: "ios", port: 45822 }), null);
});
