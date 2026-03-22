/// MOCK implementation for @selfxyz/sdk interface
export interface SelfProof {
  isValid: boolean;
  userId?: string;
  timestamp?: number;
}

export interface SelfVerifier {
  verify(proof: SelfProof): Promise<boolean>;
  generateProof(): Promise<SelfProof>;
}

export class SelfSDK implements SelfVerifier {
  async verify(proof: SelfProof): Promise<boolean> {
    if (proof.isValid) return true;
    if (!proof.timestamp) return false;
    const within24h = Date.now() - proof.timestamp < 24 * 60 * 60 * 1000;
    return within24h;
  }

  async generateProof(userId?: string): Promise<SelfProof> {
    return {
      isValid: true,
      userId: userId || `user-${Date.now()}`,
      timestamp: Date.now()
    };
  }
}

export function createSelfSDK(): SelfVerifier {
  return new SelfSDK();
}