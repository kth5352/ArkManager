import { useQuery } from '@tanstack/react-query'
import { generateMockGames, type MockGame } from './mockGames'

export function useGames() {
  return useQuery<MockGame[]>({
    queryKey: ['games', 'mock'],
    queryFn: () => new Promise((resolve) => setTimeout(() => resolve(generateMockGames(120)), 400)),
  })
}
