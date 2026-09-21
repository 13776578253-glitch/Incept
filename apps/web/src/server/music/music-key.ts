// 键规则已经搬到 @incept/db/music：网页服务端（上传、清单生成）与 db 包的上传执行器共用同一套实现
// 只保留转发，避免改动既有调用点
export {
  deriveMusicLibraryKey,
  deriveMusicTrackKey,
  slugifyMusicKey,
  titleFromFileName,
  uniqueMusicKey,
} from '@incept/db/music';
