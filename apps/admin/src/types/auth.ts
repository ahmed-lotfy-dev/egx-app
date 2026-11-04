import "better-auth/react";

declare module "better-auth/react" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      isAdmin: boolean;
    };
  }
}
