declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    COLLECTOR_TOKEN?: string;
  }
}
