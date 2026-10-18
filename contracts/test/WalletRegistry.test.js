const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

describe('WalletRegistry', function () {
  async function deploy() {
    const [admin, wallet, other] = await ethers.getSigners();
    const registry = await ethers.deployContract('WalletRegistry');
    return { registry, admin, wallet, other };
  }

  async function registered() {
    const ctx = await deploy();
    await ctx.registry.registerWallet(ctx.wallet.address);
    return ctx;
  }

  const mutators = ['registerWallet', 'revokeWallet', 'activateWallet'];

  it('CT-01 deployer is admin', async function () {
    const { registry, admin } = await loadFixture(deploy);
    expect(await registry.admin()).to.equal(admin.address);
  });

  it('CT-02 admin registers a wallet', async function () {
    const { registry, wallet } = await loadFixture(deploy);
    const tx = await registry.registerWallet(wallet.address);
    const ts = await time.latest();
    await expect(tx).to.emit(registry, 'WalletRegistered').withArgs(wallet.address, ts);
    expect(await registry.isRegistered(wallet.address)).to.equal(true);
    expect(await registry.isActive(wallet.address)).to.equal(true);
    expect(await registry.getWalletStatus(wallet.address)).to.deep.equal([true, true, BigInt(ts)]);
  });

  it('CT-03 non-admin cannot register, not even its own wallet', async function () {
    const { registry, wallet, other } = await loadFixture(deploy);
    await expect(registry.connect(other).registerWallet(wallet.address))
      .to.be.revertedWithCustomError(registry, 'NotAdmin');
    await expect(registry.connect(wallet).registerWallet(wallet.address))
      .to.be.revertedWithCustomError(registry, 'NotAdmin');
    expect(await registry.isRegistered(wallet.address)).to.equal(false);
  });

  it('CT-04 zero address is rejected by every mutator', async function () {
    const { registry } = await loadFixture(deploy);
    for (const fn of mutators) {
      await expect(registry[fn](ethers.ZeroAddress)).to.be.revertedWithCustomError(registry, 'ZeroAddress');
    }
  });

  it('CT-05 second registration reverts, also after revocation', async function () {
    const { registry, wallet } = await loadFixture(registered);
    await expect(registry.registerWallet(wallet.address))
      .to.be.revertedWithCustomError(registry, 'AlreadyRegistered');
    // A revoked wallet cannot be brought back by registering it again.
    await registry.revokeWallet(wallet.address);
    await expect(registry.registerWallet(wallet.address))
      .to.be.revertedWithCustomError(registry, 'AlreadyRegistered');
    expect(await registry.isActive(wallet.address)).to.equal(false);
  });

  it('CT-06 revoke', async function () {
    const { registry, wallet, other } = await loadFixture(registered);
    const tx = await registry.revokeWallet(wallet.address);
    await expect(tx).to.emit(registry, 'WalletRevoked').withArgs(wallet.address, await time.latest());
    expect(await registry.isActive(wallet.address)).to.equal(false);
    expect(await registry.isRegistered(wallet.address)).to.equal(true);
    await expect(registry.revokeWallet(wallet.address))
      .to.be.revertedWithCustomError(registry, 'AlreadyRevoked');
    await expect(registry.revokeWallet(other.address))
      .to.be.revertedWithCustomError(registry, 'NotRegistered');
  });

  it('CT-07 activate', async function () {
    const { registry, wallet, other } = await loadFixture(registered);
    await expect(registry.activateWallet(wallet.address))
      .to.be.revertedWithCustomError(registry, 'AlreadyActive');
    await registry.revokeWallet(wallet.address);
    const tx = await registry.activateWallet(wallet.address);
    await expect(tx).to.emit(registry, 'WalletActivated').withArgs(wallet.address, await time.latest());
    expect(await registry.isActive(wallet.address)).to.equal(true);
    await expect(registry.activateWallet(other.address))
      .to.be.revertedWithCustomError(registry, 'NotRegistered');
  });

  it('CT-08 non-admin cannot revoke or activate', async function () {
    const { registry, wallet, other } = await loadFixture(registered);
    await expect(registry.connect(other).revokeWallet(wallet.address))
      .to.be.revertedWithCustomError(registry, 'NotAdmin');
    expect(await registry.isActive(wallet.address)).to.equal(true);
    await registry.revokeWallet(wallet.address);
    // Not even the wallet itself can lift its own revocation.
    await expect(registry.connect(wallet).activateWallet(wallet.address))
      .to.be.revertedWithCustomError(registry, 'NotAdmin');
    expect(await registry.isActive(wallet.address)).to.equal(false);
  });

  it('CT-09 unregistered wallet status is empty', async function () {
    const { registry, wallet } = await loadFixture(deploy);
    expect(await registry.getWalletStatus(wallet.address)).to.deep.equal([false, false, 0n]);
    expect(await registry.isRegistered(wallet.address)).to.equal(false);
    expect(await registry.isActive(wallet.address)).to.equal(false);
  });

  it('CT-10 registeredAt survives revoke and activate', async function () {
    const { registry, wallet } = await loadFixture(registered);
    const [, , registeredAt] = await registry.getWalletStatus(wallet.address);
    await time.increase(100);
    await registry.revokeWallet(wallet.address);
    expect((await registry.getWalletStatus(wallet.address))[2]).to.equal(registeredAt);
    await registry.activateWallet(wallet.address);
    expect((await registry.getWalletStatus(wallet.address))[2]).to.equal(registeredAt);
  });

  it('each wallet has its own independent record', async function () {
    const { registry, wallet, other } = await loadFixture(registered);
    await registry.registerWallet(other.address);
    await registry.revokeWallet(wallet.address);
    expect(await registry.isActive(wallet.address)).to.equal(false);
    expect(await registry.isActive(other.address)).to.equal(true);
  });

  it('holds no funds: plain transfers and unknown calls are rejected', async function () {
    const { registry, admin } = await loadFixture(deploy);
    const address = await registry.getAddress();
    await expect(admin.sendTransaction({ to: address, value: 1n })).to.be.reverted;
    await expect(admin.sendTransaction({ to: address, data: '0xdeadbeef' })).to.be.reverted;
    expect(await ethers.provider.getBalance(address)).to.equal(0n);
  });

  it('exposes exactly the specified interface', async function () {
    const { registry } = await loadFixture(deploy);
    const functions = registry.interface.fragments.filter((f) => f.type === 'function');
    expect(functions.map((f) => f.name).sort()).to.deep.equal([
      'activateWallet', 'admin', 'getWalletStatus', 'isActive', 'isRegistered', 'registerWallet', 'revokeWallet',
    ]);
    // Only the three admin functions can change state, and none can receive ether.
    expect(functions.filter((f) => f.stateMutability === 'nonpayable').map((f) => f.name).sort())
      .to.deep.equal(['activateWallet', 'registerWallet', 'revokeWallet']);
    expect(functions.filter((f) => f.payable)).to.have.lengthOf(0);

    // Three events, each with the wallet as the only indexed parameter and a uint64 timestamp.
    const events = registry.interface.fragments.filter((f) => f.type === 'event');
    expect(events.map((e) => e.format('sighash')).sort()).to.deep.equal([
      'WalletActivated(address,uint64)', 'WalletRegistered(address,uint64)', 'WalletRevoked(address,uint64)',
    ]);
    for (const event of events) {
      expect(event.inputs.map((i) => i.indexed)).to.deep.equal([true, false]);
    }
    const errors = registry.interface.fragments.filter((f) => f.type === 'error');
    expect(errors.map((e) => e.name).sort()).to.deep.equal([
      'AlreadyActive', 'AlreadyRegistered', 'AlreadyRevoked', 'NotAdmin', 'NotRegistered', 'ZeroAddress',
    ]);
  });

  it('a wallet can never return to the unregistered state', async function () {
    const { registry, wallet } = await loadFixture(registered);
    // Every reachable state after registration still counts as registered.
    await registry.revokeWallet(wallet.address);
    expect(await registry.isRegistered(wallet.address)).to.equal(true);
    await registry.activateWallet(wallet.address);
    expect(await registry.isRegistered(wallet.address)).to.equal(true);
    await registry.revokeWallet(wallet.address);
    expect(await registry.getWalletStatus(wallet.address)).to.deep.equal([true, false,
      (await registry.getWalletStatus(wallet.address))[2]]);
  });

  it('each state change costs constant, small gas (one storage slot per wallet)', async function () {
    const { registry, wallet, other } = await loadFixture(deploy);
    const gas = async (tx) => (await (await tx).wait()).gasUsed;
    const first = await gas(registry.registerWallet(wallet.address));
    const second = await gas(registry.registerWallet(other.address));
    // Registering does not get more expensive as the registry grows: there is no loop or list. The
    // only variation is calldata pricing, 12 gas per zero byte among the 20 bytes of the address.
    const difference = second > first ? second - first : first - second;
    expect(difference).to.be.at.most(240n);
    expect(first).to.be.lessThan(60000n);
    expect(await gas(registry.revokeWallet(wallet.address))).to.be.lessThan(40000n);
    expect(await gas(registry.activateWallet(wallet.address))).to.be.lessThan(40000n);
  });
});
