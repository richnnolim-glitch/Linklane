import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleVerifiedFile,
  CHUNK_BYTES,
  type FileMeta,
} from "./protocol.ts";

const meta = (size: number): FileMeta => ({
  name: "payload.bin",
  size,
  mime: "application/octet-stream",
});

test("reassembles chunks in sequence", () => {
  const chunks = new Map<number, Uint8Array>([
    [0, new Uint8Array([1, 2])],
    [1, new Uint8Array([3, 4])],
  ]);
  assert.deepEqual([...assembleVerifiedFile(meta(4), chunks)], [1, 2, 3, 4]);
});

test("rejects missing, extra and malformed chunks", () => {
  assert.throws(() => assembleVerifiedFile(meta(3), new Map([[0, new Uint8Array([1, 2, 3])]])), /incomplete/);
  assert.throws(() => assembleVerifiedFile(meta(1), new Map([
    [0, new Uint8Array([1])],
    [1, new Uint8Array([2])],
  ])), /incomplete/);
  assert.throws(() => assembleVerifiedFile(meta(3), new Map([[0, new Uint8Array([1, 2])]])), /length/);
});

test("supports empty files and exact full-sized chunks", () => {
  assert.equal(assembleVerifiedFile(meta(0), new Map()).byteLength, 0);
  const full = new Uint8Array(CHUNK_BYTES);
  assert.equal(assembleVerifiedFile(meta(CHUNK_BYTES), new Map([[0, full]])).byteLength, CHUNK_BYTES);
});

test("rejects unsafe advertised sizes", () => {
  assert.throws(() => assembleVerifiedFile(meta(-1), new Map()), /size/);
  assert.throws(() => assembleVerifiedFile(meta(Number.MAX_SAFE_INTEGER), new Map()), /size/);
});
