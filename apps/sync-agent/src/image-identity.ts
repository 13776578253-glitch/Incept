import {createHash} from 'node:crypto';

// These are different OCI objects. Docker stores may report any one as .Id.
export const R5_IMAGE = {
  manifestListDigest: 'sha256:cc705ce22cea38b1a8c01cea28fe1e1dd2ca6cbae500516f00eaee6c497d6685',
  platformManifestDigest: 'sha256:c13ed6a558e76432d8b10eff170c618cd61930f91a16d6b32cad02f2a5cad9cc',
  configId: 'sha256:eebc98b3a47bccf76cff462d8cbdc027309d4d5dabb470ba3fdc4835a12fbc38',
  os: 'linux', architecture: 'amd64',
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sha256 = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
export function classifyR5Digest(value: unknown) {
  if (value === R5_IMAGE.manifestListDigest) return 'manifest-list';
  if (value === R5_IMAGE.platformManifestDigest) return 'platform-manifest';
  if (value === R5_IMAGE.configId) return 'image-config';
  return undefined;
}

export function verifyR5ImageIdentity(raw: unknown) {
  const errors: string[] = [];
  if (!object(raw) || !object(raw.observed) || ['indexJson','manifestJson','configJson'].some(k => typeof raw[k] !== 'string' || String(raw[k]).length > 262144)) {
    return {passed: false, errors: ['IMAGE_GRAPH_EVIDENCE_REQUIRED'], expected: R5_IMAGE};
  }
  const observed = raw.observed, observedIdKind = classifyR5Digest(observed.id);
  try {
    const indexText = String(raw.indexJson), manifestText = String(raw.manifestJson), configText = String(raw.configJson);
    if (sha256(indexText) !== R5_IMAGE.manifestListDigest) errors.push('MANIFEST_LIST_DIGEST_MISMATCH');
    if (sha256(manifestText) !== R5_IMAGE.platformManifestDigest) errors.push('PLATFORM_MANIFEST_DIGEST_MISMATCH');
    if (sha256(configText) !== R5_IMAGE.configId) errors.push('IMAGE_CONFIG_DIGEST_MISMATCH');
    const index = JSON.parse(indexText), manifest = JSON.parse(manifestText), config = JSON.parse(configText);
    const descriptor = index?.manifests?.find((m: {digest?: unknown; platform?: {os?: unknown; architecture?: unknown}}) =>
      m.digest === R5_IMAGE.platformManifestDigest && m.platform?.os === R5_IMAGE.os && m.platform.architecture === R5_IMAGE.architecture);
    if (!descriptor || !['application/vnd.oci.image.index.v1+json','application/vnd.docker.distribution.manifest.list.v2+json'].includes(index.mediaType)) errors.push('LINUX_PLATFORM_LINK_MISMATCH');
    if (manifest?.config?.digest !== R5_IMAGE.configId || !['application/vnd.oci.image.manifest.v1+json','application/vnd.docker.distribution.manifest.v2+json'].includes(manifest.mediaType)) errors.push('CONFIG_LINK_MISMATCH');
    if (config?.os !== R5_IMAGE.os || config?.architecture !== R5_IMAGE.architecture || observed.os !== R5_IMAGE.os || observed.architecture !== R5_IMAGE.architecture) errors.push('IMAGE_PLATFORM_MISMATCH');
    if (!observedIdKind) errors.push('RUNTIME_IMAGE_ID_MISMATCH');
    if (!Array.isArray(config?.rootfs?.diff_ids) || !config.rootfs.diff_ids.length ||
      JSON.stringify(observed.rootfsDiffIds) !== JSON.stringify(config.rootfs.diff_ids)) errors.push('RUNTIME_ROOTFS_MISMATCH');
  } catch { errors.push('INVALID_IMAGE_GRAPH'); }
  return {passed: !errors.length, errors, observedIdKind, expected: R5_IMAGE};
}
