import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

// The wallet signs the raw 32 nonce bytes, which is what
// MessageHashUtils.toEthSignedMessageHash(nonce) hashes inside the contract.
function freshNonce(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

async function deployRegistry() {
  const [admin, customer, otherCustomer, outsider] = await ethers.getSigners();
  const registry = await ethers.deployContract("AuthRegistry");
  return { registry, admin, customer, otherCustomer, outsider };
}

async function deployWithRegisteredCustomer() {
  const context = await deployRegistry();
  await context.registry.registerUser(context.customer.address);
  return context;
}

describe("AuthRegistry", () => {
  describe("deployment", () => {
    it("makes the deployer the admin and starts unpaused", async () => {
      const { registry, admin } = await loadFixture(deployRegistry);

      expect(await registry.admin()).to.equal(admin.address);
      expect(await registry.paused()).to.equal(false);
    });
  });

  describe("registerUser", () => {
    it("registers the customer's wallet, not the caller's", async () => {
      const { registry, admin, customer } = await loadFixture(deployRegistry);

      await expect(registry.registerUser(customer.address))
        .to.emit(registry, "UserRegistered")
        .withArgs(customer.address);

      expect(await registry.isRegistered(customer.address)).to.equal(true);
      expect(await registry.isRegistered(admin.address)).to.equal(false);
    });

    it("registers several customers from the same admin account", async () => {
      const { registry, customer, otherCustomer } = await loadFixture(deployRegistry);

      await registry.registerUser(customer.address);
      await registry.registerUser(otherCustomer.address);

      expect(await registry.isRegistered(customer.address)).to.equal(true);
      expect(await registry.isRegistered(otherCustomer.address)).to.equal(true);
    });

    it("rejects a second registration of the same wallet", async () => {
      const { registry, customer } = await loadFixture(deployWithRegisteredCustomer);

      await expect(registry.registerUser(customer.address)).to.be.revertedWith(
        "AuthRegistry: already registered",
      );
    });

    it("rejects the zero address", async () => {
      const { registry } = await loadFixture(deployRegistry);

      await expect(registry.registerUser(ethers.ZeroAddress)).to.be.revertedWith(
        "AuthRegistry: zero address",
      );
    });

    it("rejects a caller that is not the admin", async () => {
      const { registry, customer, outsider } = await loadFixture(deployRegistry);

      await expect(
        registry.connect(outsider).registerUser(customer.address),
      ).to.be.revertedWith("AuthRegistry: caller is not admin");
    });

    it("rejects registration while authentication is paused", async () => {
      const { registry, customer } = await loadFixture(deployRegistry);
      await registry.pauseAuth();

      await expect(registry.registerUser(customer.address)).to.be.revertedWith(
        "AuthRegistry: authentication is paused",
      );
    });
  });

  describe("verifySignature", () => {
    it("accepts a valid signature and records the nonce as used", async () => {
      const { registry, customer } = await loadFixture(deployWithRegisteredCustomer);
      const nonce = freshNonce();
      const signature = await customer.signMessage(ethers.getBytes(nonce));

      expect(await registry.verifySignature.staticCall(customer.address, nonce, signature)).to.equal(
        true,
      );
      await expect(registry.verifySignature(customer.address, nonce, signature)).to.emit(
        registry,
        "LoginVerified",
      );

      expect(await registry.usedNonces(customer.address, nonce)).to.equal(true);
    });

    it("rejects the same signature twice", async () => {
      const { registry, customer } = await loadFixture(deployWithRegisteredCustomer);
      const nonce = freshNonce();
      const signature = await customer.signMessage(ethers.getBytes(nonce));

      await registry.verifySignature(customer.address, nonce, signature);

      await expect(
        registry.verifySignature(customer.address, nonce, signature),
      ).to.be.revertedWith("AuthRegistry: nonce already used");
    });

    // The bug this replaces: only the most recent nonce was stored, so an
    // attacker could replay a captured signature after the customer logged in again.
    it("rejects an old nonce after a newer login", async () => {
      const { registry, customer } = await loadFixture(deployWithRegisteredCustomer);
      const nonceA = freshNonce();
      const nonceB = freshNonce();
      const signatureA = await customer.signMessage(ethers.getBytes(nonceA));
      const signatureB = await customer.signMessage(ethers.getBytes(nonceB));

      await registry.verifySignature(customer.address, nonceA, signatureA);
      await registry.verifySignature(customer.address, nonceB, signatureB);

      await expect(
        registry.verifySignature(customer.address, nonceA, signatureA),
      ).to.be.revertedWith("AuthRegistry: nonce already used");
    });

    it("keeps used nonces separate per wallet", async () => {
      const { registry, customer, otherCustomer } = await loadFixture(deployWithRegisteredCustomer);
      await registry.registerUser(otherCustomer.address);

      const nonce = freshNonce();
      await registry.verifySignature(
        customer.address,
        nonce,
        await customer.signMessage(ethers.getBytes(nonce)),
      );

      await expect(
        registry.verifySignature(
          otherCustomer.address,
          nonce,
          await otherCustomer.signMessage(ethers.getBytes(nonce)),
        ),
      ).to.emit(registry, "LoginVerified");
    });

    it("rejects a signature produced by a different wallet", async () => {
      const { registry, customer, outsider } = await loadFixture(deployWithRegisteredCustomer);
      const nonce = freshNonce();
      const signature = await outsider.signMessage(ethers.getBytes(nonce));

      await expect(
        registry.verifySignature(customer.address, nonce, signature),
      ).to.be.revertedWith("AuthRegistry: invalid signature");
    });

    it("rejects a signature made over a different nonce", async () => {
      const { registry, customer } = await loadFixture(deployWithRegisteredCustomer);
      const signature = await customer.signMessage(ethers.getBytes(freshNonce()));

      await expect(
        registry.verifySignature(customer.address, freshNonce(), signature),
      ).to.be.revertedWith("AuthRegistry: invalid signature");
    });

    it("rejects an unregistered wallet", async () => {
      const { registry, outsider } = await loadFixture(deployRegistry);
      const nonce = freshNonce();
      const signature = await outsider.signMessage(ethers.getBytes(nonce));

      await expect(
        registry.verifySignature(outsider.address, nonce, signature),
      ).to.be.revertedWith("AuthRegistry: wallet not registered");
    });

    it("rejects every login while paused and accepts them again after resume", async () => {
      const { registry, customer } = await loadFixture(deployWithRegisteredCustomer);
      const nonce = freshNonce();
      const signature = await customer.signMessage(ethers.getBytes(nonce));

      await registry.pauseAuth();
      await expect(
        registry.verifySignature(customer.address, nonce, signature),
      ).to.be.revertedWith("AuthRegistry: authentication is paused");

      await registry.resumeAuth();
      await expect(registry.verifySignature(customer.address, nonce, signature)).to.emit(
        registry,
        "LoginVerified",
      );
    });
  });

  describe("circuit breaker", () => {
    it("lets only the admin pause and resume", async () => {
      const { registry, admin, outsider } = await loadFixture(deployRegistry);

      await expect(registry.connect(outsider).pauseAuth()).to.be.revertedWith(
        "AuthRegistry: caller is not admin",
      );

      await expect(registry.pauseAuth()).to.emit(registry, "AuthPaused").withArgs(admin.address);
      expect(await registry.paused()).to.equal(true);

      await expect(registry.connect(outsider).resumeAuth()).to.be.revertedWith(
        "AuthRegistry: caller is not admin",
      );

      await expect(registry.resumeAuth()).to.emit(registry, "AuthResumed").withArgs(admin.address);
      expect(await registry.paused()).to.equal(false);
    });
  });

  describe("merkle roots", () => {
    it("anchors a batch root and returns it by batch id", async () => {
      const { registry } = await loadFixture(deployRegistry);
      const firstRoot = ethers.keccak256(ethers.toUtf8Bytes("batch-0"));
      const secondRoot = ethers.keccak256(ethers.toUtf8Bytes("batch-1"));

      await expect(registry.submitMerkleRoot(firstRoot))
        .to.emit(registry, "MerkleRootSubmitted")
        .withArgs(firstRoot, 0);
      await expect(registry.submitMerkleRoot(secondRoot))
        .to.emit(registry, "MerkleRootSubmitted")
        .withArgs(secondRoot, 1);

      expect(await registry.getMerkleRoot(0)).to.equal(firstRoot);
      expect(await registry.getMerkleRoot(1)).to.equal(secondRoot);
    });

    it("rejects a root submitted by anyone other than the admin", async () => {
      const { registry, outsider } = await loadFixture(deployRegistry);
      const root = ethers.keccak256(ethers.toUtf8Bytes("batch-0"));

      await expect(registry.connect(outsider).submitMerkleRoot(root)).to.be.revertedWith(
        "AuthRegistry: caller is not admin",
      );
    });

    it("rejects a batch id that was never anchored", async () => {
      const { registry } = await loadFixture(deployRegistry);

      await expect(registry.getMerkleRoot(0)).to.be.revertedWith("AuthRegistry: invalid batch id");
    });
  });

  describe("transferAdmin", () => {
    it("hands administration to the new address", async () => {
      const { registry, admin, outsider } = await loadFixture(deployRegistry);

      await registry.transferAdmin(outsider.address);

      expect(await registry.admin()).to.equal(outsider.address);
      await expect(registry.connect(outsider).pauseAuth()).to.emit(registry, "AuthPaused");
      await expect(registry.connect(admin).resumeAuth()).to.be.revertedWith(
        "AuthRegistry: caller is not admin",
      );
    });

    it("rejects the zero address and a caller that is not the admin", async () => {
      const { registry, outsider } = await loadFixture(deployRegistry);

      await expect(registry.transferAdmin(ethers.ZeroAddress)).to.be.revertedWith(
        "AuthRegistry: zero address",
      );
      await expect(
        registry.connect(outsider).transferAdmin(outsider.address),
      ).to.be.revertedWith("AuthRegistry: caller is not admin");
    });
  });
});
