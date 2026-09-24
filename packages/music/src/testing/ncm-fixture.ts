import { createCipheriv, randomBytes } from 'node:crypto';

// 测试用 .ncm 容器：编码步骤与 ncm-decode 的解码器互为逆运算（不把真实歌曲字节带进仓库）
const coreKey = Buffer.from('687a4852416d736f356b496e62617857', 'hex');
const metaKey = Buffer.from('2331346c6a6b5f215c5d2630553c2728', 'hex');

function aes128EcbEncrypt(key: Buffer, data: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);

  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function pkcs7Pad(data: Buffer, blockSize = 16): Buffer {
  const padding = blockSize - (data.length % blockSize);

  return Buffer.concat([data, Buffer.alloc(padding, padding)]);
}

function xorInPlace(data: Buffer, value: number): void {
  for (let index = 0; index < data.length; index += 1) {
    data[index] ^= value;
  }
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);

  return buffer;
}

function rc4Transform(data: Buffer, keyText: string): Buffer {
  const key = Buffer.from(keyText, 'latin1');
  const box = new Uint8Array(256);

  for (let index = 0; index < 256; index += 1) {
    box[index] = index;
  }

  let j = 0;

  for (let index = 0; index < 256; index += 1) {
    j = (j + box[index] + key[index % key.length]) & 0xff;
    const swap = box[index];
    box[index] = box[j];
    box[j] = swap;
  }

  const output = Buffer.allocUnsafe(data.length);

  for (let index = 0; index < data.length; index += 1) {
    const step = (index + 1) & 0xff;
    output[index] = data[index] ^ box[(box[step] + box[(box[step] + step) & 0xff]) & 0xff];
  }

  return output;
}

export function buildNcmContainer(input: {
  audio: Buffer;
  metadata?: Record<string, unknown> | null;
  cover?: Buffer;
}): Buffer {
  const rc4Key = randomBytes(48).toString('base64').replace(/[+/=]/gu, 'A');
  const keyPlain = pkcs7Pad(
    Buffer.concat([Buffer.from('neteasecloudmusic', 'latin1'), Buffer.from(rc4Key, 'latin1')]),
  );
  const keyBlock = aes128EcbEncrypt(coreKey, keyPlain);
  xorInPlace(keyBlock, 0x64);

  let metaPlain = Buffer.alloc(0);

  if (input.metadata) {
    const metaJson = Buffer.from(`music:${JSON.stringify(input.metadata)}`, 'utf8');
    const metaBlock = aes128EcbEncrypt(metaKey, pkcs7Pad(metaJson));
    metaPlain = Buffer.from(`163 key(Don't modify):${metaBlock.toString('base64')}`, 'latin1');
    xorInPlace(metaPlain, 0x63);
  }

  const cover = input.cover ?? Buffer.alloc(0);

  return Buffer.concat([
    Buffer.from('CTENFDAM', 'latin1'),
    Buffer.from([0x01, 0x70]),
    uint32(keyBlock.length),
    keyBlock,
    uint32(metaPlain.length),
    metaPlain,
    uint32(0),
    Buffer.alloc(5),
    uint32(cover.length),
    cover,
    rc4Transform(input.audio, rc4Key),
  ]);
}
