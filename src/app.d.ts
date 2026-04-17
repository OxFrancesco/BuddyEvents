import type { AuthObject, ClerkClient } from "@clerk/backend";

declare global {
  type TelegramWebApp = {
    initData: string;
    ready: () => void;
    expand: () => void;
  };

  type TelegramWindow = Window & {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  };

  namespace App {
    interface Error {
      readonly message: string;
      readonly kind: string;
      readonly timestamp: number;
      readonly traceId?: string;
    }

    interface Locals {
      clerk: {
        readonly auth: AuthObject | null;
        readonly client: ClerkClient;
        readonly headers: Headers;
        readonly isAuthenticated: boolean;
        readonly sessionId: string | null;
        readonly userId: string | null;
      };
    }
  }
}

export {};
