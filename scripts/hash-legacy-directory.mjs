#!/usr/bin/env node
/**
 * Turns a Privy export into the legacy directory, hashing the emails.
 *
 *   node scripts/hash-legacy-directory.mjs privy-export.csv > legacy-directory.csv
 *
 * In:   email,evm,solana          (header optional, column order detected)
 * Out:  sha256_email,evm,solana
 *
 * The point is that the output carries no readable email, so it is safe to
 * paste into a Google Sheet, publish as CSV, commit, or leak — while the
 * lookup still works, because the server hashes the address it is given and
 * matches that. The input file is never written anywhere; keep it off the
 * repo and delete it when you are done.
 *
 * Nothing is printed to stdout but the output CSV, so it can be piped. Every
 * message, count and warning goes to stderr — and no email ever appears in
 * either, which is the whole reason this is a script and not a paste into a
 * chat window.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/hash-legacy-directory.mjs <privy-export.csv>");
  process.exit(2);
}

const hash = (email) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");

// Split on commas outside quotes: an export can carry a quoted display name.
function cells(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EVM = /^0x[0-9a-fA-F]{40}$/;
// Base58, and long enough not to catch a stray word.
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const lines = readFileSync(file, "utf8").split(/\r?\n/);

let written = 0;
let skipped = 0;
const seen = new Set();

console.log("sha256_email,evm,solana");

for (const line of lines) {
  if (!line.trim()) continue;
  const parts = cells(line);

  // Columns are found by shape, not position: exports vary, and a header row
  // fails every test below and is skipped without needing to be recognised.
  const email = parts.find((c) => EMAIL.test(c));
  if (!email) {
    skipped += 1;
    continue;
  }
  const evm = parts.find((c) => EVM.test(c)) ?? "";
  const solana = parts.find((c) => SOLANA.test(c) && c !== evm) ?? "";

  // A member with no wallet on either chain never held money here, so the
  // lookup would answer "account, but nothing to move" — a dead end with a
  // frightening label. Left out.
  if (!evm && !solana) {
    skipped += 1;
    continue;
  }

  const key = hash(email);
  if (seen.has(key)) continue;
  seen.add(key);

  console.log(`${key},${evm},${solana}`);
  written += 1;
}

console.error(`wrote ${written} rows`);
if (skipped) console.error(`skipped ${skipped} (header, no email, or no wallet on either chain)`);
console.error("the output contains no email addresses; delete the input when you are done");
