import {
  Contract,
  getAddress,
  isError,
  JsonRpcProvider,
  Wallet,
  type ContractTransactionReceipt,
  type ContractTransactionResponse,
  type Signer,
} from 'ethers';

export type ChainErrorCode =
  | 'INVALID_SIGNATURE'
  | 'NONCE_USED'
  | 'AUTH_PAUSED'
  | 'NOT_REGISTERED'
  | 'ALREADY_REGISTERED'
  | 'UNKNOWN_BATCH'
  | 'CHAIN_UNAVAILABLE';

export class ChainError extends Error {
  constructor(
    readonly code: ChainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ChainError';
  }
}

export interface TransactionResult {
  txHash: string;
}

export interface AuthRegistryClient {
  registerUser(walletAddress: string): Promise<TransactionResult>;
  isRegistered(walletAddress: string): Promise<boolean>;
  verifySignature(walletAddress: string, nonce: string, signature: string): Promise<TransactionResult>;
  submitMerkleRoot(root: string): Promise<TransactionResult & { batchId: number }>;
  getMerkleRoot(batchId: number): Promise<string>;
  pauseAuth(): Promise<TransactionResult>;
  resumeAuth(): Promise<TransactionResult>;
  isPaused(): Promise<boolean>;
}

export interface ChainOptions {
  rpcUrl: string;
  contractAddress: string;
  adminPrivateKey: string;
}

const AUTH_REGISTRY_ABI = [
  'function registerUser(address wallet)',
  'function isRegistered(address wallet) view returns (bool)',
  'function verifySignature(address wallet, bytes32 nonce, bytes signature) returns (bool)',
  'function submitMerkleRoot(bytes32 root)',
  'function getMerkleRoot(uint256 batchId) view returns (bytes32)',
  'function pauseAuth()',
  'function resumeAuth()',
  'function paused() view returns (bool)',
  'event MerkleRootSubmitted(bytes32 root, uint256 batchId)',
];

const CODE_FOR_REVERT_REASON: Record<string, ChainErrorCode> = {
  'AuthRegistry: invalid signature': 'INVALID_SIGNATURE',
  'AuthRegistry: nonce already used': 'NONCE_USED',
  'AuthRegistry: authentication is paused': 'AUTH_PAUSED',
  'AuthRegistry: wallet not registered': 'NOT_REGISTERED',
  'AuthRegistry: already registered': 'ALREADY_REGISTERED',
  'AuthRegistry: invalid batch id': 'UNKNOWN_BATCH',
};

export function toChainError(error: unknown): ChainError {
  if (error instanceof ChainError) {
    return error;
  }

  if (isError(error, 'CALL_EXCEPTION') && error.reason) {
    const code = CODE_FOR_REVERT_REASON[error.reason];
    if (code) {
      return new ChainError(code, error.reason);
    }
  }

  return new ChainError('CHAIN_UNAVAILABLE', 'The blockchain could not be reached');
}

// Every write goes through one admin account, so two logins arriving together
// would otherwise be given the same transaction number. Sending them one at a
// time avoids that without an external nonce manager.
function createTransactionQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let previousTask: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = previousTask.then(task);
    previousTask = result.catch(() => undefined);
    return result;
  };
}

export function createAuthRegistryClient(options: ChainOptions): AuthRegistryClient {
  if (!options.rpcUrl || !options.contractAddress) {
    return createUnconfiguredClient();
  }

  // ethers caches the account's transaction count for a few seconds, which makes
  // back-to-back transactions reuse a number and fail with NONCE_EXPIRED.
  const provider = new JsonRpcProvider(options.rpcUrl, undefined, { cacheTimeout: -1 });
  const registry = new Contract(options.contractAddress, AUTH_REGISTRY_ABI, provider);
  const runInOrder = createTransactionQueue();

  let writableRegistry: Contract | null = null;

  // Without a private key the local Hardhat node's first unlocked account is
  // used, which is the account that deployed the contract and is its admin.
  async function writable(): Promise<Contract> {
    if (writableRegistry === null) {
      const signer: Signer = options.adminPrivateKey
        ? new Wallet(options.adminPrivateKey, provider)
        : await provider.getSigner(0);
      writableRegistry = registry.connect(signer) as Contract;
    }
    return writableRegistry;
  }

  async function send(
    call: (contract: Contract) => Promise<ContractTransactionResponse>,
  ): Promise<TransactionResult & { receipt: ContractTransactionReceipt | null }> {
    return runInOrder(async () => {
      try {
        const transaction = await call(await writable());
        const receipt = await transaction.wait();
        return { txHash: transaction.hash, receipt };
      } catch (error) {
        throw toChainError(error);
      }
    });
  }

  return {
    async registerUser(walletAddress) {
      const { txHash } = await send((contract) => contract.registerUser(normalise(walletAddress)));
      return { txHash };
    },

    async verifySignature(walletAddress, nonce, signature) {
      const { txHash } = await send((contract) =>
        contract.verifySignature(normalise(walletAddress), `0x${nonce}`, signature),
      );
      return { txHash };
    },

    async submitMerkleRoot(root) {
      const { txHash, receipt } = await send((contract) => contract.submitMerkleRoot(root));
      return { txHash, batchId: readBatchId(registry, receipt) };
    },

    async getMerkleRoot(batchId) {
      try {
        return await registry.getMerkleRoot(batchId);
      } catch (error) {
        throw toChainError(error);
      }
    },

    async pauseAuth() {
      const { txHash } = await send((contract) => contract.pauseAuth());
      return { txHash };
    },

    async resumeAuth() {
      const { txHash } = await send((contract) => contract.resumeAuth());
      return { txHash };
    },

    async isPaused() {
      try {
        return await registry.paused();
      } catch (error) {
        throw toChainError(error);
      }
    },

    async isRegistered(walletAddress) {
      try {
        return await registry.isRegistered(normalise(walletAddress));
      } catch (error) {
        throw toChainError(error);
      }
    },
  };
}

// ethers rejects a mixed-case address whose EIP-55 checksum does not match.
// Addresses reach us in whatever case the client used, and on-chain they are
// plain bytes, so the case is normalised before every call.
function normalise(walletAddress: string): string {
  return getAddress(walletAddress.toLowerCase());
}

// The contract assigns the batch id, so it is read back from the event the
// anchoring transaction emitted rather than guessed.
function readBatchId(registry: Contract, receipt: ContractTransactionReceipt | null): number {
  for (const log of receipt?.logs ?? []) {
    const parsed = registry.interface.parseLog(log);
    if (parsed?.name === 'MerkleRootSubmitted') {
      return Number(parsed.args.batchId);
    }
  }

  throw new ChainError('CHAIN_UNAVAILABLE', 'The anchoring transaction emitted no batch id');
}

// Used when no contract address is configured yet: every call fails closed with
// the same error the routes would return if the chain were unreachable.
function createUnconfiguredClient(): AuthRegistryClient {
  const unavailable = async (): Promise<never> => {
    throw new ChainError('CHAIN_UNAVAILABLE', 'No contract address is configured');
  };

  return {
    registerUser: unavailable,
    isRegistered: unavailable,
    verifySignature: unavailable,
    submitMerkleRoot: unavailable,
    getMerkleRoot: unavailable,
    pauseAuth: unavailable,
    resumeAuth: unavailable,
    isPaused: unavailable,
  };
}
