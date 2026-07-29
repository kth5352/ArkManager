export interface FilterableMetadata {
  title: string | null
  circle: string | null
  genres: string[]
}

export interface FilterableEntry {
  name: string
  code: { type: 'RJ' | 'VJ' | 'ST'; value: string } | null
}

export function filterEntries<T extends FilterableEntry>(
  entries: T[],
  metadataByCode: Record<string, FilterableMetadata>,
  query: string,
  excludedGenres: string[]
): T[] {
  const normalizedQuery = query.trim().toLowerCase()

  return entries.filter((entry) => {
    const metadata = entry.code ? metadataByCode[entry.code.value] : undefined

    if (excludedGenres.length > 0 && metadata) {
      const hasExcludedGenre = metadata.genres.some((genre) => excludedGenres.includes(genre))
      if (hasExcludedGenre) return false
    }

    if (normalizedQuery === '') return true

    const haystacks = [
      entry.name,
      entry.code?.value ?? '',
      metadata?.title ?? '',
      metadata?.circle ?? '',
    ]
    return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery))
  })
}
