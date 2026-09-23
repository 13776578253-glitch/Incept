// 转发 @incept/db/music 的键规则：网页服务端与 db 包共用一套实现
export {
  deriveMusicLibraryKey,
  deriveMusicTrackKey,
  slugifyMusicKey,
  titleFromFileName,
  uniqueMusicKey,
} from '@incept/music/domain';
