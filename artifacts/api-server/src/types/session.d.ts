import "express-session";

declare module "express-session" {
  interface SessionData {
    userId:          number;
    isAdmin:         boolean;
    oauthState:      string;
    pending2faUserId?: number;
  }
}
