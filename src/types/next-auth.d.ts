import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: 'owner' | 'admin' | 'moderator' | 'marketer' | 'support' | 'advisor' | 'user';
      billingTier?: 'free' | 'trader' | 'pro' | 'whale';
      billingExpiresAt?: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    billingTier?: 'free' | 'trader' | 'pro' | 'whale';
    billingExpiresAt?: string | null;
  }
}
