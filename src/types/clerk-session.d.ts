/** Optional Clerk session claims when using custom JWT templates. */
export {};

declare global {
  interface CustomJwtSessionClaims {
    /** Factor verification age (seconds since last step-up), if exposed from Clerk. */
    fva?: number;
  }
}
