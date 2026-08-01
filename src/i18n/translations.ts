import type { Locale } from '../../shared/types/ipc'

export const DEFAULT_LOCALE: Locale = 'ko'

// ko is the source of truth - every UI string in the app lives here first.
// ja/en are typed as Record<keyof typeof ko, string>, so TypeScript itself
// enforces that every key added to ko also gets a ja and en translation;
// there's no way for one locale to silently fall behind another.
const ko = {
  'nav.gallery': 'Gallery',
  'nav.list': 'List',
  'nav.detailList': 'DetailList',
  'nav.explorer': 'Explorer',
  'nav.dlsiteSearch': 'DLsite 검색',
  'nav.favorites': '즐겨찾기',
  'nav.recentlyPlayed': '최근 플레이',
  'nav.media': '미디어',
  'nav.settings': 'Settings',
  'nav.lightMode': 'Light mode',
  'nav.darkMode': 'Dark mode',

  'common.cancel': '취소',
  'common.delete': '삭제',
  'common.save': '저장',
  'common.loading': '불러오는 중...',
  'common.close': '닫기',
  'common.deleting': '삭제 중...',

  'settings.libraryTitle': '라이브러리 설정',
  'settings.addLibrary': '라이브러리 추가',
  'settings.newLibrary': '새 라이브러리',
  'settings.namePlaceholder': '이름 (비워두면 폴더명 사용)',
  'settings.pathPlaceholder': '경로 (예: D:\\Games\\DLsite)',
  'settings.pickFolder': '폴더 선택',
  'settings.dragHint': '폴더를 여기로 드래그해서 놓아도 경로가 채워집니다.',
  'settings.pathRequired': '경로를 입력하세요',
  'settings.duplicatePath': '이미 등록된 경로입니다.',
  'settings.addLibraryFailed': '라이브러리를 추가하지 못했습니다. 다시 시도해 주세요.',
  'settings.noLibraries': '등록된 라이브러리가 없습니다.',
  'settings.pathNotFound':
    '경로를 찾을 수 없습니다. 폴더가 삭제되었거나 드라이브가 연결되어 있지 않은 것 같습니다.',
  'settings.cacheManagement': '캐시 관리',
  'settings.cacheManagementDesc': '크롤링한 DLsite 정보와 캐시된 표지 이미지를 삭제합니다.',
  'settings.clearCache': '캐시 삭제',
  'settings.clearCacheDesc1':
    'DLsite에서 크롤링한 작품 정보(제목/서클/장르)와 캐시된 표지 이미지를 삭제합니다. 언제든 "메타데이터 새로고침"으로 다시 받아올 수 있습니다.',
  'settings.clearCacheDesc2': '즐겨찾기, 평점, 메모, 실행 설정, 플레이타임은 삭제되지 않습니다.',
  'settings.deleteSaveBackupsLabel': '세이브 백업 파일도 함께 삭제',
  'settings.deleteSaveBackupsDesc':
    '세이브 백업은 DLsite에서 다시 받을 수 없습니다. 원본 세이브 파일이 그대로 남아있는 경우에만 체크하세요.',
  'settings.clearCacheFailed': '캐시를 삭제하지 못했습니다. 다시 시도해 주세요.',
  'settings.localeEmulatorChecking': '확인 중...',
  'settings.localeEmulatorDetected': '설치가 감지되었습니다.',
  'settings.localeEmulatorNotDetected':
    '설치가 감지되지 않았습니다. 설치 위치를 직접 지정해 보세요.',
  'settings.reset': '초기화',
  'settings.pickLeProcPath': 'LEProc.exe 위치 지정',
  'settings.specifiedPath': '지정된 경로:',
  'settings.language': '언어',

  'search.openSearch': '검색창 열기',
  'search.placeholder': '제목, 장르, 서클명, 코드로 검색',
  'search.tagFilterPlaceholder': '태그 필터 (-태그는 제외)',
  'search.removeIncludeFilter': '{genre} 필터 제거',
  'search.removeExcludeFilter': '{genre} 제외 필터 제거',
  'search.clearFilters': '필터 해제',

  'fileKind.all': '전체',
  'fileKind.archiveOnly': '압축파일만',
  'fileKind.noArchive': '압축파일 제외',

  'scan.progressWithCount': '{count}개 항목 스캔 중...',
  'scan.progress': '스캔 중...',

  'library.visibilitySettings': '라이브러리 표시 설정',
  'library.visibleLibraries': '표시할 라이브러리',
  'library.showAll': '모두 표시',

  'bulkCrawl.fetching': 'DLsite 정보 가져오는 중... ({completed}/{total})',

  'pageToolbar.name': '이름',
  'pageToolbar.mtime': '변경시간',
  'pageToolbar.extension': '확장자',
  'pageToolbar.toggleSortDirection': '정렬 방향 전환',

  'duplicatesOnly.label': '중복만',
  'duplicatesOnly.tooltip': '중복만 보기',

  'selection.select': '선택',
  'selection.selectedCount': '{count}개 선택됨',
  'selection.selectAll': '전체 선택',
  'selection.rename': '이름 변경',
  'selection.move': '이동',

  'codeLink.manage': '코드 연동 관리',
  'codeLink.filenameCodeNoUnlink': '파일명에서 인식된 코드는 연동 해제를 지원하지 않습니다.',
  'codeLink.linkHint':
    '폴더명을 직접 바꾸면 기존 즐겨찾기/평점 기록이 유지되지 않습니다. 데이터를 유지하려면 여기서 코드를 연동하세요.',
  'codeLink.codePlaceholder': 'RJ01234567',
  'codeLink.next': '다음',
  'codeLink.confirmLinkMessage':
    '{code}(으)로 연동합니다. 잘못 연동했다면 나중에 "연동 해제"로 연동을 해제할 수 있습니다.',
  'codeLink.linkFailed': '연동에 실패했습니다. 다시 시도해주세요.',
  'codeLink.back': '뒤로',
  'codeLink.confirmLink': '연동 확정',
  'codeLink.unlink': '연동 해제',
  'codeLink.confirmUnlinkMessage1':
    '{code} 연동을 해제합니다. 이후 이 폴더는 다시 코드없는 항목으로 표시됩니다.',
  'codeLink.confirmUnlinkMessage2':
    '지금까지 쌓인 즐겨찾기·평점·메모·플레이타임 기록은 삭제되지 않고 {code} 코드에 그대로 남습니다. 같은 코드로 다시 연동하면 기록이 복원되지만, 다른 코드로 연동하면 이 기록을 다시 찾을 수 없게 됩니다.',
  'codeLink.dialogTitle': '코드 연동',
  'codeLink.unlinkDialogTitle': '연동 해제',

  'ratingMemo.rating': '평점',
  'ratingMemo.memo': '메모',
  'ratingMemo.memoPlaceholder': '메모',
  'ratingMemo.saving': '저장 중...',
  'ratingMemo.saved': '저장됨',
  'ratingMemo.dialogTitle': '평점 / 메모',

  'launchConfig.title': '실행 설정',
  'launchConfig.dialogTitle': '실행/저장 설정',
  'launchConfig.archiveNotSupported':
    '압축파일은 실행 설정을 지원하지 않습니다. 먼저 압축을 해제해 주세요.',
  'launchConfig.executable': '실행파일',
  'launchConfig.noExeFound': 'exe 파일을 찾을 수 없습니다.',
  'launchConfig.launchMode': '실행 방식',
  'launchConfig.normalLaunch': '일반 실행',
  'launchConfig.localeEmulatorLaunch': 'Locale Emulator로 실행',
  'launchConfig.notInstalled': ' (설치되어 있지 않음)',
  'launchConfig.saveLaunchConfig': '실행 설정 저장',
  'launchConfig.saveBackupLocation': '세이브 파일 백업 위치',
  'launchConfig.pickSaveFolder': '세이브 폴더 지정',
  'launchConfig.backupNow': '지금 백업',
} as const

