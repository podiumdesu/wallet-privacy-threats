import { HDNodeWallet } from "ethers";

/**
 * Derive address & privateKey from:
 *  - a mnemonic phrase (optionally with passphrase),
 *  - or an extended key (xprv/xpub).
 *
 * Defaults to the common ETH path "m/44'/60'/0'/0/0".
 *
 * Warning: do not log real mnemonics or private keys in production.
 */
export const derive = (
  mnemonicOrExtendedKey: string,
  path: string = "m/44'/60'/0'/0/0",
  passphrase?: string
): { address: string; privateKey?: string } => {
  try {
    // Extended keys (xprv/xpub)
    if (/^xprv|^xpub/i.test(mnemonicOrExtendedKey)) {
      const node = HDNodeWallet.fromExtendedKey(mnemonicOrExtendedKey);
      // If the node already has depth > 0 and the requested path starts with "m/",
      // use a relative path (drop "m/") to avoid "cannot derive root path" errors.
      const normalized =
        node.depth > 0 && path.startsWith("m/") ? path.slice(2) : path;
      const child = node.derivePath(normalized);
      return { address: child.address, privateKey: child.privateKey };
    }

    // Mnemonic phrase: let ethers build the node directly at the requested path.
    // NOTE: fromPhrase(phrase, password?, path?) — pass path here to avoid double-derivation.
    const node = HDNodeWallet.fromPhrase(
      mnemonicOrExtendedKey,
      passphrase,
      path
    );
    return { address: node.address, privateKey: node.privateKey };
  } catch (err: any) {
    // Surface a clearer error for common problems.
    const msg = String(err?.message ?? err);
    if (msg.includes("cannot derive root path")) {
      throw new Error(
        `${msg} — you probably tried deriving a path starting with "m/" from a node that already has a path. ` +
          `Use HDNodeWallet.fromPhrase(mnemonic, passphrase, path) to create the node at the desired path or use a relative path when deriving from a non-root node.`
      );
    }
    throw new Error(`Derivation failed: ${msg}`);
  }
};
