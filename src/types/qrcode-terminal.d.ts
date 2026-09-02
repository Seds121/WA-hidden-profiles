declare module "qrcode-terminal" {
  interface QrcodeTerminal {
    generate(
      input: string,
      opts?: { small?: boolean },
      callback?: () => void,
    ): void;
    setErrorLevel(level: "L" | "M" | "Q" | "H"): void;
  }

  const qrcodeTerminal: QrcodeTerminal;
  export default qrcodeTerminal;
}
