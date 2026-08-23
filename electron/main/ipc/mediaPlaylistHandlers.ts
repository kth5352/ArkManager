import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  CreateMediaPlaylistRequestSchema,
  RenameMediaPlaylistRequestSchema,
  DeleteMediaPlaylistRequestSchema,
  GetMediaPlaylistTracksRequestSchema,
  SetMediaPlaylistTracksRequestSchema,
  IsTrackLikedRequestSchema,
  ToggleTrackLikeRequestSchema,
  type MediaPlaylistDto,
} from '../../../shared/types/ipc'
import {
  listMediaPlaylists,
  createMediaPlaylist,
  renameMediaPlaylist,
  deleteMediaPlaylist,
  getMediaPlaylistTracks,
  setMediaPlaylistTracks,
} from '../database/mediaPlaylistsRepository'
import { isTrackLiked, toggleTrackLike, listLikedTracks } from '../database/mediaTrackLikesRepository'
import type { AppDatabase } from '../database/client'

export function registerMediaPlaylistHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_LIST, (): MediaPlaylistDto[] => listMediaPlaylists(db))

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_CREATE, (_event, payload: unknown): MediaPlaylistDto => {
    const { name } = CreateMediaPlaylistRequestSchema.parse(payload)
    const id = randomUUID()
    createMediaPlaylist(db, id, name)
    return listMediaPlaylists(db).find((playlist) => playlist.id === id)!
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_RENAME, (_event, payload: unknown) => {
    const { id, name } = RenameMediaPlaylistRequestSchema.parse(payload)
    renameMediaPlaylist(db, id, name)
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_DELETE, (_event, payload: unknown) => {
    const { id } = DeleteMediaPlaylistRequestSchema.parse(payload)
    deleteMediaPlaylist(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_GET_TRACKS, (_event, payload: unknown) => {
    const { id } = GetMediaPlaylistTracksRequestSchema.parse(payload)
    return getMediaPlaylistTracks(db, id)
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_SET_TRACKS, (_event, payload: unknown) => {
    const { id, tracks } = SetMediaPlaylistTracksRequestSchema.parse(payload)
    setMediaPlaylistTracks(db, id, tracks)
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_TRACK_LIKE_LIST, () => listLikedTracks(db))

  ipcMain.handle(IPC_CHANNELS.MEDIA_TRACK_LIKE_IS_LIKED, (_event, payload: unknown): boolean => {
    const { path } = IsTrackLikedRequestSchema.parse(payload)
    return isTrackLiked(db, path)
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_TRACK_LIKE_TOGGLE, (_event, payload: unknown) => {
    const { path, name } = ToggleTrackLikeRequestSchema.parse(payload)
    toggleTrackLike(db, path, name)
  })
}