const ja: Record<keyof typeof ko, string> = {
  'nav.gallery': 'ギャラリー',
  'nav.list': 'リスト',
  'nav.detailList': '詳細リスト',
  'nav.explorer': 'エクスプローラー',
  'nav.dlsiteSearch': 'DLsite検索',
  'nav.favorites': 'お気に入り',
  'nav.recentlyPlayed': '最近プレイ',
  'nav.media': 'メディア',
  'nav.settings': '設定',
  'nav.lightMode': 'ライトモード',
  'nav.darkMode': 'ダークモード',

  'common.cancel': 'キャンセル',
  'common.delete': '削除',
  'common.save': '保存',
  'common.loading': '読み込み中...',
  'common.close': '閉じる',
  'common.deleting': '削除中...',

  'settings.libraryTitle': 'ライブラリ設定',
  'settings.addLibrary': 'ライブラリ追加',
  'settings.newLibrary': '新しいライブラリ',
  'settings.namePlaceholder': '名前（空欄の場合はフォルダ名を使用）',
  'settings.pathPlaceholder': 'パス（例: D:\\Games\\DLsite）',
  'settings.pickFolder': 'フォルダ選択',
  'settings.dragHint': 'フォルダをここにドラッグしてもパスが入力されます。',
  'settings.pathRequired': 'パスを入力してください',
  'settings.duplicatePath': 'すでに登録されているパスです。',
  'settings.addLibraryFailed': 'ライブラリを追加できませんでした。もう一度お試しください。',
  'settings.noLibraries': '登録されたライブラリがありません。',
  'settings.pathNotFound':
    'パスが見つかりません。フォルダが削除されたか、ドライブが接続されていないようです。',
  'settings.cacheManagement': 'キャッシュ管理',
  'settings.cacheManagementDesc': 'クロールしたDLsite情報とキャッシュされた表紙画像を削除します。',
  'settings.clearCache': 'キャッシュ削除',
  'settings.clearCacheDesc1':
    'DLsiteからクロールした作品情報（タイトル/サークル/ジャンル）とキャッシュされた表紙画像を削除します。いつでも「メタデータ更新」で再取得できます。',
  'settings.clearCacheDesc2': 'お気に入り、評価、メモ、実行設定、プレイ時間は削除されません。',
  'settings.deleteSaveBackupsLabel': 'セーブバックアップファイルも一緒に削除',
  'settings.deleteSaveBackupsDesc':
    'セーブバックアップはDLsiteから再取得できません。元のセーブファイルがそのまま残っている場合のみチェックしてください。',
  'settings.clearCacheFailed': 'キャッシュを削除できませんでした。もう一度お試しください。',
  'settings.localeEmulatorChecking': '確認中...',
  'settings.localeEmulatorDetected': 'インストールが検出されました。',
  'settings.localeEmulatorNotDetected':
    'インストールが検出されませんでした。インストール場所を直接指定してください。',
  'settings.reset': 'リセット',
  'settings.pickLeProcPath': 'LEProc.exeの場所を指定',
  'settings.specifiedPath': '指定されたパス:',
  'settings.language': '言語',

  'search.openSearch': '検索ボックスを開く',
  'search.placeholder': 'タイトル、ジャンル、サークル名、コードで検索',
  'search.tagFilterPlaceholder': 'タグフィルター（-タグで除外）',
  'search.removeIncludeFilter': '{genre}フィルターを削除',
  'search.removeExcludeFilter': '{genre}除外フィルターを削除',
  'search.clearFilters': 'フィルター解除',

  'fileKind.all': 'すべて',
  'fileKind.archiveOnly': '圧縮ファイルのみ',
  'fileKind.noArchive': '圧縮ファイルを除外',

  'scan.progressWithCount': '{count}件スキャン中...',
  'scan.progress': 'スキャン中...',

  'library.visibilitySettings': 'ライブラリ表示設定',
  'library.visibleLibraries': '表示するライブラリ',
  'library.showAll': 'すべて表示',

  'bulkCrawl.fetching': 'DLsite情報を取得中... ({completed}/{total})',

  'pageToolbar.name': '名前',
  'pageToolbar.mtime': '更新日時',
  'pageToolbar.extension': '拡張子',
  'pageToolbar.toggleSortDirection': '並べ替え方向を切り替え',

  'duplicatesOnly.label': '重複のみ',
  'duplicatesOnly.tooltip': '重複のみ表示',

  'selection.select': '選択',
  'selection.selectedCount': '{count}件選択',
  'selection.selectAll': 'すべて選択',
  'selection.rename': '名前変更',
  'selection.move': '移動',

  'codeLink.manage': 'コード連携管理',
  'codeLink.filenameCodeNoUnlink': 'ファイル名から認識されたコードは連携解除に対応していません。',
  'codeLink.linkHint':
    'フォルダ名を直接変更すると、既存のお気に入り/評価の記録が維持されません。データを維持するには、ここでコードを連携してください。',
  'codeLink.codePlaceholder': 'RJ01234567',
  'codeLink.next': '次へ',
  'codeLink.confirmLinkMessage':
    '{code}に連携します。連携を間違えた場合は、後で「連携解除」で解除できます。',
  'codeLink.linkFailed': '連携に失敗しました。もう一度お試しください。',
  'codeLink.back': '戻る',
  'codeLink.confirmLink': '連携確定',
  'codeLink.unlink': '連携解除',
  'codeLink.confirmUnlinkMessage1':
    '{code}の連携を解除します。以降、このフォルダは再びコードなし項目として表示されます。',
  'codeLink.confirmUnlinkMessage2':
    'これまで蓄積されたお気に入り・評価・メモ・プレイ時間の記録は削除されず、{code}コードにそのまま残ります。同じコードで再連携すると記録が復元されますが、別のコードで連携するとこの記録は見つけられなくなります。',
  'codeLink.dialogTitle': 'コード連携',
  'codeLink.unlinkDialogTitle': '連携解除',

  'ratingMemo.rating': '評価',
  'ratingMemo.memo': 'メモ',
  'ratingMemo.memoPlaceholder': 'メモ',
  'ratingMemo.saving': '保存中...',
  'ratingMemo.saved': '保存済み',
  'ratingMemo.dialogTitle': '評価 / メモ',

  'launchConfig.title': '実行設定',
  'launchConfig.dialogTitle': '実行/保存設定',
  'launchConfig.archiveNotSupported':
    '圧縮ファイルは実行設定に対応していません。先に解凍してください。',
  'launchConfig.executable': '実行ファイル',
  'launchConfig.noExeFound': 'exeファイルが見つかりません。',
  'launchConfig.launchMode': '実行方式',
  'launchConfig.normalLaunch': '通常実行',
  'launchConfig.localeEmulatorLaunch': 'Locale Emulatorで実行',
  'launchConfig.notInstalled': '（インストールされていません）',
  'launchConfig.saveLaunchConfig': '実行設定を保存',
  'launchConfig.saveBackupLocation': 'セーブファイルのバックアップ場所',
  'launchConfig.pickSaveFolder': 'セーブフォルダ指定',
  'launchConfig.backupNow': '今すぐバックアップ',
}

