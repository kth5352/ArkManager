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
  includedGenres: string[],
  excludedGenres: string[]
): T[] {
  const normalizedQuery = query.trim().toLowerCase()

  return entries.filter((entry) => {
    const metadata = entry.code ? metadataByCode[entry.code.value] : undefined

    // Unlike excludedGenres below, an entry with no metadata (genres
    // unknown) can never be confirmed to have every included genre - err on
    // the side of hiding it rather than showing something that might not
    // match, since the user asked to see only entries with these genres.
    if (includedGenres.length > 0) {
      if (!metadata) return false
      const hasAllIncluded = includedGenres.every((genre) => metadata.genres.includes(genre))
      if (!hasAllIncluded) return false
    }

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
