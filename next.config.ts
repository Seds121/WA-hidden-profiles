import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Node-native packages out of the server bundle (Puppeteer cannot be bundled).
  serverExternalPackages: [
    "whatsapp-web.js",
    "puppeteer",
    "qrcode-terminal",
    "qrcode",
  ],
};

export default nextConfig;