const en: Record<keyof typeof ko, string> = {
  'nav.gallery': 'Gallery',
  'nav.list': 'List',
  'nav.detailList': 'DetailList',
  'nav.explorer': 'Explorer',
  'nav.dlsiteSearch': 'DLsite Search',
  'nav.favorites': 'Favorites',
  'nav.recentlyPlayed': 'Recently Played',
  'nav.media': 'Media',
  'nav.settings': 'Settings',
  'nav.lightMode': 'Light mode',
  'nav.darkMode': 'Dark mode',

  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.save': 'Save',
  'common.loading': 'Loading...',
  'common.close': 'Close',
  'common.deleting': 'Deleting...',

  'settings.libraryTitle': 'Library Settings',
  'settings.addLibrary': 'Add Library',
  'settings.newLibrary': 'New Library',
  'settings.namePlaceholder': 'Name (leave blank to use folder name)',
  'settings.pathPlaceholder': 'Path (e.g. D:\\Games\\DLsite)',
  'settings.pickFolder': 'Pick Folder',
  'settings.dragHint': 'You can also drag a folder here to fill in the path.',
  'settings.pathRequired': 'Please enter a path',
  'settings.duplicatePath': 'This path is already registered.',
  'settings.addLibraryFailed': 'Failed to add library. Please try again.',
  'settings.noLibraries': 'No libraries registered.',
  'settings.pathNotFound':
    'Path not found. The folder may have been deleted or the drive may be disconnected.',
  'settings.cacheManagement': 'Cache Management',
  'settings.cacheManagementDesc': 'Delete crawled DLsite info and cached cover images.',
  'settings.clearCache': 'Clear Cache',
  'settings.clearCacheDesc1':
    'Deletes crawled DLsite info (title/circle/genres) and cached cover images. You can always fetch it again with "Refresh Metadata".',
  'settings.clearCacheDesc2':
    'Favorites, ratings, memos, launch settings, and playtime are not deleted.',
  'settings.deleteSaveBackupsLabel': 'Also delete save backup files',
  'settings.deleteSaveBackupsDesc':
    'Save backups cannot be recovered from DLsite. Only check this if the original save files still exist.',
  'settings.clearCacheFailed': 'Failed to clear cache. Please try again.',
  'settings.localeEmulatorChecking': 'Checking...',
  'settings.localeEmulatorDetected': 'Installation detected.',
  'settings.localeEmulatorNotDetected':
    'No installation detected. Try specifying the install location manually.',
  'settings.reset': 'Reset',
  'settings.pickLeProcPath': 'Set LEProc.exe Location',
  'settings.specifiedPath': 'Specified path:',
  'settings.language': 'Language',

  'search.openSearch': 'Open search',
  'search.placeholder': 'Search by title, genre, circle, or code',
  'search.tagFilterPlaceholder': 'Tag filter (-tag to exclude)',
  'search.removeIncludeFilter': 'Remove {genre} filter',
  'search.removeExcludeFilter': 'Remove {genre} exclude filter',
  'search.clearFilters': 'Clear filters',

  'fileKind.all': 'All',
  'fileKind.archiveOnly': 'Archives only',
  'fileKind.noArchive': 'Exclude archives',

  'scan.progressWithCount': 'Scanning {count} items...',
  'scan.progress': 'Scanning...',

  'library.visibilitySettings': 'Library visibility',
  'library.visibleLibraries': 'Visible libraries',
  'library.showAll': 'Show all',

  'bulkCrawl.fetching': 'Fetching DLsite info... ({completed}/{total})',

  'pageToolbar.name': 'Name',
  'pageToolbar.mtime': 'Modified',
  'pageToolbar.extension': 'Extension',
  'pageToolbar.toggleSortDirection': 'Toggle sort direction',

  'duplicatesOnly.label': 'Duplicates',
  'duplicatesOnly.tooltip': 'Show duplicates only',

  'selection.select': 'Select',
  'selection.selectedCount': '{count} selected',
  'selection.selectAll': 'Select all',
  'selection.rename': 'Rename',
  'selection.move': 'Move',

  'codeLink.manage': 'Manage code link',
  'codeLink.filenameCodeNoUnlink': 'A code recognized from the filename cannot be unlinked.',
  'codeLink.linkHint':
    "Renaming the folder directly won't keep existing favorite/rating records. Link a code here to keep your data.",
  'codeLink.codePlaceholder': 'RJ01234567',
  'codeLink.next': 'Next',
  'codeLink.confirmLinkMessage':
    'This will link to {code}. If linked by mistake, you can unlink it later with "Unlink".',
  'codeLink.linkFailed': 'Failed to link. Please try again.',
  'codeLink.back': 'Back',
  'codeLink.confirmLink': 'Confirm Link',
  'codeLink.unlink': 'Unlink',
  'codeLink.confirmUnlinkMessage1':
    'This will unlink {code}. This folder will show as code-less again afterward.',
  'codeLink.confirmUnlinkMessage2':
    'Favorite/rating/memo/playtime data accumulated so far is not deleted and stays under code {code}. Re-linking the same code restores it, but linking a different code makes this data unreachable.',
  'codeLink.dialogTitle': 'Link Code',
  'codeLink.unlinkDialogTitle': 'Unlink',

  'ratingMemo.rating': 'Rating',
  'ratingMemo.memo': 'Memo',
  'ratingMemo.memoPlaceholder': 'Memo',
  'ratingMemo.saving': 'Saving...',
  'ratingMemo.saved': 'Saved',
  'ratingMemo.dialogTitle': 'Rating / Memo',

  'launchConfig.title': 'Launch Settings',
  'launchConfig.dialogTitle': 'Launch/Save Settings',
  'launchConfig.archiveNotSupported':
    'Archive files do not support launch settings. Please extract it first.',
  'launchConfig.executable': 'Executable',
  'launchConfig.noExeFound': 'No .exe file found.',
  'launchConfig.launchMode': 'Launch Mode',
  'launchConfig.normalLaunch': 'Normal',
  'launchConfig.localeEmulatorLaunch': 'Run with Locale Emulator',
  'launchConfig.notInstalled': ' (not installed)',
  'launchConfig.saveLaunchConfig': 'Save Launch Settings',
  'launchConfig.saveBackupLocation': 'Save Backup Location',
  'launchConfig.pickSaveFolder': 'Pick Save Folder',
  'launchConfig.backupNow': 'Backup Now',
}

export const translations = { ko, ja, en }
export type TranslationKey = keyof typeof ko
