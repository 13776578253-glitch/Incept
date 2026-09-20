export type MusicAdminCopy = {
  heading: string;
  description: string;
  unavailablePrefix: string;
  uploadHeading: string;
  uploadHint: string;
  chooseFiles: string;
  chooseFolder: string;
  uploadLibraryLabel: string;
  uploadNeedsLibrary: string;
  uploadQueued: string;
  uploadDone: string;
  uploadFailed: string;
  formatUploadProgress: (percent: number) => string;
  tracksHeading: string;
  searchPlaceholder: string;
  filterAllLibraries: string;
  tableEmpty: string;
  tableNoMatch: string;
  columnTrack: string;
  columnArtist: string;
  columnDuration: string;
  columnLibraries: string;
  columnOrder: string;
  columnStatus: string;
  columnActions: string;
  statusActive: string;
  statusInactive: string;
  actionDeactivate: string;
  actionReactivate: string;
  actionSave: string;
  actionCancel: string;
  actionMoveUp: string;
  actionMoveDown: string;
  librariesHeading: string;
  libraryEmpty: string;
  newLibraryPlaceholder: string;
  newLibraryAction: string;
  libraryActive: string;
  libraryInactive: string;
  libraryDeactivate: string;
  libraryReactivate: string;
  libraryMoveMembersLabel: string;
  libraryRemoveHint: string;
  durationUnknown: string;
  failedPrefix: string;
  confirmDeactivateTrack: string;
  confirmDeactivateLibrary: string;
};

const zhCopy: MusicAdminCopy = {
  heading: '曲库与曲目管理',
  description:
    '在这里上传音频、编辑曲目与曲库。改动直接写数据库，播放器下一次拉取就能看到；不再需要内容根或命令行。',
  unavailablePrefix: '数据库不可用：',
  uploadHeading: '上传',
  uploadHint:
    '把音频拖到这里，或选择文件 / 文件夹（mp3、wav、flac，单个最大 128 MB）。选文件夹时，第一层目录名作为曲库名，缺的曲库会自动创建。',
  chooseFiles: '选择文件',
  chooseFolder: '选择文件夹',
  uploadLibraryLabel: '归属曲库',
  uploadNeedsLibrary: '先创建一个曲库，再上传。',
  uploadQueued: '等待',
  uploadDone: '完成',
  uploadFailed: '失败',
  formatUploadProgress: (percent) => `上传中 ${percent}%`,
  tracksHeading: '曲目',
  searchPlaceholder: '搜索标题、作者或 key',
  filterAllLibraries: '全部曲库',
  tableEmpty: '还没有曲目，先在上面上传。',
  tableNoMatch: '没有符合条件的曲目。',
  columnTrack: '曲目',
  columnArtist: '作者',
  columnDuration: '时长',
  columnLibraries: '归属',
  columnOrder: '顺序',
  columnStatus: '状态',
  columnActions: '操作',
  statusActive: '启用',
  statusInactive: '已停用',
  actionDeactivate: '停用',
  actionReactivate: '恢复',
  actionSave: '保存',
  actionCancel: '取消',
  actionMoveUp: '上移',
  actionMoveDown: '下移',
  librariesHeading: '曲库',
  libraryEmpty: '还没有曲库。',
  newLibraryPlaceholder: '新曲库名字',
  newLibraryAction: '新建',
  libraryActive: '启用',
  libraryInactive: '已停用',
  libraryDeactivate: '停用',
  libraryReactivate: '恢复',
  libraryMoveMembersLabel: '成员移到',
  libraryRemoveHint: '停用后曲目会移到你选择的曲库；最后一个启用的曲库不能停用。',
  durationUnknown: '—',
  failedPrefix: '操作失败：',
  confirmDeactivateTrack: '停用后可以恢复，媒体文件不会被删除。',
  confirmDeactivateLibrary: '停用曲库前，必须为它的曲目指定去处。',
};

const enCopy: MusicAdminCopy = {
  heading: 'Tracks and libraries',
  description:
    'Upload audio and edit tracks and libraries here. Changes are written straight to the database, so the player picks them up on its next fetch; no content root or command line involved.',
  unavailablePrefix: 'The database is unavailable: ',
  uploadHeading: 'Upload',
  uploadHint:
    'Drop audio here, or choose files / a folder (mp3, wav, flac, 128 MB each). With a folder, the first directory name becomes the library name and a missing library is created for you.',
  chooseFiles: 'Choose files',
  chooseFolder: 'Choose folder',
  uploadLibraryLabel: 'Library',
  uploadNeedsLibrary: 'Create a library before uploading.',
  uploadQueued: 'Queued',
  uploadDone: 'Done',
  uploadFailed: 'Failed',
  formatUploadProgress: (percent) => `Uploading ${percent}%`,
  tracksHeading: 'Tracks',
  searchPlaceholder: 'Search title, artist or key',
  filterAllLibraries: 'All libraries',
  tableEmpty: 'No tracks yet — upload something above.',
  tableNoMatch: 'No track matches the filter.',
  columnTrack: 'Track',
  columnArtist: 'Artist',
  columnDuration: 'Length',
  columnLibraries: 'Libraries',
  columnOrder: 'Order',
  columnStatus: 'Status',
  columnActions: 'Actions',
  statusActive: 'Active',
  statusInactive: 'Deactivated',
  actionDeactivate: 'Deactivate',
  actionReactivate: 'Restore',
  actionSave: 'Save',
  actionCancel: 'Cancel',
  actionMoveUp: 'Move up',
  actionMoveDown: 'Move down',
  librariesHeading: 'Libraries',
  libraryEmpty: 'No libraries yet.',
  newLibraryPlaceholder: 'New library name',
  newLibraryAction: 'Create',
  libraryActive: 'Active',
  libraryInactive: 'Deactivated',
  libraryDeactivate: 'Deactivate',
  libraryReactivate: 'Restore',
  libraryMoveMembersLabel: 'Move members to',
  libraryRemoveHint:
    'Deactivating moves its tracks to the library you pick; the last active library cannot be deactivated.',
  durationUnknown: '—',
  failedPrefix: 'That failed: ',
  confirmDeactivateTrack: 'A deactivated track can be restored; its media file is kept.',
  confirmDeactivateLibrary: 'Before deactivating a library, choose where its tracks should go.',
};

export function getMusicAdminCopy(locale: string): MusicAdminCopy {
  return locale === 'en' ? enCopy : zhCopy;
}

export function formatTrackDuration(seconds: number | null, copy: MusicAdminCopy): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return copy.durationUnknown;
  }

  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
