/**
 * demoData.ts — the identities the seeder and the scenarios share
 *
 * The wallets are Hardhat's public development accounts, so the same addresses
 * exist on the local chain and can sign. They must never be used on a public
 * network. Device fingerprints are SHA-256 hashes, which is the format both the
 * gateway and the risk engine expect, so a script and a browser produce the
 * same value for the same device.
 */

import { createHash } from "node:crypto";

export const deviceFingerprint = (name: string): string =>
  createHash("sha256").update(name).digest("hex");

export interface DemoCustomer {
  wallet: string;
  display_name: string;
  email: string;
  device: string;
  ip: string;
}

export const NORMAL_WALLETS: DemoCustomer[] = [
  {
    wallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    display_name: "Asha Raghavan",
    email: "asha.raghavan@example.com",
    device: deviceFingerprint("asha_main_phone"),
    ip: "192.168.1.100",
  },
  {
    wallet: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    display_name: "Rahul Menon",
    email: "rahul.menon@example.com",
    device: deviceFingerprint("rahul_laptop"),
    ip: "192.168.1.101",
  },
  {
    wallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    display_name: "Priya Sharma",
    email: "priya.sharma@example.com",
    device: deviceFingerprint("priya_tablet"),
    ip: "10.0.0.10",
  },
  {
    wallet: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
    display_name: "Vikram Patel",
    email: "vikram.patel@example.com",
    device: deviceFingerprint("vikram_desktop"),
    ip: "10.0.0.2",
  },
  {
    wallet: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
    display_name: "Meera Iyer",
    email: "meera.iyer@example.com",
    device: deviceFingerprint("meera_phone"),
    ip: "192.168.1.200",
  },
];

export const FRAUD_RING = {
  shared_device: deviceFingerprint("mule_ring_shared_device"),
  shared_ip: "203.0.113.99",
  wallets: [
    {
      wallet: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
      display_name: "Mule Account A",
      email: "mule.a@example.net",
    },
    {
      wallet: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
      display_name: "Mule Account B",
      email: "mule.b@example.net",
    },
    {
      wallet: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8F",
      display_name: "Mule Account C",
      email: "mule.c@example.net",
    },
  ],
};

// A device and an address the seeded customers have never used.
export const UNKNOWN_DEVICE = deviceFingerprint("unrecognised_device");
export const FOREIGN_IP = "203.0.113.50";
