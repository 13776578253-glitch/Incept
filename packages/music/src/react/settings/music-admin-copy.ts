export type MusicAdminCopy = {
  heading: string;
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
  uploadDoneReused: string;
  uploadDoneExisting: string;
  uploadDoneMembershipAdded: string;
  uploadDoneDeactivated: string;
  formatUploadSkipped: (first: string, count: number) => string;
  formatUploadDuplicateHint: (titles: string[]) => string;
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
  unknownValue: string;
  membershipLastHint: string;
  failedPrefix: string;
  confirmDeactivateTrack: string;
  confirmDeactivateLibrary: string;
  deleteAction: string;
  deleteTrackConfirm: string;
  deleteLibraryConfirm: string;
  actionDeleteConfirm: string;
};

const zhCopy: MusicAdminCopy = {
  heading: '曲库与曲目管理',
  unavailablePrefix: '数据库不可用：',
  uploadHeading: '上传',
  uploadHint:
    '把音频拖到这里，或选择文件 / 文件夹（mp3、wav、flac、ncm，单个最大 128 MB）；ncm 会在服务端自动解密成原始音频，并用它内嵌的歌名与歌手；选文件夹时，第一层目录名作为曲库名，缺的曲库会自动创建',
  chooseFiles: '选择文件',
  chooseFolder: '选择文件夹',
  uploadLibraryLabel: '归属曲库',
  uploadNeedsLibrary: '先创建一个曲库，再上传',
  uploadQueued: '等待',
  uploadDone: '完成',
  uploadFailed: '失败',
  formatUploadProgress: (percent) => `上传中 ${percent}%`,
  uploadDoneReused: '完成（复用已有文件）',
  uploadDoneExisting: '已存在，未新增',
  uploadDoneMembershipAdded: '已加入该曲库',
  uploadDoneDeactivated: '已存在但已停用，请先恢复',
  formatUploadSkipped: (first, count) =>
    count === 1 ? `${first} 不符合格式要求` : `${first} 等 ${count} 个文件不符合格式要求`,
  formatUploadDuplicateHint: (titles) => `疑似重复：《${titles.join('、')}》`,
  tracksHeading: '曲目',
  searchPlaceholder: '搜索标题、作者或 key',
  filterAllLibraries: '全部曲库',
  tableEmpty: '还没有曲目，先在上面上传',
  tableNoMatch: '没有符合条件的曲目',
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
  libraryEmpty: '还没有曲库',
  newLibraryPlaceholder: '新曲库名字',
  newLibraryAction: '新建',
  libraryActive: '启用',
  libraryInactive: '已停用',
  libraryDeactivate: '停用',
  libraryReactivate: '恢复',
  libraryMoveMembersLabel: '成员移到',
  libraryRemoveHint: '停用后曲目会移到你选择的曲库；最后一个启用的曲库不能停用',
  unknownValue: '-',
  membershipLastHint: '每首曲目至少属于一个曲库，最后一个归属不能取消',
  failedPrefix: '操作失败：',
  confirmDeactivateTrack: '停用后可以恢复，媒体文件不会被删除',
  confirmDeactivateLibrary: '停用曲库前，必须为它的曲目指定去处',
  deleteAction: '永久删除',
  deleteTrackConfirm: '删除后无法恢复：曲目与其归属关系会被移除；镜像文件保留，由清理流程在安全时机回收',
  deleteLibraryConfirm: '只能删除没有成员的曲库；删除后无法恢复',
  actionDeleteConfirm: '确认删除',
};

const enCopy: MusicAdminCopy = {
  heading: 'Tracks and libraries',
  unavailablePrefix: 'The database is unavailable: ',
  uploadHeading: 'Upload',
  uploadHint:
    'Drop audio here, or choose files / a folder (mp3, wav, flac, ncm, 128 MB each). An .ncm file is decrypted to its original audio on the server and keeps its embedded title and artists; with a folder, the first directory name becomes the library name and a missing library is created for you.',
  chooseFiles: 'Choose files',
  chooseFolder: 'Choose folder',
  uploadLibraryLabel: 'Library',
  uploadNeedsLibrary: 'Create a library before uploading.',
  uploadQueued: 'Queued',
  uploadDone: 'Done',
  uploadFailed: 'Failed',
  formatUploadProgress: (percent) => `Uploading ${percent}%`,
  uploadDoneReused: 'Done (reused the existing file)',
  uploadDoneExisting: 'Already in the library',
  uploadDoneMembershipAdded: 'Added to this library',
  uploadDoneDeactivated: 'Exists but is deactivated; restore it first',
  formatUploadSkipped: (first, count) =>
    count === 1 ? `${first} is not a supported audio file` : `${first} and ${count - 1} more are not supported audio`,
  formatUploadDuplicateHint: (titles) => `Possible duplicate of ${titles.join(', ')}`,
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
  unknownValue: '-',
  membershipLastHint:
    'A track must belong to at least one library, so its last membership cannot be cleared.',
  failedPrefix: 'That failed: ',
  confirmDeactivateTrack: 'A deactivated track can be restored; its media file is kept.',
  confirmDeactivateLibrary: 'Before deactivating a library, choose where its tracks should go.',
  deleteAction: 'Delete permanently',
  deleteTrackConfirm:
    'This cannot be undone: the track and its memberships are removed. Its media file is kept for the cleanup pass.',
  deleteLibraryConfirm: 'Only a library without tracks can be deleted; this cannot be undone.',
  actionDeleteConfirm: 'Delete for good',
};

export function getMusicAdminCopy(locale: string): MusicAdminCopy {
  return locale === 'en' ? enCopy : zhCopy;
}

export function formatTrackDuration(seconds: number | null, copy: MusicAdminCopy): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return copy.unknownValue;
  }

  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
