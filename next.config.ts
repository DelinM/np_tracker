import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Snapshots are read from disk at request time. Include them in the server bundle
  // so a hosted deploy still has the books.
  outputFileTracingIncludes: {
    "/*": ["./data/politicians/**/*.json", "./data/alerts.json"],
    "/**": ["./data/politicians/**/*.json", "./data/alerts.json"],
  },
};

export default nextConfig;
